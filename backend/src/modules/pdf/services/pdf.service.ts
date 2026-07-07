import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { InvoiceTemplateHelper } from '../helpers/invoice-template.helper';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// PdfService
// =============================================================================
// Mengorkestrasi render HTML dan menggunakan Puppeteer tanpa kepala (headless)
// untuk mengonversi HTML menjadi dokumen PDF PDF-A4 profesional.
// File disimpan di direktori storage/pdf/ secara lokal.
// =============================================================================

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(private readonly templateHelper: InvoiceTemplateHelper) {}

  /**
   * Menghasilkan file PDF dari data Invoice, menyimpannya ke disk, dan mengembalikan path + buffer.
   *
   * @param invoice Entitas Invoice dari database
   * @returns Objek berisi pdfPath dan pdfBuffer
   */
  async generateInvoicePdf(invoice: any): Promise<{ pdfPath: string; pdfBuffer: Buffer }> {
    this.logger.log(`Memulai proses pembuatan berkas PDF untuk invoice: ${invoice.invoiceNumber}`, PdfService.name);
    
    // 1. Render data invoice ke template HTML
    let html: string;
    try {
      html = this.templateHelper.render(invoice);
    } catch (err: any) {
      this.logger.error(
        `Gagal memformat HTML template untuk invoice: ${invoice.invoiceNumber}`,
        err instanceof Error ? err.stack : String(err),
        PdfService.name,
      );
      throw new InternalServerErrorException(`Gagal me-render template invoice HTML: ${err.message}`);
    }

    // 2. Gunakan Puppeteer untuk membuat PDF
    let browser: puppeteer.Browser | null = null;
    try {
      this.logger.log(`Menjalankan instance Puppeteer headless...`, PdfService.name);
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      const page = await browser.newPage();
      
      this.logger.log(`Memasukkan konten HTML ke Puppeteer page...`, PdfService.name);
      await page.setContent(html, { waitUntil: 'load' });

      this.logger.log(`Men-generate buffer PDF (A4, margin 20mm)...`, PdfService.name);
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm',
        },
      });

      // 3. Simpan file ke direktori storage/pdf
      const storageDir = path.join(process.cwd(), 'storage/pdf');
      if (!fs.existsSync(storageDir)) {
        this.logger.log(`Membuat direktori penyimpanan PDF: ${storageDir}`, PdfService.name);
        await fs.promises.mkdir(storageDir, { recursive: true });
      }

      const pdfPath = path.join(storageDir, `${invoice.invoiceNumber}.pdf`);
      this.logger.log(`Menulis berkas PDF ke: ${pdfPath}`, PdfService.name);
      await fs.promises.writeFile(pdfPath, pdfBuffer);

      this.logger.log(
        `✅ Berkas PDF berhasil dibuat. Path: ${pdfPath} (${pdfBuffer.length} bytes)`,
        PdfService.name,
      );

      return {
        pdfPath,
        pdfBuffer: Buffer.from(pdfBuffer),
      };
    } catch (error: any) {
      this.logger.error(
        `Terjadi error saat mengonversi invoice ${invoice.invoiceNumber} ke PDF`,
        error instanceof Error ? error.stack : String(error),
        PdfService.name,
      );
      throw new InternalServerErrorException(`Gagal memproses pembuatan berkas PDF: ${error.message}`);
    } finally {
      if (browser) {
        this.logger.log(`Menutup browser Puppeteer...`, PdfService.name);
        await browser.close();
      }
    }
  }
}
