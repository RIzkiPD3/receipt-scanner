import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceTemplateHelper } from './invoice-template.helper';

// =============================================================================
// InvoiceTemplateHelper — Unit Tests
// =============================================================================
// NOTA BENE:
//   jest.mock() é hoisted ao topo do arquivo antes de qualquer declaração.
//   Por isso NÃO é possível referenciar variáveis `const`/`let` declaradas
//   fora do factory dentro da factory de jest.mock() — causaria ReferenceError.
//   A solução é embutir o conteúdo diretamente dentro do factory.
// =============================================================================

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue(`
    <html>
      <body>
        <h1>{{invoiceNumber}}</h1>
        <h2>{{merchantName}}</h2>
        <p>{{issueDate}}</p>
        <p>{{currency}}</p>
        <p>{{status}}</p>
        <p>{{statusClass}}</p>
        <table class="items-table"><tbody>{{items}}</tbody></table>
        <div class="summary-card">
          {{subtotalRow}}
          {{taxRow}}
          {{discountRow}}
          <div class="summary-total-row"><span>{{totalAmount}}</span></div>
        </div>
        <footer>{{generatedAt}}</footer>
      </body>
    </html>
  `),
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('InvoiceTemplateHelper', () => {
  let helper: InvoiceTemplateHelper;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InvoiceTemplateHelper],
    }).compile();

    helper = module.get<InvoiceTemplateHelper>(InvoiceTemplateHelper);

    // Reset internal template cache agar setiap test mendapatkan state bersih
    (helper as any).templateHtml = null;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('render()', () => {
    it('harus mengganti placeholder dasar: invoiceNumber, merchantName, currency, status', () => {
      const html = helper.render(mockInvoice);
      expect(html).toContain('INV-20260706-0001');
      expect(html).toContain('Indomaret Keren');
      expect(html).toContain('IDR');
      expect(html).toContain('PAID');
      expect(html).toContain('paid'); // statusClass lowercase
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
      // Verifikasi kelas CSS premium
      expect(html).toContain('class="item-name"');
      expect(html).toContain('class="center"');
    });

    it('harus menampilkan baris item default ketika item kosong', () => {
      const emptyInvoice = { ...mockInvoice, items: [] };
      const html = helper.render(emptyInvoice);
      expect(html).toContain('Tidak ada item');
    });

    it('harus merender baris subtotal, pajak, dan diskon secara kondisional jika > 0', () => {
      const html = helper.render(mockInvoice);
      // Label teks
      expect(html).toContain('Subtotal');
      expect(html).toContain('Pajak');
      expect(html).toContain('Diskon');
      // Nilai nominal
      expect(html).toContain('IDR 15,000.00');
      expect(html).toContain('IDR 1,500.00');
      expect(html).toContain('-IDR 500.00');
      expect(html).toContain('IDR 16,000.00');
      // Struktur div baru (bukan tr/td)
      expect(html).toContain('class="summary-row"');
      expect(html).toContain('class="summary-label"');
      expect(html).toContain('class="summary-value"');
      expect(html).toContain('class="summary-value discount"');
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

    it('harus menggunakan "Unknown Merchant" jika merchantName tidak ada', () => {
      const noMerchantInvoice = { ...mockInvoice, merchantName: undefined };
      const html = helper.render(noMerchantInvoice);
      expect(html).toContain('Unknown Merchant');
    });

    it('harus menampilkan generatedAt timestamp WIB di footer', () => {
      const html = helper.render(mockInvoice);
      expect(html).toContain('WIB');
    });
  });
});
