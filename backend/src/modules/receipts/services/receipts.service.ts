import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ReceiptsRepository } from '../repositories/receipts.repository';
import { CreateReceiptDto } from '../dto/create-receipt.dto';
import { PrismaService } from '../../../database/prisma.service';
import { InvoicesService } from '../../invoices/services/invoices.service';

// =============================================================================
// ReceiptsService
// =============================================================================
// Mengelola logika bisnis untuk penerimaan data struk belanja hasil OCR + AI.
// Mengintegrasikan penyimpanan ke database dan memicu pembuatan invoice.
// =============================================================================

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    private readonly repository: ReceiptsRepository,
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
  ) {}

  /**
   * Menyimpan data struk hasil proses OCR + AI ke database.
   * Mendukung skema pembuatan baru atau pembaruan struk berstatus PENDING.
   * Setelah struk berhasil disimpan, langsung memicu pembuatan Invoice.
   */
  async createReceipt(dto: CreateReceiptDto) {
    this.logger.log(
      `Memulai proses penyimpanan data receipt hasil ekstraksi untuk toko: ${dto.storeName}`,
      ReceiptsService.name,
    );

    const saveStart = Date.now();
    let createdReceipt: any;

    if (dto.receiptId) {
      // 1. Skema UPDATE: struk sudah dibuat sebelumnya (status PENDING) via WhatsApp webhook
      const existing = await this.repository.findById(dto.receiptId);
      if (!existing) {
        this.logger.error(
          `Receipt PENDING dengan ID ${dto.receiptId} tidak ditemukan untuk diupdate`,
          ReceiptsService.name,
        );
        throw new NotFoundException(`Receipt PENDING dengan ID ${dto.receiptId} tidak ditemukan.`);
      }

      this.logger.log(
        `Memperbarui struk PENDING (ID: ${dto.receiptId}) dengan data ekstraksi...`,
        ReceiptsService.name,
      );
      createdReceipt = await this.repository.update(dto.receiptId, dto);
    } else {
      // 2. Skema CREATE: data struk langsung disubmit baru via REST API
      let targetUserId = dto.userId;
      if (!targetUserId) {
        const defaultPhone = '+628000000000';
        let user = await this.prisma.user.findUnique({
          where: { phoneNumber: defaultPhone },
        });

        if (!user) {
          this.logger.log(
            `Membuat default user baru dengan nomor telepon ${defaultPhone}...`,
            ReceiptsService.name,
          );
          user = await this.prisma.user.create({
            data: {
              phoneNumber: defaultPhone,
              name: 'Default User',
            },
          });
        }
        targetUserId = user.id;
      }

      createdReceipt = await this.repository.create(dto, targetUserId!);
    }

    const saveDuration = Date.now() - saveStart;
    this.logger.log(
      `[Performance] Database Save took ${saveDuration}ms untuk receiptId: ${createdReceipt.id}`,
      ReceiptsService.name,
    );
    this.logger.log(
      `✅ Receipt saved (ID: ${createdReceipt.id}, Status: ${createdReceipt.status})`,
      ReceiptsService.name,
    );

    // 3. Picu pembuatan Invoice secara otomatis dari data receipt yang telah terstruktur
    this.logger.log(
      `Memicu pembuatan invoice otomatis untuk receiptId: ${createdReceipt.id}`,
      ReceiptsService.name,
    );

    const invoiceStart = Date.now();
    let invoice: any;
    try {
      invoice = await this.invoicesService.generateInvoice(createdReceipt.id);
      const invoiceDuration = Date.now() - invoiceStart;
      this.logger.log(
        `[Performance] Invoice Generation took ${invoiceDuration}ms untuk receiptId: ${createdReceipt.id}`,
        ReceiptsService.name,
      );
      this.logger.log(
        `✅ Invoice generated (ID: ${invoice.id}, Nomor: ${invoice.invoiceNumber})`,
        ReceiptsService.name,
      );
    } catch (invoiceErr: any) {
      // Sesuai aturan Error Recovery: Kegagalan invoice tidak menggagalkan penyimpanan Receipt
      this.logger.error(
        `Gagal memicu pembuatan invoice otomatis untuk receiptId: ${createdReceipt.id}`,
        invoiceErr instanceof Error ? invoiceErr.stack : String(invoiceErr),
        ReceiptsService.name,
      );
    }

    return createdReceipt;
  }
}
