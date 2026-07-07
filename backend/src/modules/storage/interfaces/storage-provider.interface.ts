// =============================================================================
// StorageProvider Interface
// =============================================================================
// Mendefinisikan kontrak (interface) yang harus dipenuhi oleh setiap provider
// penyimpanan file (lokal, AWS S3, MinIO, GCS, dll.).
//
// Desain berdasarkan Dependency Inversion Principle (SOLID):
//   - Modul bisnis bergantung pada abstraksi ini, BUKAN pada implementasi
//     konkret (LocalStorageProvider, S3StorageProvider, dll.).
//   - Untuk mengganti provider di masa mendatang, hanya perlu mengubah
//     konfigurasi StorageModule.providers tanpa menyentuh kode bisnis.
// =============================================================================

export interface StorageProvider {
  /**
   * Menyimpan file ke media penyimpanan.
   * @param fileBuffer Konten file dalam format Buffer
   * @param filename Nama file yang akan disimpan (misal: "MEDIA_ID.jpeg")
   * @param mimeType MIME type file (misal: "image/jpeg")
   * @returns Path lokal atau URL lengkap dari file yang disimpan
   */
  upload(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<string>;

  /**
   * Menghapus file dari media penyimpanan.
   * @param filename Nama file yang akan dihapus
   */
  delete(filename: string): Promise<void>;

  /**
   * Mengembalikan URL publik yang dapat diakses oleh Golang Worker.
   * @param filename Nama file
   * @returns URL publik lengkap (misal: "http://localhost:3000/uploads/MEDIA_ID.jpeg")
   */
  getUrl(filename: string): string;
}
