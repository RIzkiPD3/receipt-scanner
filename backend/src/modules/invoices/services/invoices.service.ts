import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InvoicesRepository } from '../repositories/invoices.repository';
import { WhatsAppNotificationService } from '../../whatsapp/services/whatsapp-notification.service';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly repository: InvoicesRepository,
    private readonly whatsappNotification: WhatsAppNotificationService,
  ) {}

  // Menghasilkan nomor invoice dengan format INV-YYYYMMDD-0001
  private async generateInvoiceNumber(): Promise<string> {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;

    const lastInvoice =
      await this.repository.findLastInvoiceNumberForToday(dateStr);
    let nextSeq = 1;

    if (lastInvoice) {
      const parts = lastInvoice.invoiceNumber.split('-');
      if (parts.length === 3) {
        const lastSeq = parseInt(parts[2], 10);
        if (!isNaN(lastSeq)) {
          nextSeq = lastSeq + 1;
        }
      }
    }

    const seqStr = String(nextSeq).padStart(4, '0');
    return `INV-${dateStr}-${seqStr}`;
  }

  // Membuat Invoice baru dari Receipt
  async generateInvoice(receiptId: string) {
    this.logger.log(
      `Memulai proses pembuatan invoice untuk receiptId: ${receiptId}`,
    );

    // 1. Cari Receipt dan pastikan ada
    const receipt = await this.repository.findReceiptWithItems(receiptId);
    if (!receipt) {
      this.logger.error(`Receipt dengan ID ${receiptId} tidak ditemukan`);
      throw new NotFoundException(
        `Receipt dengan ID ${receiptId} tidak ditemukan`,
      );
    }

    // 2. Cegah duplikasi Invoice untuk satu Receipt yang sama
    const existingInvoice =
      await this.repository.findInvoiceByReceiptId(receiptId);
    if (existingInvoice) {
      this.logger.warn(
        `Invoice untuk receiptId ${receiptId} sudah pernah dibuat`,
      );
      throw new BadRequestException(
        `Invoice untuk receiptId ${receiptId} sudah pernah dibuat`,
      );
    }

    // 3. Loop percobaan ulang jika terjadi bentrokan nomor invoice (Unique Constraint) secara konkruen
    const maxRetries = 5;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const invoiceNumber = await this.generateInvoiceNumber();
      this.logger.log(
        `Mencoba menyimpan invoice baru dengan nomor: ${invoiceNumber} (Percobaan ${attempt}/${maxRetries})`,
      );

      try {
        const invoiceData = {
          userId: receipt.userId,
          receiptId: receipt.id,
          invoiceNumber: invoiceNumber,
          merchantName: receipt.merchantName ?? 'Unknown Merchant',
          subtotal: receipt.subtotal ?? 0,
          taxAmount: receipt.tax ?? 0,
          discountAmount: 0,
          totalAmount: receipt.totalAmount ?? 0,
          currency: receipt.currency ?? 'IDR',
        };

        const itemsData = receipt.items.map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        }));

        const createdInvoice = await this.repository.createInvoice(
          invoiceData,
          itemsData,
        );
        this.logger.log(
          `Invoice berhasil disimpan. Nomor: ${invoiceNumber}, ID: ${createdInvoice.id}`,
        );

        // 4. Kirim notifikasi WhatsApp ke pengguna (fire-and-forget, tidak membatalkan invoice)
        const phoneNumber = await this.repository.findUserPhoneNumber(
          receipt.userId,
        );
        if (phoneNumber) {
          // Jalankan secara async tanpa await agar tidak memblokir response
          this.whatsappNotification
            .sendInvoiceSummary(phoneNumber, createdInvoice, receipt.createdAt)
            .catch((err) =>
              this.logger.error(
                `Background WhatsApp notification gagal untuk invoice ${invoiceNumber}`,
                err instanceof Error ? err.stack : String(err),
              ),
            );
        } else {
          this.logger.warn(
            `Nomor telepon untuk userId ${receipt.userId} tidak ditemukan. Notifikasi dilewati.`,
          );
        }

        return createdInvoice;
      } catch (err: any) {
        lastError = err;
        // P2002: unique constraint violation di Prisma
        if (
          err.code === 'P2002' &&
          (err.meta?.target?.includes('invoice_number') ||
            err.message?.includes('invoice_number'))
        ) {
          this.logger.warn(
            `Bentrokan nomor invoice terdeteksi, melakukan retry...`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, Math.random() * 50),
          );
          continue;
        }
        throw err;
      }
    }

    this.logger.error(
      `Gagal membuat invoice setelah ${maxRetries} percobaan karena bentrokan nomor sekuensial`,
    );
    throw new BadRequestException(
      `Gagal menghasilkan nomor invoice yang unik setelah beberapa kali percobaan. Silakan coba kembali.`,
    );
  }
}
