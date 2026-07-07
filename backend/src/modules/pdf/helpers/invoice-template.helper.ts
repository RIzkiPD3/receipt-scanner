import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// InvoiceTemplateHelper
// =============================================================================
// Bertanggung jawab memuat berkas template HTML dan menyuntikkan data invoice
// ke dalam placeholder template (string interpolation).
//
// Dipisahkan dari PdfService agar mudah diuji secara unit secara terisolasi.
//
// Pembaruan TASK-017:
//   - Rows summary diubah dari <tr>/<td> menjadi <div class="summary-row">
//     agar sesuai dengan template baru yang berbasis flex div (bukan tabel).
//   - Kolom item diperbarui ke kelas CSS baru: .right / .center / .item-name /
//     .item-total sesuai desain template premium.
// =============================================================================

@Injectable()
export class InvoiceTemplateHelper {
  private readonly logger = new Logger(InvoiceTemplateHelper.name);
  private templateHtml: string | null = null;

  /**
   * Mendapatkan string template HTML. Lazy-loaded dan di-cache dalam memory.
   */
  private getTemplate(): string {
    if (this.templateHtml) {
      return this.templateHtml;
    }

    const pathsToTry = [
      path.join(__dirname, '../templates/invoice.html'),
      path.join(__dirname, '..', 'templates', 'invoice.html'),
      path.join(process.cwd(), 'src/modules/pdf/templates/invoice.html'),
      path.join(process.cwd(), 'dist/modules/pdf/templates/invoice.html'),
    ];

    for (const p of pathsToTry) {
      if (fs.existsSync(p)) {
        this.logger.log(`Template invoice HTML ditemukan di: ${p}`, InvoiceTemplateHelper.name);
        this.templateHtml = fs.readFileSync(p, 'utf8');
        return this.templateHtml;
      }
    }

    throw new Error(`Template invoice.html tidak ditemukan di path manapun!`);
  }

  /**
   * Mengformat mata uang secara konsisten.
   * Contoh: (12500, 'IDR') → 'IDR 12,500.00'
   */
  private formatCurrency(amount: number, currency: string): string {
    return `${currency} ${amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  /**
   * Mengformat tanggal transaksi ke bahasa Indonesia.
   * Contoh: Date('2026-07-06') → '06 Juli 2026'
   */
  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  /**
   * Mengubah data invoice menjadi HTML string yang siap dikonversi ke PDF.
   *
   * @param invoice Entitas Invoice lengkap beserta items
   * @returns String HTML lengkap
   */
  render(invoice: any): string {
    this.logger.log(
      `Memformat data untuk render HTML invoice: ${invoice.invoiceNumber}`,
      InvoiceTemplateHelper.name,
    );
    const template = this.getTemplate();

    // -------------------------------------------------------------------------
    // 1. Render item table rows  (<tr> sesuai .items-table di template baru)
    // -------------------------------------------------------------------------
    let itemsHtml = '';
    if (invoice.items && invoice.items.length > 0) {
      invoice.items.forEach((item: any) => {
        const qty = Number(item.quantity);
        const price = Number(item.unitPrice);
        const total = Number(item.totalPrice);

        const priceStr = total > 0 ? this.formatCurrency(price, invoice.currency) : '-';
        const totalStr = total > 0 ? this.formatCurrency(total, invoice.currency) : '-';

        itemsHtml += `
          <tr>
            <td class="item-name">${item.name}</td>
            <td class="center">${qty}</td>
            <td class="right">${priceStr}</td>
            <td class="right item-total">${totalStr}</td>
          </tr>
        `;
      });
    } else {
      itemsHtml = `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:28px 14px;font-size:13px;">Tidak ada item</td></tr>`;
    }

    // -------------------------------------------------------------------------
    // 2. Render summary div-rows  (<div class="summary-row"> sesuai template baru)
    // -------------------------------------------------------------------------
    const subtotal = Number(invoice.subtotal);
    const tax = Number(invoice.taxAmount);
    const discount = Number(invoice.discountAmount);
    const total = Number(invoice.totalAmount);

    let subtotalRow = '';
    if (subtotal > 0) {
      subtotalRow = `
        <div class="summary-row">
          <span class="summary-label">Subtotal</span>
          <span class="summary-value">${this.formatCurrency(subtotal, invoice.currency)}</span>
        </div>
      `;
    }

    let taxRow = '';
    if (tax > 0) {
      taxRow = `
        <div class="summary-row">
          <span class="summary-label">Pajak</span>
          <span class="summary-value">${this.formatCurrency(tax, invoice.currency)}</span>
        </div>
      `;
    }

    let discountRow = '';
    if (discount > 0) {
      discountRow = `
        <div class="summary-row">
          <span class="summary-label">Diskon</span>
          <span class="summary-value discount">-${this.formatCurrency(discount, invoice.currency)}</span>
        </div>
      `;
    }

    // -------------------------------------------------------------------------
    // 3. Status class (lowercase slug) untuk badge styling
    // -------------------------------------------------------------------------
    const statusClass = (invoice.status || 'draft').toLowerCase();

    // -------------------------------------------------------------------------
    // 4. Timestamps
    // -------------------------------------------------------------------------
    const generatedAtStr =
      new Date().toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }) + ' WIB';

    const issueDateStr = this.formatDate(invoice.issueDate);

    // -------------------------------------------------------------------------
    // 5. Replace all placeholders
    // -------------------------------------------------------------------------
    const rendered = template
      .replace(/\{\{invoiceNumber\}\}/g, invoice.invoiceNumber)
      .replace(/\{\{merchantName\}\}/g, invoice.merchantName || 'Unknown Merchant')
      .replace(/\{\{issueDate\}\}/g, issueDateStr)
      .replace(/\{\{currency\}\}/g, invoice.currency || 'USD')
      .replace(/\{\{status\}\}/g, invoice.status || 'DRAFT')
      .replace(/\{\{statusClass\}\}/g, statusClass)
      .replace(/\{\{items\}\}/g, itemsHtml)
      .replace(/\{\{subtotalRow\}\}/g, subtotalRow)
      .replace(/\{\{taxRow\}\}/g, taxRow)
      .replace(/\{\{discountRow\}\}/g, discountRow)
      .replace(/\{\{totalAmount\}\}/g, this.formatCurrency(total, invoice.currency))
      .replace(/\{\{generatedAt\}\}/g, generatedAtStr);

    this.logger.log(
      `✅ Template berhasil di-render (${rendered.length} karakter)`,
      InvoiceTemplateHelper.name,
    );

    return rendered;
  }
}
