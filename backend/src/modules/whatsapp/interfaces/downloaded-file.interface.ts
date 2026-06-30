// =============================================================================
// DownloadedFileMetadata Interface
// =============================================================================
// Merepresentasikan metadata dari berkas media yang berhasil diunduh secara
// lokal dari WhatsApp Cloud API. Format ini akan digunakan oleh modul internal
// NestJS lain (seperti modul pemrosesan OCR).
// =============================================================================

export interface DownloadedFileMetadata {
  /** Nama berkas yang disimpan secara lokal (misal: "MEDIA_ID.jpg") */
  filename: string;

  /** MIME type berkas dari Meta (misal: "image/jpeg") */
  mimeType: string;

  /** Ukuran berkas dalam bytes */
  fileSize: number;

  /** Path absolut/relatif lengkap dari file yang disimpan secara lokal */
  localPath: string;
}
