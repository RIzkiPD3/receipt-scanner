import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppGraphClient } from '../client/whatsapp-graph.client';
import { InvoiceMessageFormatter } from '../formatter/invoice-message.formatter';

// =============================================================================
// WhatsAppNotificationService
// =============================================================================
// Bertanggung jawab mengorkestrasi pengiriman notifikasi WhatsApp setelah
// Invoice berhasil dibuat. Service ini memisahkan:
//
//   - InvoiceMessageFormatter → memformat pesan teks
//   - WhatsAppGraphClient    → mengirim pesan via Meta Graph API
//
// Error handling yang diterapkan:
//   - Kegagalan pengiriman WhatsApp TIDAK mem-rollback invoice yang sudah dibuat.
//   - Error selalu di-log, dan exception di-suppress agar tidak mempengaruhi
//     response HTTP yang sudah dikembalikan ke caller (InvoicesService).
// =============================================================================

@Injectable()
export class WhatsAppNotificationService {
  private readonly logger = new Logger(WhatsAppNotificationService.name);

  constructor(
    private readonly graphClient: WhatsAppGraphClient,
    private readonly formatter: InvoiceMessageFormatter,
  ) {}

  /**
   * Mengirim ringkasan invoice ke nomor WhatsApp pengguna.
   *
   * @param phoneNumber Nomor telepon dalam format internasional tanpa +
   *                    Contoh: "628123456789"
   * @param invoice     Entitas invoice lengkap dari database
   */
  async sendInvoiceSummary(phoneNumber: string, invoice: any): Promise<void> {
    this.logger.log(
      `Memulai pengiriman notifikasi invoice ${invoice.invoiceNumber} ke ${phoneNumber}`,
      WhatsAppNotificationService.name,
    );

    // Validasi nomor telepon minimal
    if (!phoneNumber || phoneNumber.trim().length < 7) {
      this.logger.warn(
        `Nomor telepon tidak valid atau kosong: "${phoneNumber}". Pengiriman dibatalkan.`,
        WhatsAppNotificationService.name,
      );
      return;
    }

    // Format pesan dari entitas invoice
    let message: string;
    try {
      this.logger.log(`Memformat pesan invoice...`, WhatsAppNotificationService.name);
      message = this.formatter.format(invoice);
      this.logger.log(
        `Pesan berhasil diformat (${message.length} karakter).`,
        WhatsAppNotificationService.name,
      );
    } catch (formatErr: any) {
      this.logger.error(
        `Gagal memformat pesan invoice ${invoice.invoiceNumber}`,
        formatErr instanceof Error ? formatErr.stack : String(formatErr),
        WhatsAppNotificationService.name,
      );
      return; // Jangan kirim jika format gagal; invoice tetap tersimpan
    }

    // Kirim pesan melalui Meta Graph API
    try {
      this.logger.log(
        `Mengirim pesan WhatsApp ke ${phoneNumber}...`,
        WhatsAppNotificationService.name,
      );
      await this.graphClient.sendTextMessage(phoneNumber, message);
      this.logger.log(
        `✅ Notifikasi invoice ${invoice.invoiceNumber} berhasil dikirim ke ${phoneNumber}`,
        WhatsAppNotificationService.name,
      );
    } catch (sendErr: any) {
      // Kegagalan pengiriman WhatsApp TIDAK membatalkan invoice yang sudah tersimpan
      this.logger.error(
        `❌ Gagal mengirim notifikasi WhatsApp untuk invoice ${invoice.invoiceNumber} ke ${phoneNumber}. Invoice tetap valid.`,
        sendErr instanceof Error ? sendErr.stack : String(sendErr),
        WhatsAppNotificationService.name,
      );
      // Suppress error — jangan propagate ke caller
    }
  }
}
