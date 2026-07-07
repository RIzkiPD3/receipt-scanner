import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WhatsAppWebhookPayload } from './interfaces/webhook-payload.interface';
import { WhatsAppParser } from './whatsapp-parser.service';
import { PdfRequestHandler } from './services/pdf-request.handler';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppMediaService } from './services/whatsapp-media.service';
import { WorkerClient } from '../worker/client/worker.client';

// =============================================================================
// WebhookService
// =============================================================================
// Mengelola webhook Meta WhatsApp Cloud API.
//   1. Verifikasi handshake token (GET)
//   2. Memproses event WhatsApp masuk (POST) secara asinkron
//      - Jika bertipe 'image' -> unduh media, simpan PENDING receipt, panggil worker
//      - Jika bertipe 'interactive' -> generate PDF via PdfRequestHandler
// =============================================================================

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly parser: WhatsAppParser,
    private readonly pdfRequestHandler: PdfRequestHandler,
    private readonly mediaService: WhatsAppMediaService,
    private readonly workerClient: WorkerClient,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Handshake verifikasi token dengan Meta Developer Platform.
   */
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
      throw new ForbiddenException(
        'Webhook verification failed: invalid token or mode.',
      );
    }

    this.logger.log('Webhook verified successfully ✅', WebhookService.name);

    return challenge;
  }

  /**
   * Menangani event WhatsApp masuk dari Meta.
   */
  handleWebhookEvent(payload: WhatsAppWebhookPayload): void {
    if (!payload || payload.object !== 'whatsapp_business_account') {
      this.logger.warn(
        `Received unknown webhook object: ${payload?.object ?? 'undefined'}`,
        WebhookService.name,
      );
      return;
    }

    const parsedMessages = this.parser.parse(payload);
    for (const msg of parsedMessages) {
      this.logger.log(
        `[Parsed Message] Tipe: ${msg.type.toUpperCase()} | Pengirim: ${msg.from} | MsgID: ${msg.messageId}`,
        WebhookService.name,
      );

      // ── 1. Pesan Gambar (Struk) ──
      if (msg.type === 'image' && msg.mediaId) {
        this.logger.log(
          `Webhook received: gambar struk dari ${msg.from} (MediaID: ${msg.mediaId})`,
          WebhookService.name,
        );
        this.processReceiptImageBackground(
          msg.from,
          msg.mediaId,
          msg.messageId,
        ).catch((err) =>
          this.logger.error(
            `Background Receipt Image handler gagal untuk ${msg.from}`,
            err instanceof Error ? err.stack : String(err),
            WebhookService.name,
          ),
        );
      }

      // ── 2. Pesan Interaktif (Tombol PDF) ──
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

    // Logging status pengiriman (delivery reports) & error dari Meta
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const { value } = change;
        if (!value) continue;

        if (value.statuses && value.statuses.length > 0) {
          for (const status of value.statuses) {
            this.logger.log(
              `📬 Status update — messageId: ${status.id}, status: ${status.status}, recipient: ${status.recipient_id}`,
              WebhookService.name,
            );
          }
        }

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

  /**
   * Mengunduh gambar struk, menyimpannya di DB (PENDING), lalu memicu Go worker secara asinkron.
   */
  private async processReceiptImageBackground(
    from: string,
    mediaId: string,
    messageId: string,
  ) {
    this.logger.log(
      `[OCR Pipeline] Menerima gambar struk dari ${from}. Memulai pengolahan...`,
      WebhookService.name,
    );

    // 1. Dapatkan atau buat User di DB
    let user = await this.prisma.user.findUnique({
      where: { phoneNumber: from },
    });
    if (!user) {
      this.logger.log(
        `Membuat user baru untuk nomor telepon ${from}...`,
        WebhookService.name,
      );
      user = await this.prisma.user.create({
        data: {
          phoneNumber: from,
          name: `WhatsApp User ${from.substring(from.length - 4)}`,
        },
      });
    }

    // 2. Download media dari WhatsApp Cloud API
    const downloadStart = Date.now();
    const downloadedFile = await this.mediaService.downloadMedia(mediaId);
    const downloadDuration = Date.now() - downloadStart;
    this.logger.log(
      `[Performance] Media Download took ${downloadDuration}ms untuk mediaId: ${mediaId}`,
      WebhookService.name,
    );
    this.logger.log(
      `Media downloaded: ${downloadedFile.filename}`,
      WebhookService.name,
    );

    // 3. Bangun URL publik gambar
    const appUrl =
      this.configService.get<string>('APP_URL') || 'http://localhost:3000';
    const imageUrl = `${appUrl}/uploads/${downloadedFile.filename}`;

    // 4. Simpan Receipt awal berstatus PENDING di database
    const dbSaveStart = Date.now();
    const receipt = await this.prisma.receipt.create({
      data: {
        userId: user.id,
        whatsappMessageId: messageId,
        whatsappMediaId: mediaId,
        imageUrl: imageUrl,
        status: 'PENDING',
      },
    });
    const dbSaveDuration = Date.now() - dbSaveStart;
    this.logger.log(
      `[Performance] Database Save took ${dbSaveDuration}ms untuk receiptId: ${receipt.id}`,
      WebhookService.name,
    );
    this.logger.log(
      `Receipt saved (PENDING) ID: ${receipt.id}`,
      WebhookService.name,
    );

    // 5. Hubungi Go Worker secara asinkron (fire-and-forget)
    this.logger.log(
      `[OCR Pipeline] Mengirim receiptId ${receipt.id} ke Golang Worker secara asinkron...`,
      WebhookService.name,
    );

    this.workerClient
      .sendToWorker(receipt.id, imageUrl)
      .then((res) => {
        this.logger.log(
          `[OCR Pipeline] Golang Worker sukses memproses receiptId ${receipt.id}: status=${res.status}, message=${res.message}`,
          WebhookService.name,
        );
      })
      .catch((err) => {
        this.logger.error(
          `[OCR Pipeline] Gagal mengirim receiptId ${receipt.id} ke Golang Worker`,
          err instanceof Error ? err.stack : String(err),
          WebhookService.name,
        );
      });
  }
}
