import {
  Controller,
  Post,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InvoicesService } from '../services/invoices.service';
import { InvoicesMapper } from '../mapper/invoices.mapper';

@Controller('invoices')
export class InvoicesController {
  private readonly logger = new Logger(InvoicesController.name);

  constructor(
    private readonly service: InvoicesService,
    private readonly mapper: InvoicesMapper,
  ) {}

  @Post(':receiptId/generate')
  @HttpCode(HttpStatus.CREATED)
  async generate(@Param('receiptId') receiptId: string) {
    this.logger.log(`POST /invoices/${receiptId}/generate dipanggil`);

    const invoice = await this.service.generateInvoice(receiptId);
    const invoiceDto = this.mapper.toResponseDto(invoice);

    return {
      success: true,
      invoice: invoiceDto,
    };
  }
}
