import { Injectable, Logger } from '@nestjs/common';
import { ReceiptsRepository } from '../repositories/receipts.repository';
import { CreateReceiptDto } from '../dto/create-receipt.dto';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly repository: ReceiptsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async createReceipt(dto: CreateReceiptDto) {
    this.logger.log(`Memulai proses pembuatan receipt untuk toko: ${dto.storeName}`);

    // Dapatkan userId target, default ke default user jika tidak dispesifikasikan
    let targetUserId = dto.userId;
    if (!targetUserId) {
      const defaultPhone = '+628000000000';
      let user = await this.prisma.user.findUnique({
        where: { phoneNumber: defaultPhone },
      });

      if (!user) {
        this.logger.log(`Membuat default user baru dengan nomor telepon ${defaultPhone}...`);
        user = await this.prisma.user.create({
          data: {
            phoneNumber: defaultPhone,
            name: 'Default User',
          },
        });
      }
      targetUserId = user.id;
    }

    // Buat data receipt menggunakan layer repository
    const createdReceipt = await this.repository.create(dto, targetUserId!);

    this.logger.log(`Receipt berhasil disimpan ke database. ID: ${createdReceipt.id}`);
    return createdReceipt;
  }
}
