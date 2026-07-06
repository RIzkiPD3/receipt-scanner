import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WhatsAppWebhookPayload } from './interfaces/webhook-payload.interface';
import { WhatsAppParser } from './whatsapp-parser.service';
import { PdfRequestHandler } from './services/pdf-request.handler';

// =============================================================================
// WebhookService
// =============================================================================
// Bertanggung jawab atas dua hal:
//   1. Memverifikasi token saat Meta melakukan handshake webhook (GET)
//   2. Menerima dan mem-log event webhook masuk (POST)
//
// Di TASK-008, Service ini menggunakan WhatsAppParser untuk menyaring dan
// mengurai payload menjadi objek internal IncomingMessage, lalu mencatatnya
// ke logger.
//
// Di TASK-017, Service ini mengintegrasikan PdfRequestHandler untuk memproses
// pesan interaktif tombol balasan "Buatkan PDF" dari pengguna.
// =============================================================================

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly parser: WhatsAppParser,
    private readonly pdfRequestHandler: PdfRequestHandler,
  ) {}

  // ---------------------------------------------------------------------------
  // verifyWebhook
  // ---------------------------------------------------------------------------
  // Dipanggil oleh GET /api/webhook saat Meta melakukan verifikasi awal.
  //
  // Alur verifikasi Meta:
  //   1. Meta mengirim GET dengan hub.mode=subscribe, hub.verify_token, hub.challenge
  //   2. Kita bandingkan hub.verify_token dengan WHATSAPP_VERIFY_TOKEN di .env
  //   3. Jika cocok, kita kembalikan hub.challenge sebagai plain text
  //   4. Jika tidak cocok, kita lempar ForbiddenException → 403
  //
  // ForbiddenException dipilih (bukan UnauthorizedException/401) karena:
  //   - 401 mengimplikasikan autentikasi diperlukan (login)
  //   - 403 lebih tepat: request diidentifikasi tapi ditolak karena token salah
  // ---------------------------------------------------------------------------
  verifyWebhook(mode: string, token: string, challenge: string): string {
    const verifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN');

    this.logger.log(
      `Webhook verification attempt — mode: ${mode}`,
      WebhookService.name,
    );

    if (mode !== 'subscribe' || token !== verifyToken) {
      this.logger.warn(
        `Webhook verification FAILED — token mismatch or invalid mode`,
        WebhookService.name,
      );
      throw new ForbiddenException('Webhook verification failed: invalid token or mode.');
    }

    this.logger.log(
      'Webhook verified successfully ✅',
      WebhookService.name,
    );

    return challenge;
  }

  // ---------------------------------------------------------------------------
  // handleWebhookEvent
  // ---------------------------------------------------------------------------
  // Dipanggil oleh POST /api/webhook setiap kali Meta mengirim event.
  //
  // Strategi logging terstruktur:
  //   - Log level INFO untuk event normal (pesan masuk, status update)
  //   - Log level WARN untuk event tanpa pesan (misalnya hanya status delivery)
  //   - Log level ERROR untuk entry yang mengandung error dari Meta
  //   - Data sensitif (konten pesan) hanya di-log pada level DEBUG
  //
  // Mengapa return void dan bukan throw error?
  //   Meta mengharapkan response 200 OK secepatnya. Jika kita throw error,
  //   Meta akan retry dan bisa mengakibatkan pemrosesan duplikat.
  //   Error handling internal dicatat ke logger tanpa mempengaruhi response.
  // ---------------------------------------------------------------------------
  handleWebhookEvent(payload: WhatsAppWebhookPayload): void {
    // Validasi struktur dasar payload
    if (!payload || payload.object !== 'whatsapp_business_account') {
      this.logger.warn(
        `Received unknown webhook object: ${payload?.object ?? 'undefined'}`,
        WebhookService.name,
      );
      return;
    }

    // Panggil Parser untuk mengurai data pesan masuk
    const parsedMessages = this.parser.parse(payload);
    for (const msg of parsedMessages) {
      this.logger.log(
        `[Parsed Message] Tipe: ${msg.type.toUpperCase()} | Pengirim: ${msg.from} | MsgID: ${msg.messageId}`,
        WebhookService.name,
      );
      this.logger.debug(
        `Detail Pesan Terurai: ${JSON.stringify(msg)}`,
        WebhookService.name,
      );

      // Pemicu pembuatan PDF on-demand (fire-and-forget)
      if (msg.type === 'interactive' && msg.buttonReplyId) {
        if (this.pdfRequestHandler.isPdfRequest(msg.buttonReplyId)) {
          this.pdfRequestHandler
            .handle(msg.from, msg.buttonReplyId)
            .catch((err) =>
              this.logger.error(
                `Background PDF handler gagal untuk ${msg.from}`,
                err instanceof Error ? err.stack : String(err),
                WebhookService.name,
              ),
            );
        }
      }
    }

    // Iterasi setiap entry (bisa lebih dari satu dalam satu payload) untuk status & error
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const { value } = change;

        if (!value) {
          continue;
        }

        // --- Event: Status Update (sent/delivered/read/failed) ---
        if (value.statuses && value.statuses.length > 0) {
          for (const status of value.statuses) {
            this.logger.log(
              `📬 Status update — messageId: ${status.id}, status: ${status.status}, recipient: ${status.recipient_id}`,
              WebhookService.name,
            );
          }
        }

        // --- Event: Error dari Meta ---
        if (value.errors && value.errors.length > 0) {
          for (const error of value.errors) {
            this.logger.error(
              `❌ Webhook error from Meta — code: ${error.code}, title: ${error.title}`,
              error.error_data?.details ?? '',
              WebhookService.name,
            );
          }
        }
      }
    }
  }
}
