import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { DownloadedFileMetadata } from '../interfaces/downloaded-file.interface';
import type { StorageProvider } from '../../storage/interfaces/storage-provider.interface';
import { STORAGE_PROVIDER } from '../../storage/storage.constants';
import { WhatsAppGraphClient } from '../client/whatsapp-graph.client';

// =============================================================================
// WhatsAppMediaService
// =============================================================================
// Mengelola alur logika bisnis pengunduhan media WhatsApp.
//
// Alur (diperbarui di TASK-010):
//   1. Meminta metadata media via WhatsAppGraphClient
//   2. Memvalidasi bahwa media bertipe gambar (hanya image/* yang diterima)
//   3. Mengunduh data biner berkas
//   4. Menyimpan file via StorageProvider (abstraksi — lokal atau cloud)
//   5. Mengembalikan metadata file yang disimpan beserta URL publiknya
//
// Perubahan TASK-010:
//   - Tidak lagi menggunakan fs.promises.writeFile secara langsung.
//   - Bergantung pada StorageProvider (Dependency Inversion), sehingga
//     dapat dipindah ke S3/MinIO tanpa mengubah file ini.
// =============================================================================

@Injectable()
export class WhatsAppMediaService {
  private readonly logger = new Logger(WhatsAppMediaService.name);

  constructor(
    private readonly graphClient: WhatsAppGraphClient,
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
  ) {}

  /**
   * Mengunduh file media struk dari WhatsApp dan menyimpannya via StorageProvider.
   *
   * @param mediaId ID Media unik dari WhatsApp Cloud API
   * @returns Metadata dari file yang berhasil disimpan, termasuk URL publik
   */
  async downloadMedia(mediaId: string): Promise<DownloadedFileMetadata> {
    this.logger.log(
      `Memulai proses pengunduhan media untuk ID: ${mediaId}`,
      WhatsAppMediaService.name,
    );

    if (!mediaId) {
      throw new BadRequestException('Media ID wajib diisi.');
    }

    // 1. Ambil metadata media dari Meta Graph API
    let metadata: {
      url: string;
      mime_type: string;
      file_size: number;
      id: string;
    };
    try {
      metadata = await this.graphClient.getMediaMetadata(mediaId);
    } catch (error) {
      this.logger.error(
        `Gagal mendapatkan metadata untuk Media ID: ${mediaId}`,
        error.stack,
      );
      throw new NotFoundException(
        `Media dengan ID ${mediaId} tidak ditemukan atau token akses tidak valid.`,
      );
    }

    // 2. Validasi tipe media (hanya menerima gambar untuk struk belanja)
    if (!metadata.mime_type || !metadata.mime_type.startsWith('image/')) {
      this.logger.warn(
        `Penolakan media: tipe ${metadata.mime_type || 'unknown'} tidak didukung.`,
        WhatsAppMediaService.name,
      );
      throw new BadRequestException(
        `Format file tidak didukung (${metadata.mime_type || 'unknown'}). Sistem hanya menerima file gambar untuk struk belanja.`,
      );
    }

    // 3. Unduh konten binary media
    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await this.graphClient.downloadMediaStream(metadata.url);
    } catch (error) {
      this.logger.error(
        `Gagal mengunduh file binary untuk Media ID: ${mediaId}`,
        error.stack,
      );
      throw error;
    }

    // 4. Tentukan nama berkas dan simpan via StorageProvider
    // Format: {mediaId}.{ext} → Contoh: MEDIA_ID_123.jpeg
    const ext = metadata.mime_type.split('/')[1] || 'jpg';
    const filename = `${mediaId}.${ext}`;
    const buffer = Buffer.from(arrayBuffer);

    let localPath: string;
    try {
      localPath = await this.storageProvider.upload(
        buffer,
        filename,
        metadata.mime_type,
      );
      this.logger.log(
        `Berkas berhasil disimpan via StorageProvider: ${localPath} (${metadata.file_size} bytes)`,
        WhatsAppMediaService.name,
      );
    } catch (error) {
      this.logger.error(
        `Gagal menyimpan berkas via StorageProvider untuk Media ID: ${mediaId}`,
        error.stack,
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
