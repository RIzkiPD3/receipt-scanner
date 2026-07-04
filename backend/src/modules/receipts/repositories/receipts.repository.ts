import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CreateReceiptDto } from '../dto/create-receipt.dto';

@Injectable()
export class ReceiptsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateReceiptDto, userId: string) {
    return this.prisma.$transaction(async (tx: any) => {
      // Simpan data Receipt ke database PostgreSQL menggunakan Prisma Client
      const receipt = await tx.receipt.create({
        data: {
          userId: userId,
          imageUrl: data.imageUrl ?? 'http://placeholder.com/receipt.jpg',
          merchantName: data.storeName,
          transactionDate: data.transactionDate ? new Date(data.transactionDate) : null,
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
}
