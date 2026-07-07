import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { WhatsAppNotificationService } from './whatsapp-notification.service';
import { WhatsAppGraphClient } from '../client/whatsapp-graph.client';
import * as path from 'path';

// =============================================================================
// PdfRequestHandler
// =============================================================================
// Menangani event klik tombol "Buatkan PDF" dari WhatsApp.
// Memisahkan logika penanganan request on-demand dari WebhookService.
// Menggunakan PrismaService secara langsung untuk menghindari dependency circular
// dengan InvoicesModule.
//
// Alur lengkap:
//   1. Ekstrak nomor invoice dari buttonId
//   2. Cari invoice di database (termasuk items)
//   3. Delegasi PDF generation + WhatsApp delivery ke WhatsAppNotificationService
//   4. Setelah sukses, perbarui field `pdfUrl` di tabel invoices (idempotent)
//   5. Log setiap tahapan sesuai spesifikasi TASK-017
// =============================================================================

@Injectable()
export class PdfRequestHandler {
  private readonly logger = new Logger(PdfRequestHandler.name);
  private readonly PDF_REQUEST_PREFIX = 'pdf_req:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: WhatsAppNotificationService,
    private readonly graphClient: WhatsAppGraphClient,
  ) {}

  /**
   * Memeriksa apakah ID tombol adalah request PDF invoice.
   */
  isPdfRequest(buttonId: string): boolean {
    return !!buttonId && buttonId.startsWith(this.PDF_REQUEST_PREFIX);
  }

  /**
   * Menghitung path lokal file PDF berdasarkan nomor invoice.
   * Konsisten dengan path yang dihasilkan oleh PdfService.
   */
  getPdfStoragePath(invoiceNumber: string): string {
    return path.join(process.cwd(), 'storage', 'pdf', `${invoiceNumber}.pdf`);
  }

  /**
   * Memperbarui kolom pdfUrl pada record Invoice di database.
   * Dipanggil setelah PDF berhasil dibuat dan dikirim.
   * Operasi ini bersifat idempotent — memanggil ulang tidak menghasilkan efek samping.
   *
   * @param invoiceId ID unik invoice (UUID)
   * @param pdfPath   Path lokal file PDF yang telah disimpan
   */
  private async persistPdfUrl(invoiceId: string, pdfPath: string): Promise<void> {
    try {
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { pdfUrl: pdfPath },
      });
      this.logger.log(
        `📎 pdfUrl invoice (ID: ${invoiceId}) diperbarui → ${pdfPath}`,
        PdfRequestHandler.name,
      );
    } catch (updateErr: any) {
      // Error update pdfUrl tidak membatalkan pengiriman yang sudah berhasil
      this.logger.error(
        `Gagal memperbarui pdfUrl untuk invoice ID: ${invoiceId}`,
        updateErr instanceof Error ? updateErr.stack : String(updateErr),
        PdfRequestHandler.name,
      );
    }
  }

  /**
   * Memproses pembuatan dan pengiriman PDF invoice.
   *
   * @param from     Nomor WhatsApp pengguna
   * @param buttonId ID tombol WhatsApp (e.g. "pdf_req:INV-20260706-0001")
   */
  async handle(from: string, buttonId: string): Promise<void> {
    this.logger.log(
      `Menerima permintaan PDF dari nomor ${from} (Button ID: ${buttonId})`,
      PdfRequestHandler.name,
    );

    const invoiceNumber = buttonId.substring(this.PDF_REQUEST_PREFIX.length);
    if (!invoiceNumber) {
      this.logger.warn(`Nomor invoice kosong dari ID tombol: ${buttonId}`, PdfRequestHandler.name);
      return;
    }

    this.logger.log(`[1/5] Mencari invoice ${invoiceNumber} di database...`, PdfRequestHandler.name);

    try {
      const invoice = await this.prisma.invoice.findUnique({
        where: { invoiceNumber },
        include: { items: true },
      });

      if (!invoice) {
        this.logger.warn(
          `Invoice dengan nomor ${invoiceNumber} tidak ditemukan di database.`,
          PdfRequestHandler.name,
        );
        await this.graphClient.sendTextMessage(
          from,
          `⚠️ Maaf, invoice dengan nomor *${invoiceNumber}* tidak dapat ditemukan di sistem kami.`,
        );
        return;
      }

      this.logger.log(
        `[2/5] Invoice ditemukan (ID: ${invoice.id}). Memulai pembuatan PDF...`,
        PdfRequestHandler.name,
      );

      // [3/5 & 4/5] Generate PDF, upload, dan kirim dokumen via WhatsApp
      await this.notificationService.sendInvoicePdf(from, invoice);

      this.logger.log(
        `[5/5] ✅ Dokumen PDF berhasil dikirim ke ${from} untuk invoice ${invoiceNumber}.`,
        PdfRequestHandler.name,
      );

      // Perbarui pdfUrl di database (tidak memblokir jika gagal)
      const pdfPath = this.getPdfStoragePath(invoiceNumber);
      await this.persistPdfUrl(invoice.id, pdfPath);

      this.logger.log(
        `Proses permintaan PDF untuk invoice ${invoiceNumber} selesai.`,
        PdfRequestHandler.name,
      );
    } catch (error: any) {
      this.logger.error(
        `Gagal memproses permintaan PDF untuk nomor ${from} (Invoice: ${invoiceNumber})`,
        error instanceof Error ? error.stack : String(error),
        PdfRequestHandler.name,
      );
    }
  }
}
