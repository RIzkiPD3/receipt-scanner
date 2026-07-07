import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import type { StorageProvider } from '../interfaces/storage-provider.interface';

// =============================================================================
// LocalStorageProvider
// =============================================================================
// Implementasi konkret StorageProvider untuk pengembangan lokal.
// File disimpan ke direktori TEMP_UPLOAD_DIR (default: temp/uploads) dan
// diakses publik via static serving di main.ts (GET /uploads/:filename).
//
// Ketika berpindah ke cloud (S3, MinIO, GCS), hanya perlu:
//   1. Membuat S3StorageProvider yang mengimplementasikan StorageProvider
//   2. Mengganti `useClass` di StorageModule.providers
// =============================================================================

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Menulis file Buffer ke disk lokal.
   * @returns Path relatif lokal dari file yang disimpan
   */
  async upload(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<string> {
    const uploadDir =
      this.configService.get<string>('TEMP_UPLOAD_DIR') || 'temp/uploads';

    // Pastikan direktori tujuan ada (buat secara rekursif jika belum ada)
    await fs.promises.mkdir(uploadDir, { recursive: true });

    const localPath = path.join(uploadDir, filename);
    await fs.promises.writeFile(localPath, fileBuffer);

    this.logger.debug(
      `[${mimeType}] File berhasil disimpan lokal: ${localPath}`,
      LocalStorageProvider.name,
    );

    return localPath;
  }

  /**
   * Menghapus file dari disk lokal.
   * Kegagalan tidak melempar exception agar proses bisnis tidak terhenti.
   */
  async delete(filename: string): Promise<void> {
    const uploadDir =
      this.configService.get<string>('TEMP_UPLOAD_DIR') || 'temp/uploads';
    const localPath = path.join(uploadDir, filename);

    try {
      await fs.promises.unlink(localPath);
      this.logger.debug(
        `File berhasil dihapus: ${localPath}`,
        LocalStorageProvider.name,
      );
    } catch (error) {
      this.logger.warn(
        `Gagal menghapus file ${localPath}: ${error.message}`,
        LocalStorageProvider.name,
      );
    }
  }

  /**
   * Menghasilkan URL publik yang dapat diakses oleh Golang Worker.
   * Format: {APP_URL}/uploads/{filename}
   * Contoh: http://localhost:3000/uploads/MEDIA_ID_123.jpeg
   */
  getUrl(filename: string): string {
    const appUrl =
      this.configService.get<string>('APP_URL') || 'http://localhost:3000';
    return `${appUrl}/uploads/${filename}`;
  }
}
