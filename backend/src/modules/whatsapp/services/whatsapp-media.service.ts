import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsAppGraphClient } from '../client/whatsapp-graph.client';
import { DownloadedFileMetadata } from '../interfaces/downloaded-file.interface';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// WhatsAppMediaService
// =============================================================================
// Mengelola alur logika bisnis pengunduhan media WhatsApp.
//
// Alur:
//   1. Meminta metadata media via WhatsAppGraphClient
//   2. Memvalidasi bahwa media bertipe gambar (hanya image/* yang diterima)
//   3. Membuat folder penyimpanan sementara (TEMP_UPLOAD_DIR) jika belum ada
//   4. Mengunduh data biner berkas
//   5. Menulis biner ke file lokal menggunakan format penamaan {mediaId}.{ext}
// =============================================================================

@Injectable()
export class WhatsAppMediaService {
  private readonly logger = new Logger(WhatsAppMediaService.name);

  constructor(
    private readonly graphClient: WhatsAppGraphClient,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Mengunduh file media struk dari WhatsApp dan menyimpannya secara lokal.
   *
   * @param mediaId ID Media unik dari WhatsApp Cloud API
   * @returns Metadata dari file yang berhasil disimpan
   */
  async downloadMedia(mediaId: string): Promise<DownloadedFileMetadata> {
    this.logger.log(`Memulai proses pengunduhan media untuk ID: ${mediaId}`, WhatsAppMediaService.name);

    if (!mediaId) {
      throw new BadRequestException('Media ID wajib diisi.');
    }

    // 1. Ambil metadata media dari Meta Graph API
    let metadata;
    try {
      metadata = await this.graphClient.getMediaMetadata(mediaId);
    } catch (error) {
      this.logger.error(`Gagal mendapatkan metadata untuk Media ID: ${mediaId}`, error.stack);
      throw new NotFoundException(
        `Media dengan ID ${mediaId} tidak ditemukan atau token akses tidak valid.`,
      );
    }

    // 2. Validasi tipe media (Sistem hanya menerima file gambar untuk struk belanja)
    if (!metadata.mime_type || !metadata.mime_type.startsWith('image/')) {
      this.logger.warn(
        `Penolakan media: tipe ${metadata.mime_type || 'unknown'} tidak didukung.`,
        WhatsAppMediaService.name,
      );
      throw new BadRequestException(
        `Format file tidak didukung (${metadata.mime_type || 'unknown'}). Sistem hanya menerima file gambar (JPEG, PNG, dll.) untuk struk belanja.`,
      );
    }

    // 3. Pastikan folder penyimpanan sementara ada
    const tempDir = this.configService.get<string>('TEMP_UPLOAD_DIR') || 'temp/uploads';
    try {
      await fs.promises.mkdir(tempDir, { recursive: true });
    } catch (error) {
      this.logger.error(
        `Gagal membuat folder penyimpanan sementara di path: ${tempDir}`,
        error.stack,
        WhatsAppMediaService.name,
      );
      throw error;
    }

    // 4. Unduh konten binary media
    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await this.graphClient.downloadMediaStream(metadata.url);
    } catch (error) {
      this.logger.error(`Gagal mengunduh file binary untuk Media ID: ${mediaId}`, error.stack);
      throw error;
    }

    // 5. Tentukan extension berkas & simpan ke disk
    // Contoh: "image/jpeg" -> "jpeg", "image/png" -> "png"
    const ext = metadata.mime_type.split('/')[1] || 'jpg';
    const filename = `${mediaId}.${ext}`;
    const localPath = path.join(tempDir, filename);

    try {
      const buffer = Buffer.from(arrayBuffer);
      await fs.promises.writeFile(localPath, buffer);
      this.logger.log(
        `Berkas berhasil diunduh dan disimpan di: ${localPath} (${metadata.file_size} bytes)`,
        WhatsAppMediaService.name,
      );
    } catch (error) {
      this.logger.error(
        `Gagal menulis berkas biner ke lokal disk: ${localPath}`,
        error.stack,
        WhatsAppMediaService.name,
      );
      throw error;
    }

    return {
      filename,
      mimeType: metadata.mime_type,
      fileSize: metadata.file_size,
      localPath,
    };
  }
}
