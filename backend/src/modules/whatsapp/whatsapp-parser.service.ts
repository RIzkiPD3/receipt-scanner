import { Injectable, Logger } from '@nestjs/common';
import type { WhatsAppWebhookPayload } from './interfaces/webhook-payload.interface';
import type { IncomingMessage } from './interfaces/incoming-message.interface';

// =============================================================================
// WhatsAppParser
// =============================================================================
// Mengurai payload mentah dari Meta WhatsApp Cloud API menjadi objek internal
// IncomingMessage. Service ini terisolasi dari handler HTTP dan database.
//
// Fitur:
// - Mengurai tipe teks (text), gambar (image), dan dokumen (document).
// - Mengkonversi timestamp UNIX menjadi JavaScript Date object.
// - Menangani ekstraksi field opsional seperti caption dan nama file asli.
// - Mengembalikan array IncomingMessage karena satu payload webhook
//   bisa mengandung beberapa pesan sekaligus.
// =============================================================================

@Injectable()
export class WhatsAppParser {
  private readonly logger = new Logger(WhatsAppParser.name);

  /**
   * Mengurai seluruh pesan yang terdapat dalam payload webhook WhatsApp.
   *
   * @param payload Payload mentah dari webhook Meta
   * @returns Array dari objek IncomingMessage yang telah dinormalisasi
   */
  parse(payload: WhatsAppWebhookPayload): IncomingMessage[] {
    const messages: IncomingMessage[] = [];

    if (!payload || payload.object !== 'whatsapp_business_account') {
      return messages;
    }

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const { value } = change;
        if (!value || !value.messages || value.messages.length === 0) {
          continue;
        }

        for (const msg of value.messages) {
          try {
            const parsed = this.parseSingleMessage(msg);
            if (parsed) {
              messages.push(parsed);
            }
          } catch (error) {
            this.logger.error(
              `Gagal mengurai pesan dengan ID: ${msg.id}. Error: ${error.message}`,
              error.stack,
              WhatsAppParser.name,
            );
          }
        }
      }
    }

    return messages;
  }

  /**
   * Mengurai satu objek pesan WhatsApp mentah.
   */
  private parseSingleMessage(msg: any): IncomingMessage | null {
    if (!msg || !msg.id || !msg.from || !msg.type) {
      return null;
    }

    const from = msg.from;
    const messageId = msg.id;
    // Mengubah unix timestamp string (detik) ke JavaScript Date
    const timestamp = new Date(Number(msg.timestamp) * 1000);
    const type = msg.type;

    const baseMessage = {
      from,
      messageId,
      timestamp,
    };

    switch (type) {
      case 'text':
        return {
          ...baseMessage,
          type: 'text',
          textBody: msg.text?.body ?? '',
        };

      case 'image':
        return {
          ...baseMessage,
          type: 'image',
          mediaId: msg.image?.id,
          mimeType: msg.image?.mime_type,
          textBody: msg.image?.caption ?? '',
        };

      case 'document':
        return {
          ...baseMessage,
          type: 'document',
          mediaId: msg.document?.id,
          mimeType: msg.document?.mime_type,
          filename: msg.document?.filename ?? '',
          textBody: msg.document?.caption ?? '',
        };

      case 'interactive':
        if (msg.interactive?.type === 'button_reply') {
          return {
            ...baseMessage,
            type: 'interactive',
            buttonReplyId: msg.interactive.button_reply?.id,
            buttonReplyTitle: msg.interactive.button_reply?.title,
            textBody: msg.interactive.button_reply?.title ?? '',
          };
        }
        this.logger.warn(
          `Tipe pesan interaktif tidak didukung: ${msg.interactive?.type} (ID Pesan: ${messageId})`,
          WhatsAppParser.name,
        );
        return {
          ...baseMessage,
          type: 'other',
          textBody: `[Tipe interaktif tidak didukung: ${msg.interactive?.type}]`,
        };

      default:
        // Menangani tipe yang tidak didukung secara spesifik di atas (misal sticker, audio, dsb.)
        this.logger.warn(
          `Tipe pesan tidak didukung: ${type} (ID Pesan: ${messageId})`,
          WhatsAppParser.name,
        );
        return {
          ...baseMessage,
          type: 'other',
          textBody: `[Tipe pesan tidak didukung: ${type}]`,
        };
    }
  }
}
