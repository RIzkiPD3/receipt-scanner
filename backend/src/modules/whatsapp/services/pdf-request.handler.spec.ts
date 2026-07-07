import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { PdfRequestHandler } from './pdf-request.handler';
import { PrismaService } from '../../../database/prisma.service';
import { WhatsAppNotificationService } from './whatsapp-notification.service';
import { WhatsAppGraphClient } from '../client/whatsapp-graph.client';

// =============================================================================
// PdfRequestHandler — Unit Tests
// =============================================================================

describe('PdfRequestHandler', () => {
  let handler: PdfRequestHandler;
  let prisma: jest.Mocked<PrismaService>;
  let notificationService: jest.Mocked<WhatsAppNotificationService>;
  let graphClient: jest.Mocked<WhatsAppGraphClient>;

  const mockPhone = '628123456789';
  const mockInvoiceNumber = 'INV-20260706-0001';
  const mockButtonId = `pdf_req:${mockInvoiceNumber}`;
  const mockInvoiceId = 'inv-uuid-123';

  const mockInvoice = {
    id: mockInvoiceId,
    invoiceNumber: mockInvoiceNumber,
    merchantName: 'Warung Kopi',
    totalAmount: 15000,
    items: [],
  };

  beforeEach(async () => {
    const mockPrisma: any = {
      invoice: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };

    const mockNotificationService: Partial<jest.Mocked<WhatsAppNotificationService>> = {
      sendInvoicePdf: jest.fn().mockResolvedValue(undefined),
    };

    const mockGraphClient: Partial<jest.Mocked<WhatsAppGraphClient>> = {
      sendTextMessage: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfRequestHandler,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WhatsAppNotificationService, useValue: mockNotificationService },
        { provide: WhatsAppGraphClient, useValue: mockGraphClient },
      ],
    }).compile();

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    handler = module.get<PdfRequestHandler>(PdfRequestHandler);
    prisma = module.get(PrismaService);
    notificationService = module.get(WhatsAppNotificationService);
    graphClient = module.get(WhatsAppGraphClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // isPdfRequest()
  // ---------------------------------------------------------------------------
  describe('isPdfRequest()', () => {
    it('harus mengembalikan true untuk button ID dengan prefix pdf_req:', () => {
      expect(handler.isPdfRequest('pdf_req:INV-123')).toBe(true);
    });

    it('harus mengembalikan false untuk button ID dengan format lain', () => {
      expect(handler.isPdfRequest('other_prefix:INV-123')).toBe(false);
      expect(handler.isPdfRequest('')).toBe(false);
      expect(handler.isPdfRequest(null as any)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getPdfStoragePath()
  // ---------------------------------------------------------------------------
  describe('getPdfStoragePath()', () => {
    it('harus mengembalikan path yang mengandung invoiceNumber.pdf di dalam storage/pdf/', () => {
      const pdfPath = handler.getPdfStoragePath('INV-20260706-0001');
      expect(pdfPath).toContain('storage');
      expect(pdfPath).toContain('pdf');
      expect(pdfPath).toContain('INV-20260706-0001.pdf');
    });
  });

  // ---------------------------------------------------------------------------
  // handle()
  // ---------------------------------------------------------------------------
  describe('handle()', () => {
    it('harus melewati proses jika nomor invoice kosong', async () => {
      await handler.handle(mockPhone, 'pdf_req:');
      expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
    });

    it('harus mengabarkan user dan tidak memanggil generator PDF jika invoice tidak ditemukan di database', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);

      await handler.handle(mockPhone, mockButtonId);

      expect(prisma.invoice.findUnique).toHaveBeenCalledWith({
        where: { invoiceNumber: mockInvoiceNumber },
        include: { items: true },
      });
      expect(graphClient.sendTextMessage).toHaveBeenCalledWith(
        mockPhone,
        expect.stringContaining(mockInvoiceNumber),
      );
      expect(notificationService.sendInvoicePdf).not.toHaveBeenCalled();
    });

    it('harus memanggil notificationService.sendInvoicePdf jika invoice ditemukan', async () => {
      prisma.invoice.findUnique.mockResolvedValue(mockInvoice as any);

      await handler.handle(mockPhone, mockButtonId);

      expect(prisma.invoice.findUnique).toHaveBeenCalled();
      expect(notificationService.sendInvoicePdf).toHaveBeenCalledWith(mockPhone, mockInvoice);
      expect(graphClient.sendTextMessage).not.toHaveBeenCalled();
    });

    it('harus memperbarui pdfUrl di database setelah PDF berhasil dikirim', async () => {
      prisma.invoice.findUnique.mockResolvedValue(mockInvoice as any);

      await handler.handle(mockPhone, mockButtonId);

      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: mockInvoiceId },
        data: { pdfUrl: expect.stringContaining(`${mockInvoiceNumber}.pdf`) },
      });
    });

    it('harus tidak memanggil prisma.update jika invoice tidak ditemukan', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);

      await handler.handle(mockPhone, mockButtonId);

      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('harus menyerap error update pdfUrl tanpa mempengaruhi flow utama', async () => {
      prisma.invoice.findUnique.mockResolvedValue(mockInvoice as any);
      prisma.invoice.update.mockRejectedValue(new Error('DB update gagal'));

      // Tidak boleh throw — update pdfUrl bersifat best-effort
      await expect(handler.handle(mockPhone, mockButtonId)).resolves.toBeUndefined();
      expect(notificationService.sendInvoicePdf).toHaveBeenCalled();
    });

    it('harus menyerap (suppress) error jika database findUnique throw exception', async () => {
      prisma.invoice.findUnique.mockRejectedValue(new Error('Koneksi DB putus'));

      await expect(handler.handle(mockPhone, mockButtonId)).resolves.toBeUndefined();
    });
  });
});
