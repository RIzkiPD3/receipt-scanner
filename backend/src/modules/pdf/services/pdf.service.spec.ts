import { Test, TestingModule } from '@nestjs/testing';
import { PdfService } from './pdf.service';
import { InvoiceTemplateHelper } from '../helpers/invoice-template.helper';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

// Mock puppeteer globally
jest.mock('puppeteer');

describe('PdfService', () => {
  let service: PdfService;
  let templateHelper: jest.Mocked<InvoiceTemplateHelper>;

  const mockInvoice = {
    invoiceNumber: 'INV-20260706-9999',
    merchantName: 'Mock Merchant',
    issueDate: new Date(),
    currency: 'USD',
    totalAmount: 100,
    items: [],
  };

  const mockHtml = '<html><body>Mock HTML Invoice</body></html>';
  const mockPdfBuffer = Buffer.from('%PDF-1.4 mock content');

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

    // Mock fs promises
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined as any);
    jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('generateInvoicePdf()', () => {
    it('harus memanggil templateHelper.render() dengan invoice yang dikirim', async () => {
      // Mock Puppeteer launch & page
      const mockPage = {
        setContent: jest.fn().mockResolvedValue(undefined),
        pdf: jest.fn().mockResolvedValue(mockPdfBuffer),
      };
      const mockBrowser = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn().mockResolvedValue(undefined),
      };
      (puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);

      await service.generateInvoicePdf(mockInvoice);

      expect(templateHelper.render).toHaveBeenCalledWith(mockInvoice);
    });

    it('harus berinteraksi dengan Puppeteer untuk mengisi konten dan men-generate PDF', async () => {
      const mockPage = {
        setContent: jest.fn().mockResolvedValue(undefined),
        pdf: jest.fn().mockResolvedValue(mockPdfBuffer),
      };
      const mockBrowser = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn().mockResolvedValue(undefined),
      };
      (puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);

      const result = await service.generateInvoicePdf(mockInvoice);

      expect(puppeteer.launch).toHaveBeenCalled();
      expect(mockBrowser.newPage).toHaveBeenCalled();
      expect(mockPage.setContent).toHaveBeenCalledWith(mockHtml, { waitUntil: 'networkidle0' });
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

    it('harus menulis file PDF ke folder disk lokal', async () => {
      const mockPage = {
        setContent: jest.fn().mockResolvedValue(undefined),
        pdf: jest.fn().mockResolvedValue(mockPdfBuffer),
      };
      const mockBrowser = {
        newPage: jest.fn().mockResolvedValue(mockPage),
        close: jest.fn().mockResolvedValue(undefined),
      };
      (puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);

      const writeFileSpy = jest.spyOn(fs.promises, 'writeFile');

      await service.generateInvoicePdf(mockInvoice);

      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.stringContaining(path.join('storage', 'pdf', 'INV-20260706-9999.pdf')),
        mockPdfBuffer,
      );
    });

    it('harus melempar InternalServerErrorException jika Puppeteer gagal', async () => {
      (puppeteer.launch as jest.Mock).mockRejectedValue(new Error('Browser crash'));

      await expect(service.generateInvoicePdf(mockInvoice)).rejects.toThrow();
    });
  });
});
