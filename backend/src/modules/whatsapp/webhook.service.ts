import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsAppWebhookPayload } from './interfaces/webhook-payload.interface';

// =============================================================================
// WebhookService
// =============================================================================
// Bertanggung jawab atas dua hal:
//   1. Memverifikasi token saat Meta melakukan handshake webhook (GET)
//   2. Menerima dan mem-log event webhook masuk (POST)
//
// Service ini sengaja TIDAK melakukan pemrosesan bisnis apapun di TASK-007.
// Method handleWebhookEvent() hanya melakukan parsing dan logging terstruktur,
// sebagai fondasi untuk hook di task-task selanjutnya.
// =============================================================================

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private readonly configService: ConfigService) {}

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

    // Iterasi setiap entry (bisa lebih dari satu dalam satu payload)
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const { value } = change;

        if (!value) {
          continue;
        }

        // --- Event: Pesan Masuk ---
        if (value.messages && value.messages.length > 0) {
          for (const message of value.messages) {
            this.logger.log(
              `📨 Incoming message — from: ${message.from}, type: ${message.type}, messageId: ${message.id}`,
              WebhookService.name,
            );

            // Log konten hanya di level DEBUG (tidak aktif di production)
            this.logger.debug(
              `Message detail: ${JSON.stringify(message)}`,
              WebhookService.name,
            );
          }
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
