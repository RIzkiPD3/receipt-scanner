import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { InvoiceTemplateHelper } from '../helpers/invoice-template.helper';

// Menggunakan moduleNameMapper → src/__mocks__/puppeteer.ts (ESM-safe stub)
jest.mock('puppeteer');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const puppeteerMock = require('puppeteer');

// Mock seluruh modul fs dengan manual mock
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
  },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fsMock = require('fs');

// =============================================================================
// PdfService — Unit Tests
// =============================================================================

describe('PdfService', () => {
  let service: PdfService;
  let templateHelper: jest.Mocked<InvoiceTemplateHelper>;

  const mockInvoice = {
    invoiceNumber: 'INV-20260706-9999',
    merchantName: 'Mock Merchant',
    issueDate: new Date(),
    currency: 'USD',
    totalAmount: 100,
    subtotal: 80,
    taxAmount: 20,
    discountAmount: 0,
    status: 'DRAFT',
    items: [],
  };

  const mockHtml = '<html><body>Mock HTML Invoice</body></html>';
  const mockPdfBuffer = Buffer.from('%PDF-1.4 mock content');

  // Reusable Puppeteer mock factory
  const buildPuppeteerMocks = () => {
    const mockPage = {
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(mockPdfBuffer),
    };
    const mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined),
    };
    return { mockPage, mockBrowser };
  };

  beforeEach(async () => {
    const mockTemplateHelper: Partial<jest.Mocked<InvoiceTemplateHelper>> = {
      render: jest.fn().mockReturnValue(mockHtml),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfService,
        { provide: InvoiceTemplateHelper, useValue: mockTemplateHelper },
      ],
    }).compile();

    service = module.get<PdfService>(PdfService);
    templateHelper = module.get(InvoiceTemplateHelper);

    // Reset mock state antara test
    jest.clearAllMocks();
    fsMock.existsSync.mockReturnValue(true);
    fsMock.promises.mkdir.mockResolvedValue(undefined);
    fsMock.promises.writeFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateInvoicePdf()', () => {
    it('harus memanggil templateHelper.render() dengan invoice yang dikirim', async () => {
      const { mockBrowser } = buildPuppeteerMocks();
      puppeteerMock.launch.mockResolvedValue(mockBrowser);

      await service.generateInvoicePdf(mockInvoice);

      expect(templateHelper.render).toHaveBeenCalledWith(mockInvoice);
    });

    it('harus berinteraksi dengan Puppeteer untuk mengisi konten dan men-generate PDF', async () => {
      const { mockPage, mockBrowser } = buildPuppeteerMocks();
      puppeteerMock.launch.mockResolvedValue(mockBrowser);

      const result = await service.generateInvoicePdf(mockInvoice);

      expect(puppeteerMock.launch).toHaveBeenCalled();
      expect(mockBrowser.newPage).toHaveBeenCalled();
      expect(mockPage.setContent).toHaveBeenCalledWith(mockHtml, {
        waitUntil: 'load',
      });
      expect(mockPage.pdf).toHaveBeenCalledWith(
        expect.objectContaining({
          format: 'A4',
          printBackground: true,
        }),
      );
      expect(mockBrowser.close).toHaveBeenCalled();

      expect(result.pdfBuffer).toEqual(mockPdfBuffer);
      expect(result.pdfPath).toContain('INV-20260706-9999.pdf');
    });

    it('harus menulis file PDF ke folder disk lokal (storage/pdf/)', async () => {
      const { mockBrowser } = buildPuppeteerMocks();
      puppeteerMock.launch.mockResolvedValue(mockBrowser);

      await service.generateInvoicePdf(mockInvoice);

      expect(fsMock.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('INV-20260706-9999.pdf'),
        mockPdfBuffer,
      );
    });

    it('harus menutup browser Puppeteer walaupun pdf() throw exception', async () => {
      const mockPage = {
        setContent: jest.fn().mockResolvedValue(undefined),
        pdf: jest.fn().mockRejectedValue(new Error('PDF generation failed')),
      };
      const mockBrowser = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn().mockResolvedValue(undefined),
      };
      puppeteerMock.launch.mockResolvedValue(mockBrowser);

      await expect(service.generateInvoicePdf(mockInvoice)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('harus melempar InternalServerErrorException jika Puppeteer launch gagal', async () => {
      puppeteerMock.launch.mockRejectedValue(new Error('Browser crash'));

      await expect(service.generateInvoicePdf(mockInvoice)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('harus melempar InternalServerErrorException jika templateHelper.render() gagal', async () => {
      templateHelper.render.mockImplementation(() => {
        throw new Error('Template render error');
      });

      await expect(service.generateInvoicePdf(mockInvoice)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
