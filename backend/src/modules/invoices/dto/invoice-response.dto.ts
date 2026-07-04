export class InvoiceItemResponseDto {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export class InvoiceResponseDto {
  id: string;
  userId: string;
  receiptId: string | null;
  invoiceNumber: string;
  merchantName: string;
  issueDate: Date;
  dueDate: Date | null;
  status: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  pdfUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: InvoiceItemResponseDto[];
}
