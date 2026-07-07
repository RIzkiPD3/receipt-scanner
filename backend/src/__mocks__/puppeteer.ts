// =============================================================================
// __mocks__/puppeteer.ts
// =============================================================================
// Manual Jest mock untuk modul puppeteer yang menggunakan ESM (pure module).
// Jest berjalan di mode CommonJS sehingga tidak bisa mem-parse export ESM
// secara langsung. File ini menyediakan stub yang dapat digunakan kembali
// oleh semua test yang mengimpor puppeteer.
//
// Cara penggunaan di spec:
//   jest.mock('puppeteer');                 // ← sudah ditangani moduleNameMapper
//   (puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);
// =============================================================================

const puppeteer = {
  launch: jest.fn(),
};

export default puppeteer;
export const launch = puppeteer.launch;
