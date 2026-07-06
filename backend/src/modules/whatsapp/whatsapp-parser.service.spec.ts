import { Test, TestingModule } from '@nestjs/testing';
import { WhatsAppParser } from './whatsapp-parser.service';
import { WhatsAppWebhookPayload } from './interfaces/webhook-payload.interface';

// =============================================================================
// WhatsAppParser — Unit Tests
// =============================================================================

describe('WhatsAppParser', () => {
  let parser: WhatsAppParser;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsAppParser],
    }).compile();

    parser = module.get<WhatsAppParser>(WhatsAppParser);
  });

  // Helper untuk membuat webhook payload mentah
  const createMockPayload = (msg: any): WhatsAppWebhookPayload => ({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-id-123',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '123456789',
                phone_number_id: '987654321',
              },
              contacts: [{ wa_id: msg.from, profile: { name: 'Rizki' } }],
              messages: [msg],
            },
          },
        ],
      },
    ],
  });

  describe('parse()', () => {
    it('harus mengembalikan array kosong jika payload tidak valid', () => {
      const result = parser.parse(null as any);
      expect(result).toEqual([]);
    });

    it('harus mengurai pesan teks sederhana', () => {
      const mockMsg = {
        id: 'msg-id-001',
        from: '628123456789',
        timestamp: '1719990000',
        type: 'text',
        text: { body: 'Halo, saya butuh bantuan' },
      };

      const payload = createMockPayload(mockMsg);
      const result = parser.parse(payload);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        from: '628123456789',
        messageId: 'msg-id-001',
        type: 'text',
        textBody: 'Halo, saya butuh bantuan',
      });
      expect(result[0].timestamp).toBeInstanceOf(Date);
    });

    it('harus mengurai pesan interaktif (button_reply) untuk request PDF', () => {
      const mockMsg = {
        id: 'msg-id-002',
        from: '628123456789',
        timestamp: '1719990010',
        type: 'interactive',
        interactive: {
          type: 'button_reply',
          button_reply: {
            id: 'pdf_req:INV-20260706-0001',
            title: '📄 Buatkan PDF',
          },
        },
      };

      const payload = createMockPayload(mockMsg);
      const result = parser.parse(payload);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        from: '628123456789',
        messageId: 'msg-id-002',
        type: 'interactive',
        buttonReplyId: 'pdf_req:INV-20260706-0001',
        buttonReplyTitle: '📄 Buatkan PDF',
        textBody: '📄 Buatkan PDF',
      });
    });

    it('harus mengurai pesan gambar struk belanja', () => {
      const mockMsg = {
        id: 'msg-id-003',
        from: '628123456789',
        timestamp: '1719990020',
        type: 'image',
        image: {
          id: 'media-id-img-999',
          mime_type: 'image/png',
          sha256: 'xyz',
          caption: 'Struk kemarin',
        },
      };

      const payload = createMockPayload(mockMsg);
      const result = parser.parse(payload);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        from: '628123456789',
        messageId: 'msg-id-003',
        type: 'image',
        mediaId: 'media-id-img-999',
        mimeType: 'image/png',
        textBody: 'Struk kemarin',
      });
    });

    it('harus mengurai pesan dokumen PDF', () => {
      const mockMsg = {
        id: 'msg-id-004',
        from: '628123456789',
        timestamp: '1719990030',
        type: 'document',
        document: {
          id: 'media-id-doc-888',
          mime_type: 'application/pdf',
          filename: 'invoice-manual.pdf',
          caption: 'Invoice saya',
        },
      };

      const payload = createMockPayload(mockMsg);
      const result = parser.parse(payload);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        from: '628123456789',
        messageId: 'msg-id-004',
        type: 'document',
        mediaId: 'media-id-doc-888',
        mimeType: 'application/pdf',
        filename: 'invoice-manual.pdf',
        textBody: 'Invoice saya',
      });
    });

    it('harus mengembalikan tipe other jika pesan interaktif bertipe selain button_reply', () => {
      const mockMsg = {
        id: 'msg-id-005',
        from: '628123456789',
        timestamp: '1719990040',
        type: 'interactive',
        interactive: {
          type: 'list_reply', // bukan button_reply
          list_reply: { id: 'list-1', title: 'Option 1' },
        },
      };

      const payload = createMockPayload(mockMsg);
      const result = parser.parse(payload);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('other');
    });
  });
});
