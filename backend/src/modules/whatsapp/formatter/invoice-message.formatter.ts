import { Injectable } from '@nestjs/common';

// =============================================================================
// InvoiceMessageFormatter
// =============================================================================
// Bertanggung jawab mengonversi entitas Invoice menjadi teks pesan WhatsApp
// yang ringkas dan mudah dibaca pengguna.
//
// Dipisah dari WhatsAppNotificationService agar:
//   1. Mudah diuji secara unit (tidak ada dependency ke API eksternal)
//   2. Format pesan dapat diubah tanpa menyentuh logika pengiriman
// =============================================================================

@Injectable()
export class InvoiceMessageFormatter {
  /**
   * Mengformat angka menjadi string mata uang yang readable.
   * Contoh: 12500 → "12,500.00"
   */
  private formatCurrency(amount: number, currency: string): string {
    return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /**
   * Mengformat tanggal ISO menjadi string yang mudah dibaca.
   * Contoh: "2026-07-04T14:14:36.775Z" → "04 Jul 2026"
   */
  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  /**
   * Menghasilkan pesan teks WhatsApp dari entitas Invoice.
   *
   * @param invoice Entitas invoice lengkap beserta items
   * @returns String pesan yang siap dikirim ke WhatsApp
   */
  format(invoice: any): string {
    const lines: string[] = [];

    lines.push(`🧾 *INVOICE BERHASIL DIBUAT*`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`📋 No. Invoice : *${invoice.invoiceNumber}*`);
    lines.push(`🏪 Merchant    : ${invoice.merchantName}`);
    lines.push(`📅 Tanggal     : ${this.formatDate(invoice.issueDate)}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);

    // Daftar item jika ada
    if (invoice.items && invoice.items.length > 0) {
      lines.push(`📦 *Detail Item:*`);
      for (const item of invoice.items) {
        const qty = Number(item.quantity);
        const price = Number(item.unitPrice);
        const total = Number(item.totalPrice);
        if (total > 0) {
          lines.push(
            `  • ${item.name} (${qty}x @ ${this.formatCurrency(price, invoice.currency)}) = ${this.formatCurrency(total, invoice.currency)}`,
          );
        } else {
          lines.push(`  • ${item.name} (${qty}x)`);
        }
      }
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    }

    // Ringkasan total
    const subtotal = Number(invoice.subtotal);
    const tax = Number(invoice.taxAmount);
    const discount = Number(invoice.discountAmount);
    const total = Number(invoice.totalAmount);

    if (subtotal > 0) {
      lines.push(
        `💰 Subtotal   : ${this.formatCurrency(subtotal, invoice.currency)}`,
      );
    }
    if (tax > 0) {
      lines.push(
        `🏛️ Pajak      : ${this.formatCurrency(tax, invoice.currency)}`,
      );
    }
    if (discount > 0) {
      lines.push(
        `🎁 Diskon     : -${this.formatCurrency(discount, invoice.currency)}`,
      );
    }
    lines.push(
      `💵 *Total     : ${this.formatCurrency(total, invoice.currency)}*`,
    );
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`📊 Status     : ${invoice.status}`);
    lines.push(``);
    lines.push(`_Terima kasih telah menggunakan InvoiceGo!_ ✨`);

    return lines.join('\n');
  }
}
