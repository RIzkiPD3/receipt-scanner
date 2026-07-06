import { Module } from '@nestjs/common';
import { PdfService } from './services/pdf.service';
import { InvoiceTemplateHelper } from './helpers/invoice-template.helper';

// =============================================================================
// PdfModule
// =============================================================================
// Modul infrastruktur terisolasi untuk menangani pembuatan dokumen PDF.
// Mengekspor PdfService agar dapat diinjeksikan oleh WhatsAppNotificationService.
// =============================================================================

@Module({
  providers: [PdfService, InvoiceTemplateHelper],
  exports: [PdfService, InvoiceTemplateHelper],
})
export class PdfModule {}
