import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { WhatsAppNotificationService } from './whatsapp-notification.service';
import { WhatsAppGraphClient } from '../client/whatsapp-graph.client';

// =============================================================================
// PdfRequestHandler
// =============================================================================
// Menangani event klik tombol "Buatkan PDF" dari WhatsApp.
// Memisahkan logika penanganan request on-demand dari WebhookService.
// Menggunakan PrismaService secara langsung untuk menghindari dependency circular
// dengan InvoicesModule.
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

    this.logger.log(`Mencari invoice ${invoiceNumber} di database...`, PdfRequestHandler.name);

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
        // Informasikan pengguna
        await this.graphClient.sendTextMessage(
          from,
          `⚠️ Maaf, invoice dengan nomor *${invoiceNumber}* tidak dapat ditemukan di sistem kami.`,
        );
        return;
      }

      this.logger.log(
        `Invoice ditemukan (ID: ${invoice.id}). Memulai pembuatan dan pengiriman PDF...`,
        PdfRequestHandler.name,
      );

      // Jalankan proses kirim PDF
      await this.notificationService.sendInvoicePdf(from, invoice);

      this.logger.log(`Proses permintaan PDF untuk invoice ${invoiceNumber} selesai.`, PdfRequestHandler.name);
    } catch (error: any) {
      this.logger.error(
        `Gagal memproses permintaan PDF untuk nomor ${from} (Invoice: ${invoiceNumber})`,
        error instanceof Error ? error.stack : String(error),
        PdfRequestHandler.name,
      );
    }
  }
}
