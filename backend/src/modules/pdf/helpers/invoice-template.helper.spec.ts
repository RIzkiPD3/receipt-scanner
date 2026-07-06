import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceTemplateHelper } from './invoice-template.helper';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// InvoiceTemplateHelper — Unit Tests
// =============================================================================

describe('InvoiceTemplateHelper', () => {
  let helper: InvoiceTemplateHelper;

  // Mock template file content
  const mockTemplateContent = `
    <html>
      <body>
        <h1>{{invoiceNumber}}</h1>
        <h2>{{merchantName}}</h2>
        <p>{{issueDate}}</p>
        <p>{{currency}}</p>
        <p>{{status}}</p>
        <p>{{statusClass}}</p>
        <table><tbody>{{items}}</tbody></table>
        <div>{{subtotalRow}}</div>
        <div>{{taxRow}}</div>
        <div>{{discountRow}}</div>
        <h3>{{totalAmount}}</h3>
        <footer>{{generatedAt}}</footer>
      </body>
    </html>
  `;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InvoiceTemplateHelper],
    }).compile();

    helper = module.get<InvoiceTemplateHelper>(InvoiceTemplateHelper);

    // Mock fs.existsSync & fs.readFileSync globally for helper instance template resolution
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(mockTemplateContent);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const mockInvoice = {
    invoiceNumber: 'INV-20260706-0001',
    merchantName: 'Indomaret Keren',
    issueDate: new Date('2026-07-06T12:00:00Z'),
    currency: 'IDR',
    status: 'PAID',
    subtotal: 15000,
    taxAmount: 1500,
    discountAmount: 500,
    totalAmount: 16000,
    items: [
      { name: 'Roti Keju', quantity: 2, unitPrice: 5000, totalPrice: 10000 },
      { name: 'Kopi Susu', quantity: 1, unitPrice: 6000, totalPrice: 6000 },
    ],
  };

  describe('render()', () => {
    it('harus mengganti placeholder dasar: invoiceNumber, merchantName, currency, status', () => {
      const html = helper.render(mockInvoice);
      expect(html).toContain('INV-20260706-0001');
      expect(html).toContain('Indomaret Keren');
      expect(html).toContain('IDR');
      expect(html).toContain('PAID');
      expect(html).toContain('paid'); // statusClass
    });

    it('harus memformat tanggal transaksi (issueDate) ke bahasa Indonesia', () => {
      const html = helper.render(mockInvoice);
      expect(html).toContain('06 Juli 2026');
    });

    it('harus merender baris item tabel dengan benar', () => {
      const html = helper.render(mockInvoice);
      expect(html).toContain('Roti Keju');
      expect(html).toContain('Kopi Susu');
      expect(html).toContain('IDR 5,000.00');
      expect(html).toContain('IDR 6,000.00');
      expect(html).toContain('IDR 10,000.00');
    });

    it('harus menampilkan baris item default ketika item kosong', () => {
      const emptyInvoice = { ...mockInvoice, items: [] };
      const html = helper.render(emptyInvoice);
      expect(html).toContain('Tidak ada item');
    });

    it('harus merender baris subtotal, pajak, dan diskon secara kondisional jika > 0', () => {
      const html = helper.render(mockInvoice);
      expect(html).toContain('Subtotal');
      expect(html).toContain('Pajak');
      expect(html).toContain('Diskon');
      expect(html).toContain('IDR 15,000.00');
      expect(html).toContain('IDR 1,500.00');
      expect(html).toContain('-IDR 500.00');
      expect(html).toContain('IDR 16,000.00'); // total
    });

    it('harus tidak merender baris subtotal, pajak, dan diskon jika bernilai 0', () => {
      const zeroInvoice = {
        ...mockInvoice,
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        totalAmount: 16000,
      };
      const html = helper.render(zeroInvoice);
      expect(html).not.toContain('Subtotal');
      expect(html).not.toContain('Pajak');
      expect(html).not.toContain('Diskon');
    });
  });
});
