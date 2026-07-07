import { Injectable } from '@nestjs/common';
import {
  InvoiceResponseDto,
  InvoiceItemResponseDto,
} from '../dto/invoice-response.dto';

@Injectable()
export class InvoicesMapper {
  // Mengonversi data entitas Invoice dari database (dengan Decimal) menjadi DTO respons aman
  toResponseDto(invoice: any): InvoiceResponseDto {
    const itemsDto: InvoiceItemResponseDto[] = (invoice.items ?? []).map(
      (item: any) => ({
        id: item.id,
        name: item.name,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
      }),
    );

    return {
      id: invoice.id,
      userId: invoice.userId,
      receiptId: invoice.receiptId,
      invoiceNumber: invoice.invoiceNumber,
      merchantName: invoice.merchantName,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      status: invoice.status,
      subtotal: Number(invoice.subtotal),
      taxAmount: Number(invoice.taxAmount),
      discountAmount: Number(invoice.discountAmount),
      totalAmount: Number(invoice.totalAmount),
      currency: invoice.currency,
      pdfUrl: invoice.pdfUrl,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      items: itemsDto,
    };
  }
}
