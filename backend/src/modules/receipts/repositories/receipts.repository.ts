import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateReceiptDto } from '../dto/create-receipt.dto';

function parseSafeDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// =============================================================================
// ReceiptsRepository
// =============================================================================
// Mengelola operasi database untuk entitas Receipt dan ReceiptItem.
// =============================================================================

@Injectable()
export class ReceiptsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mencari Receipt berdasarkan ID.
   */
  async findById(receiptId: string) {
    return this.prisma.receipt.findUnique({
      where: { id: receiptId },
    });
  }

  /**
   * Menyimpan data Receipt baru ke database PostgreSQL.
   */
  async create(data: CreateReceiptDto, userId: string) {
    return this.prisma.$transaction(async (tx: any) => {
      // Simpan data Receipt ke database PostgreSQL menggunakan Prisma Client
      const receipt = await tx.receipt.create({
        data: {
          userId: userId,
          imageUrl: data.imageUrl ?? 'http://placeholder.com/receipt.jpg',
          merchantName: data.storeName,
          transactionDate: parseSafeDate(data.transactionDate),
          subtotal: data.subtotal,
          tax: data.tax,
          totalAmount: data.total,
          status: 'PROCESSED',
        },
      });

      // Simpan data ReceiptItems ke database PostgreSQL
      if (data.items && data.items.length > 0) {
        await tx.receiptItem.createMany({
          data: data.items.map((item) => ({
            receiptId: receipt.id,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        });
      }

      // Ambil kembali data Receipt beserta ReceiptItems
      return tx.receipt.findUniqueOrThrow({
        where: { id: receipt.id },
        include: { items: true },
      });
    });
  }

  /**
   * Memperbarui data Receipt PENDING yang sudah ada dengan data hasil ekstraksi OCR + AI.
   */
  async update(receiptId: string, data: CreateReceiptDto) {
    return this.prisma.$transaction(async (tx: any) => {
      // Update data Receipt
      const receipt = await tx.receipt.update({
        where: { id: receiptId },
        data: {
          merchantName: data.storeName,
          transactionDate: parseSafeDate(data.transactionDate),
          subtotal: data.subtotal,
          tax: data.tax,
          totalAmount: data.total,
          status: 'PROCESSED',
        },
      });

      // Bersihkan item lama jika ada untuk mencegah duplikasi data
      await tx.receiptItem.deleteMany({
        where: { receiptId },
      });

      // Simpan data ReceiptItems baru
      if (data.items && data.items.length > 0) {
        await tx.receiptItem.createMany({
          data: data.items.map((item) => ({
            receiptId: receipt.id,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        });
      }

      // Ambil kembali data lengkap
      return tx.receipt.findUniqueOrThrow({
        where: { id: receipt.id },
        include: { items: true },
      });
    });
  }
}
