import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class InvoicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Mencari Receipt beserta item-item di dalamnya berdasarkan ID
  async findReceiptWithItems(receiptId: string) {
    return this.prisma.receipt.findUnique({
      where: { id: receiptId },
      include: { items: true },
    });
  }

  // Mencari Invoice berdasarkan receiptId (untuk validasi duplikasi)
  async findInvoiceByReceiptId(receiptId: string) {
    return this.prisma.invoice.findUnique({
      where: { receiptId },
    });
  }

  // Mencari nomor invoice terakhir untuk hari ini
  async findLastInvoiceNumberForToday(dateStr: string) {
    return this.prisma.invoice.findFirst({
      where: {
        invoiceNumber: {
          startsWith: `INV-${dateStr}-`,
        },
      },
      orderBy: {
        invoiceNumber: 'desc',
      },
    });
  }

  // Membuat record Invoice dan InvoiceItems baru di dalam sebuah transaksi database
  async createInvoice(data: any, items: any[]) {
    return this.prisma.$transaction(async (tx: any) => {
      const invoice = await tx.invoice.create({
        data: {
          userId: data.userId,
          receiptId: data.receiptId,
          invoiceNumber: data.invoiceNumber,
          merchantName: data.merchantName,
          subtotal: data.subtotal,
          taxAmount: data.taxAmount,
          discountAmount: data.discountAmount ?? 0,
          totalAmount: data.totalAmount,
          currency: data.currency ?? 'IDR',
          status: 'DRAFT',
        },
      });

      if (items && items.length > 0) {
        await tx.invoiceItem.createMany({
          data: items.map((item) => ({
            invoiceId: invoice.id,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        });
      }

      return tx.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: { items: true },
      });
    });
  }

  // Mencari nomor telepon pengguna berdasarkan userId (untuk notifikasi WhatsApp)
  async findUserPhoneNumber(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phoneNumber: true },
    });
    return user?.phoneNumber ?? null;
  }

  // Mencari Invoice beserta item-item di dalamnya berdasarkan nomor invoice
  async findByInvoiceNumber(invoiceNumber: string) {
    return this.prisma.invoice.findUnique({
      where: { invoiceNumber },
      include: { items: true },
    });
  }
}
