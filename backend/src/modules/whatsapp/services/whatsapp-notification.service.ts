import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppGraphClient } from '../client/whatsapp-graph.client';
import { InvoiceMessageFormatter } from '../formatter/invoice-message.formatter';
import { PdfService } from '../../pdf/services/pdf.service';

// =============================================================================
// WhatsAppNotificationService
// =============================================================================
// Bertanggung jawab mengorkestrasi pengiriman notifikasi WhatsApp setelah
// Invoice berhasil dibuat. Service ini memisahkan:
//
//   - InvoiceMessageFormatter → memformat pesan teks
//   - WhatsAppGraphClient    → mengirim pesan via Meta Graph API
//   - PdfService             → memproses konversi ke berkas PDF
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
    private readonly pdfService: PdfService,
  ) {}

  /**
   * Mengirim ringkasan invoice berupa tombol interaktif ke nomor WhatsApp pengguna.
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

    // Kirim pesan interaktif dengan tombol "Buatkan PDF"
    try {
      this.logger.log(
        `Mengirim pesan tombol interaktif WhatsApp ke ${phoneNumber}...`,
        WhatsAppNotificationService.name,
      );
      const buttons = [
        {
          id: `pdf_req:${invoice.invoiceNumber}`,
          title: '📄 Buatkan PDF',
        },
      ];
      await this.graphClient.sendInteractiveButtonMessage(phoneNumber, message, buttons);
      this.logger.log(
        `✅ Notifikasi invoice ${invoice.invoiceNumber} dengan tombol berhasil dikirim ke ${phoneNumber}`,
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

  /**
   * Men-generate PDF invoice on-demand, mengunggah ke WhatsApp Cloud API,
   * dan mengirimkannya ke nomor WhatsApp pengguna sebagai berkas dokumen.
   *
   * @param phoneNumber Nomor telepon penerima
   * @param invoice     Entitas invoice lengkap
   */
  async sendInvoicePdf(phoneNumber: string, invoice: any): Promise<void> {
    this.logger.log(
      `Memulai proses on-demand PDF invoice ${invoice.invoiceNumber} untuk nomor ${phoneNumber}`,
      WhatsAppNotificationService.name,
    );

    // 1. Generate PDF via PdfService
    let pdfBuffer: Buffer;
    let pdfPath: string;
    try {
      this.logger.log(`Men-generate berkas PDF via PdfService...`, WhatsAppNotificationService.name);
      const result = await this.pdfService.generateInvoicePdf(invoice);
      pdfBuffer = result.pdfBuffer;
      pdfPath = result.pdfPath;
      this.logger.log(`PDF berhasil disimpan di: ${pdfPath}`, WhatsAppNotificationService.name);
    } catch (genErr: any) {
      this.logger.error(
        `Gagal men-generate PDF untuk invoice ${invoice.invoiceNumber}`,
        genErr instanceof Error ? genErr.stack : String(genErr),
        WhatsAppNotificationService.name,
      );
      // Kirim pesan teks error ke user agar mereka tahu proses gagal
      try {
        await this.graphClient.sendTextMessage(
          phoneNumber,
          `⚠️ Maaf, terjadi kesalahan saat membuat berkas PDF untuk invoice *${invoice.invoiceNumber}*. Silakan hubungi admin atau coba lagi nanti.`,
        );
      } catch (sendErr) {
        this.logger.error(`Gagal mengirim notifikasi error ke user`, sendErr, WhatsAppNotificationService.name);
      }
      return;
    }

    // 2. Unggah media ke Meta Graph API
    let mediaId: string;
    const filename = `${invoice.invoiceNumber}.pdf`;
    try {
      this.logger.log(`Mengunggah berkas PDF ke Meta Graph API...`, WhatsAppNotificationService.name);
      mediaId = await this.graphClient.uploadMedia(pdfBuffer, filename, 'application/pdf');
      this.logger.log(`Media berhasil diunggah. Media ID: ${mediaId}`, WhatsAppNotificationService.name);
    } catch (uploadErr: any) {
      this.logger.error(
        `Gagal mengunggah PDF invoice ${invoice.invoiceNumber} ke WhatsApp Cloud API`,
        uploadErr instanceof Error ? uploadErr.stack : String(uploadErr),
        WhatsAppNotificationService.name,
      );
      try {
        await this.graphClient.sendTextMessage(
          phoneNumber,
          `⚠️ Maaf, gagal memproses berkas PDF invoice *${invoice.invoiceNumber}* untuk dikirim ke WhatsApp.`,
        );
      } catch (sendErr) {
        this.logger.error(`Gagal mengirim notifikasi error ke user`, sendErr, WhatsAppNotificationService.name);
      }
      return;
    }

    // 3. Kirim dokumen PDF
    try {
      this.logger.log(`Mengirim dokumen PDF ke ${phoneNumber}...`, WhatsAppNotificationService.name);
      await this.graphClient.sendDocumentMessage(
        phoneNumber,
        mediaId,
        filename,
        `📄 Invoice *${invoice.invoiceNumber}* Anda siap!`,
      );
      this.logger.log(
        `✅ Dokumen PDF invoice ${invoice.invoiceNumber} berhasil dikirim ke ${phoneNumber}`,
        WhatsAppNotificationService.name,
      );
    } catch (sendErr: any) {
      this.logger.error(
        `Gagal mengirim pesan dokumen PDF ke ${phoneNumber}`,
        sendErr instanceof Error ? sendErr.stack : String(sendErr),
        WhatsAppNotificationService.name,
      );
    }
  }
}
