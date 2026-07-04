import { Controller, Post, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ReceiptsService } from '../services/receipts.service';
import { CreateReceiptDto } from '../dto/create-receipt.dto';

@Controller('receipts')
export class ReceiptsController {
  private readonly logger = new Logger(ReceiptsController.name);

  constructor(private readonly service: ReceiptsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateReceiptDto) {
    this.logger.log(`POST /receipts dipanggil untuk store: ${dto.storeName}`);
    return this.service.createReceipt(dto);
  }
}
