import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { WhatsAppNotificationService } from './whatsapp-notification.service';
import { WhatsAppGraphClient } from '../client/whatsapp-graph.client';
import { InvoiceMessageFormatter } from '../formatter/invoice-message.formatter';
import { PdfService } from '../../pdf/services/pdf.service';

// =============================================================================
// WhatsAppNotificationService — Unit Tests
// =============================================================================

describe('WhatsAppNotificationService', () => {
  let service: WhatsAppNotificationService;
  let graphClient: jest.Mocked<WhatsAppGraphClient>;
  let formatter: jest.Mocked<InvoiceMessageFormatter>;
  let pdfService: jest.Mocked<PdfService>;

  // Fixture invoice sederhana
  const mockInvoice = {
    id: 'inv-uuid-001',
    invoiceNumber: 'INV-20260704-0001',
    merchantName: 'Test Merchant',
    issueDate: new Date('2026-07-04T00:00:00.000Z'),
    currency: 'IDR',
    subtotal: 50000,
    taxAmount: 5000,
    discountAmount: 0,
    totalAmount: 55000,
    status: 'DRAFT',
    items: [],
  };

  const validPhone = '628123456789';
  const formattedMessage = '🧾 *INVOICE BERHASIL DIBUAT*\n━━━━━━━━━━━━━━━━━━━━━━\n...';
  const mockPdfBuffer = Buffer.from('%PDF-mock');
  const mockPdfPath = '/storage/pdf/INV-20260704-0001.pdf';

  beforeEach(async () => {
    const mockGraphClient: Partial<jest.Mocked<WhatsAppGraphClient>> = {
      sendInteractiveButtonMessage: jest.fn().mockResolvedValue(undefined),
      sendTextMessage: jest.fn().mockResolvedValue(undefined),
      uploadMedia: jest.fn().mockResolvedValue('meta-media-id-123'),
      sendDocumentMessage: jest.fn().mockResolvedValue(undefined),
    };

    const mockFormatter: Partial<jest.Mocked<InvoiceMessageFormatter>> = {
      format: jest.fn().mockReturnValue(formattedMessage),
    };

    const mockPdfService: Partial<jest.Mocked<PdfService>> = {
      generateInvoicePdf: jest.fn().mockResolvedValue({
        pdfPath: mockPdfPath,
        pdfBuffer: mockPdfBuffer,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppNotificationService,
        { provide: WhatsAppGraphClient, useValue: mockGraphClient },
        { provide: InvoiceMessageFormatter, useValue: mockFormatter },
        { provide: PdfService, useValue: mockPdfService },
      ],
    }).compile();

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    service = module.get<WhatsAppNotificationService>(WhatsAppNotificationService);
    graphClient = module.get(WhatsAppGraphClient);
    formatter = module.get(InvoiceMessageFormatter);
    pdfService = module.get(PdfService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // sendInvoiceSummary()
  // ---------------------------------------------------------------------------
  describe('sendInvoiceSummary()', () => {
    it('harus memanggil formatter dan mengirim interactive button message ke WhatsApp', async () => {
      await service.sendInvoiceSummary(validPhone, mockInvoice);

      expect(formatter.format).toHaveBeenCalledWith(mockInvoice);
      expect(graphClient.sendInteractiveButtonMessage).toHaveBeenCalledWith(
        validPhone,
        formattedMessage,
        [
          {
            id: `pdf_req:${mockInvoice.invoiceNumber}`,
            title: '📄 Buatkan PDF',
          },
        ],
      );
    });

    it('harus menyerap error jika graphClient gagal mengirim button message', async () => {
      graphClient.sendInteractiveButtonMessage.mockRejectedValue(new Error('API Error'));

      await expect(service.sendInvoiceSummary(validPhone, mockInvoice)).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // sendInvoicePdf()
  // ---------------------------------------------------------------------------
  describe('sendInvoicePdf()', () => {
    it('harus men-generate PDF, mengunggah media, dan mengirim dokumen PDF ke user', async () => {
      await service.sendInvoicePdf(validPhone, mockInvoice);

      // 1. PDF generated
      expect(pdfService.generateInvoicePdf).toHaveBeenCalledWith(mockInvoice);
      
      // 2. Uploaded
      expect(graphClient.uploadMedia).toHaveBeenCalledWith(
        mockPdfBuffer,
        'INV-20260704-0001.pdf',
        'application/pdf',
      );

      // 3. Sent document
      expect(graphClient.sendDocumentMessage).toHaveBeenCalledWith(
        validPhone,
        'meta-media-id-123',
        'INV-20260704-0001.pdf',
        '📄 Invoice *INV-20260704-0001* Anda siap!',
      );
    });

    it('harus memberi tahu user lewat teks jika pembuatan PDF gagal', async () => {
      pdfService.generateInvoicePdf.mockRejectedValue(new Error('Puppeteer crash'));

      await service.sendInvoicePdf(validPhone, mockInvoice);

      expect(graphClient.uploadMedia).not.toHaveBeenCalled();
      expect(graphClient.sendTextMessage).toHaveBeenCalledWith(
        validPhone,
        expect.stringContaining('kesalahan saat membuat berkas PDF'),
      );
    });

    it('harus memberi tahu user lewat teks jika upload media ke WhatsApp gagal', async () => {
      graphClient.uploadMedia.mockRejectedValue(new Error('Meta API error'));

      await service.sendInvoicePdf(validPhone, mockInvoice);

      expect(graphClient.sendDocumentMessage).not.toHaveBeenCalled();
      expect(graphClient.sendTextMessage).toHaveBeenCalledWith(
        validPhone,
        expect.stringContaining('gagal memproses berkas PDF invoice'),
      );
    });

    it('harus menyerap (suppress) error jika pengiriman dokumen gagal di tahap akhir', async () => {
      graphClient.sendDocumentMessage.mockRejectedValue(new Error('Timeout'));

      await expect(service.sendInvoicePdf(validPhone, mockInvoice)).resolves.toBeUndefined();
    });
  });
});
