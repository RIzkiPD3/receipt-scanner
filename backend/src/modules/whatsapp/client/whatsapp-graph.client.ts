import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// =============================================================================
// MetaMediaMetadata Interface
// =============================================================================
export interface MetaMediaMetadata {
  url: string;
  mime_type: string;
  file_size: number;
  id: string;
}

// =============================================================================
// WhatsAppGraphClient
// =============================================================================
// Kelas terisolasi khusus untuk menangani komunikasi langsung dengan Meta Graph
// API. Ini mempermudah pengujian dan menjaga isolasi dari logika bisnis.
//
// Menggunakan native fetch bawaan Node.js untuk mematuhi aturan zero-dependency
// tambahan untuk HTTP client (tanpa Axios).
// =============================================================================

@Injectable()
export class WhatsAppGraphClient {
  private readonly logger = new Logger(WhatsAppGraphClient.name);
  private readonly graphApiVersion = 'v21.0';

  constructor(private readonly configService: ConfigService) {}

  /**
   * Mendapatkan header otentikasi Bearer Token.
   */
  private getAuthHeaders(): HeadersInit {
    const token = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  /**
   * Mengambil URL unduhan sementara dan metadata media dari Meta Graph API.
   *
   * GET https://graph.facebook.com/v21.0/{mediaId}
   *
   * @param mediaId ID Media unik dari WhatsApp
   */
  async getMediaMetadata(mediaId: string): Promise<MetaMediaMetadata> {
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${mediaId}`;
    this.logger.log(`Mengambil metadata media dari Graph API: ${url}`, WhatsAppGraphClient.name);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `Gagal mengambil metadata media (HTTP ${response.status}): ${errorBody}`,
          WhatsAppGraphClient.name,
        );
        throw new InternalServerErrorException(
          `Meta Graph API returned status ${response.status}: ${errorBody}`,
        );
      }

      const data = await response.json() as MetaMediaMetadata;
      this.logger.debug(
        `Metadata diterima: URL=${data.url}, MIME=${data.mime_type}, Size=${data.file_size}`,
        WhatsAppGraphClient.name,
      );

      return data;
    } catch (error) {
      this.logger.error(
        `Terjadi error saat memanggil Meta Graph API untuk ID: ${mediaId}`,
        error.stack,
        WhatsAppGraphClient.name,
      );
      throw error;
    }
  }

  /**
   * Mengunduh file biner media dari URL unduhan sementara lookaside Meta.
   *
   * GET https://lookaside.fbsbx.com/whatsapp_mediamanager/...
   *
   * @param downloadUrl URL unduhan sementara dari getMediaMetadata
   */
  async downloadMediaStream(downloadUrl: string): Promise<ArrayBuffer> {
    this.logger.log(`Mengunduh file biner media dari: ${downloadUrl}`, WhatsAppGraphClient.name);

    try {
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(
          `Gagal mengunduh biner media (HTTP ${response.status}): ${errorBody}`,
          WhatsAppGraphClient.name,
        );
        throw new InternalServerErrorException(
          `Meta lookaside API returned status ${response.status}: ${errorBody}`,
        );
      }

      return await response.arrayBuffer();
    } catch (error) {
      this.logger.error(
        `Terjadi error saat mengunduh media dari URL: ${downloadUrl}`,
        error.stack,
        WhatsAppGraphClient.name,
      );
      throw error;
    }
  }

  /**
   * Mengirim pesan teks ke pengguna WhatsApp melalui Meta Cloud API.
   *
   * POST https://graph.facebook.com/v21.0/{phoneNumberId}/messages
   *
   * @param to   Nomor telepon penerima (format internasional tanpa +, misal: 628123456789)
   * @param text Isi pesan teks yang akan dikirim
   */
  async sendTextMessage(to: string, text: string): Promise<void> {
    const phoneNumberId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${phoneNumberId}/messages`;

    this.logger.log(
      `Mengirim pesan WhatsApp ke ${to} (${text.length} karakter)`,
      WhatsAppGraphClient.name,
    );

    const body = JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body,
      });

      const responseText = await response.text();

      if (!response.ok) {
        this.logger.error(
          `Gagal mengirim pesan WhatsApp (HTTP ${response.status}): ${responseText}`,
          WhatsAppGraphClient.name,
        );
        throw new InternalServerErrorException(
          `WhatsApp API returned status ${response.status}: ${responseText}`,
        );
      }

      this.logger.log(
        `Pesan WhatsApp berhasil dikirim ke ${to}. Response: ${responseText}`,
        WhatsAppGraphClient.name,
      );
    } catch (error) {
      this.logger.error(
        `Terjadi error saat mengirim pesan WhatsApp ke ${to}`,
        error instanceof Error ? error.stack : String(error),
        WhatsAppGraphClient.name,
      );
      throw error;
    }
  }
}
