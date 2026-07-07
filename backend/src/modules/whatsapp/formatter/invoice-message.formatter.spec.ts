import { InvoiceMessageFormatter } from './invoice-message.formatter';

// =============================================================================
// InvoiceMessageFormatter — Unit Tests
// =============================================================================
// Pengujian unit terisolasi tanpa dependency ke API eksternal.
// Semua skenario format pesan WhatsApp dikover di sini.
// =============================================================================

describe('InvoiceMessageFormatter', () => {
  let formatter: InvoiceMessageFormatter;

  // Invoice lengkap sebagai fixture baseline
  const baseInvoice = {
    invoiceNumber: 'INV-20260704-0001',
    merchantName: 'Warung Makan Bahagia',
    issueDate: new Date('2026-07-04T14:14:36.775Z'),
    currency: 'IDR',
    subtotal: 50000,
    taxAmount: 5000,
    discountAmount: 2500,
    totalAmount: 52500,
    status: 'DRAFT',
    items: [
      { name: 'Nasi Goreng', quantity: 2, unitPrice: 15000, totalPrice: 30000 },
      { name: 'Es Teh', quantity: 2, unitPrice: 5000, totalPrice: 10000 },
      { name: 'Kerupuk', quantity: 1, unitPrice: 2000, totalPrice: 0 }, // totalPrice 0 → format minimal
    ],
  };

  beforeEach(() => {
    formatter = new InvoiceMessageFormatter();
  });

  // ---------------------------------------------------------------------------
  // format() — struktur dasar
  // ---------------------------------------------------------------------------
  describe('format()', () => {
    it('harus mengembalikan string (bukan undefined/null)', () => {
      const result = formatter.format(baseInvoice);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('harus menyertakan nomor invoice di output', () => {
      const result = formatter.format(baseInvoice);
      expect(result).toContain('INV-20260704-0001');
    });

    it('harus menyertakan nama merchant di output', () => {
      const result = formatter.format(baseInvoice);
      expect(result).toContain('Warung Makan Bahagia');
    });

    it('harus menyertakan status invoice di output', () => {
      const result = formatter.format(baseInvoice);
      expect(result).toContain('DRAFT');
    });

    it('harus menyertakan header INVOICE BERHASIL DIBUAT', () => {
      const result = formatter.format(baseInvoice);
      expect(result).toContain('INVOICE BERHASIL DIBUAT');
    });

    it('harus menyertakan footer ucapan terima kasih', () => {
      const result = formatter.format(baseInvoice);
      expect(result).toContain('Terima kasih');
    });
  });

  // ---------------------------------------------------------------------------
  // formatCurrency (tested via format())
  // ---------------------------------------------------------------------------
  describe('format currency', () => {
    it('harus memformat total amount dengan simbol currency', () => {
      const result = formatter.format(baseInvoice);
      // Expects "IDR 52,500.00"
      expect(result).toContain('IDR');
      expect(result).toContain('52,500.00');
    });

    it('harus memformat subtotal dengan benar ketika subtotal > 0', () => {
      const result = formatter.format(baseInvoice);
      expect(result).toContain('50,000.00');
    });

    it('harus menampilkan jumlah 0 dengan dua desimal', () => {
      const invoice = {
        ...baseInvoice,
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        totalAmount: 0,
        items: [],
      };
      const result = formatter.format(invoice);
      expect(result).toContain('0.00');
    });
  });

  // ---------------------------------------------------------------------------
  // formatDate (tested via format())
  // ---------------------------------------------------------------------------
  describe('format date', () => {
    it('harus memformat tanggal ke format yang mudah dibaca', () => {
      const result = formatter.format(baseInvoice);
      // Tanggal "2026-07-04" → mengandung "2026" dan "Jul" atau "Jul"
      expect(result).toMatch(/2026/);
    });

    it('harus menerima objek Date maupun string ISO', () => {
      const invoiceWithStringDate = {
        ...baseInvoice,
        issueDate: '2026-07-04T00:00:00.000Z' as any,
      };
      expect(() => formatter.format(invoiceWithStringDate)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Section: Items
  // ---------------------------------------------------------------------------
  describe('items section', () => {
    it('harus menyertakan nama semua item', () => {
      const result = formatter.format(baseInvoice);
      expect(result).toContain('Nasi Goreng');
      expect(result).toContain('Es Teh');
      expect(result).toContain('Kerupuk');
    });

    it('harus menampilkan qty dan unit price untuk item dengan totalPrice > 0', () => {
      const result = formatter.format(baseInvoice);
      // Nasi Goreng: 2x @ IDR 15,000.00 = IDR 30,000.00
      expect(result).toContain('2x');
      expect(result).toContain('15,000.00');
      expect(result).toContain('30,000.00');
    });

    it('harus menampilkan format minimal (tanpa harga) untuk item dengan totalPrice = 0', () => {
      const result = formatter.format(baseInvoice);
      // Kerupuk: format minimal tanpa "= IDR ..."
      expect(result).toContain('Kerupuk (1x)');
    });

    it('harus tidak menampilkan section item jika items kosong', () => {
      const invoice = { ...baseInvoice, items: [] };
      const result = formatter.format(invoice);
      expect(result).not.toContain('Detail Item');
    });

    it('harus tidak menampilkan section item jika items undefined', () => {
      const invoice = { ...baseInvoice, items: undefined };
      const result = formatter.format(invoice);
      expect(result).not.toContain('Detail Item');
    });
  });

  // ---------------------------------------------------------------------------
  // Section: Pajak (Tax)
  // ---------------------------------------------------------------------------
  describe('tax section', () => {
    it('harus menampilkan baris pajak ketika taxAmount > 0', () => {
      const result = formatter.format(baseInvoice);
      expect(result).toContain('Pajak');
      expect(result).toContain('5,000.00');
    });

    it('harus menyembunyikan baris pajak ketika taxAmount = 0', () => {
      const invoice = { ...baseInvoice, taxAmount: 0 };
      const result = formatter.format(invoice);
      expect(result).not.toContain('Pajak');
    });
  });

  // ---------------------------------------------------------------------------
  // Section: Diskon
  // ---------------------------------------------------------------------------
  describe('discount section', () => {
    it('harus menampilkan baris diskon ketika discountAmount > 0', () => {
      const result = formatter.format(baseInvoice);
      expect(result).toContain('Diskon');
      expect(result).toContain('-IDR 2,500.00');
    });

    it('harus menyembunyikan baris diskon ketika discountAmount = 0', () => {
      const invoice = { ...baseInvoice, discountAmount: 0 };
      const result = formatter.format(invoice);
      expect(result).not.toContain('Diskon');
    });
  });

  // ---------------------------------------------------------------------------
  // Section: Subtotal
  // ---------------------------------------------------------------------------
  describe('subtotal section', () => {
    it('harus menampilkan subtotal ketika subtotal > 0', () => {
      const result = formatter.format(baseInvoice);
      expect(result).toContain('Subtotal');
    });

    it('harus menyembunyikan subtotal ketika subtotal = 0', () => {
      const invoice = { ...baseInvoice, subtotal: 0 };
      const result = formatter.format(invoice);
      expect(result).not.toContain('Subtotal');
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------
  describe('edge cases', () => {
    it('harus menangani merchant name dengan karakter khusus', () => {
      const invoice = { ...baseInvoice, merchantName: 'Café & Resto "Jaya"' };
      expect(() => formatter.format(invoice)).not.toThrow();
      expect(formatter.format(invoice)).toContain('Café & Resto "Jaya"');
    });

    it('harus menangani angka desimal (Prisma Decimal) yang dipasskan sebagai number', () => {
      const invoice = {
        ...baseInvoice,
        totalAmount: 125750.5,
        subtotal: 125750.5,
      };
      const result = formatter.format(invoice);
      expect(result).toContain('125,750.50');
    });

    it('harus menangani currency selain IDR', () => {
      const invoice = { ...baseInvoice, currency: 'USD', totalAmount: 99.99 };
      const result = formatter.format(invoice);
      expect(result).toContain('USD');
      expect(result).toContain('99.99');
    });
  });
});
