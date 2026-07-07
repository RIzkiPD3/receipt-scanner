import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { WhatsAppGraphClient } from './whatsapp-graph.client';

// =============================================================================
// WhatsAppGraphClient — Unit Tests
// =============================================================================
// Global fetch di-mock agar tidak ada request jaringan nyata.
// Setiap test memvalidasi perilaku klien terhadap respons API yang berbeda.
// =============================================================================

// Mock native fetch sebelum import apapun memanggil fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('WhatsAppGraphClient', () => {
  let client: WhatsAppGraphClient;
  let configService: jest.Mocked<ConfigService>;

  const MOCK_TOKEN = 'test-bearer-token-xyz';
  const MOCK_PHONE_ID = '123456789';

  beforeEach(async () => {
    const mockConfigService: Partial<jest.Mocked<ConfigService>> = {
      get: jest.fn((key: string) => {
        const envMap: Record<string, string> = {
          WHATSAPP_ACCESS_TOKEN: MOCK_TOKEN,
          WHATSAPP_PHONE_NUMBER_ID: MOCK_PHONE_ID,
        };
        return envMap[key];
      }) as any,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppGraphClient,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);

    client = module.get<WhatsAppGraphClient>(WhatsAppGraphClient);
    configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  const recipientPhone = '628111222333';

  // ---------------------------------------------------------------------------
  // sendTextMessage()
  // ---------------------------------------------------------------------------
  describe('sendTextMessage()', () => {
    const messageText = 'Halo, ini pesan tes!';

    it('harus memanggil fetch ke endpoint Meta yang benar', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue('{"messages":[{"id":"wamid.xxx"}]}'),
      });

      await client.sendTextMessage(recipientPhone, messageText);

      const [calledUrl] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe(
        `https://graph.facebook.com/v21.0/${MOCK_PHONE_ID}/messages`,
      );
    });

    it('harus menggunakan metode POST', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue('{"messages":[{"id":"wamid.xxx"}]}'),
      });

      await client.sendTextMessage(recipientPhone, messageText);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('POST');
    });

    it('harus menyertakan Bearer token di header Authorization', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue('{"messages":[{"id":"wamid.xxx"}]}'),
      });

      await client.sendTextMessage(recipientPhone, messageText);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe(`Bearer ${MOCK_TOKEN}`);
    });

    it('harus mengirim body JSON dengan struktur yang benar', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue('{}'),
      });

      await client.sendTextMessage(recipientPhone, messageText);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);

      expect(body).toMatchObject({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'text',
        text: { body: messageText },
      });
    });

    it('harus melempar InternalServerErrorException ketika API mengembalikan 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: jest
          .fn()
          .mockResolvedValue('{"error":{"message":"Invalid OAuth token"}}'),
      });

      await expect(
        client.sendTextMessage(recipientPhone, messageText),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ---------------------------------------------------------------------------
  // sendInteractiveButtonMessage()
  // ---------------------------------------------------------------------------
  describe('sendInteractiveButtonMessage()', () => {
    const bodyText = 'Invoice berhasil dibuat!';
    const buttons = [{ id: 'pdf_req:INV-123', title: '📄 Buatkan PDF' }];

    it('harus memanggil POST ke endpoint messages dengan payload interactive', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest
          .fn()
          .mockResolvedValue('{"messages":[{"id":"wamid.button"}]}'),
      });

      await client.sendInteractiveButtonMessage(
        recipientPhone,
        bodyText,
        buttons,
      );

      const [calledUrl, options] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe(
        `https://graph.facebook.com/v21.0/${MOCK_PHONE_ID}/messages`,
      );
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body).toMatchObject({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: bodyText },
          action: {
            buttons: [
              {
                type: 'reply',
                reply: { id: 'pdf_req:INV-123', title: '📄 Buatkan PDF' },
              },
            ],
          },
        },
      });
    });

    it('harus melempar InternalServerErrorException jika Meta API return non-2xx', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: jest
          .fn()
          .mockResolvedValue('{"error":{"message":"Invalid buttons"}}'),
      });

      await expect(
        client.sendInteractiveButtonMessage(recipientPhone, bodyText, buttons),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ---------------------------------------------------------------------------
  // uploadMedia()
  // ---------------------------------------------------------------------------
  describe('uploadMedia()', () => {
    const mockFileBuffer = Buffer.from('%PDF-1.4 mock content');
    const mockFilename = 'INV-123.pdf';
    const mockMimeType = 'application/pdf';

    it('harus mengirim request multipart/form-data ke endpoint media Meta', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue('{"id":"media-uploaded-id-xyz"}'),
      });

      const mediaId = await client.uploadMedia(
        mockFileBuffer,
        mockFilename,
        mockMimeType,
      );

      expect(mediaId).toBe('media-uploaded-id-xyz');
      const [calledUrl, options] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe(
        `https://graph.facebook.com/v21.0/${MOCK_PHONE_ID}/media`,
      );
      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);
    });

    it('harus melempar InternalServerErrorException jika upload gagal', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Upload failed internally'),
      });

      await expect(
        client.uploadMedia(mockFileBuffer, mockFilename, mockMimeType),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ---------------------------------------------------------------------------
  // sendDocumentMessage()
  // ---------------------------------------------------------------------------
  describe('sendDocumentMessage()', () => {
    const mockMediaId = 'media-12345';
    const mockFilename = 'INV-123.pdf';
    const mockCaption = 'Ini berkas PDF Anda';

    it('harus mengirim payload type: document ke endpoint messages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: jest.fn().mockResolvedValue('{"messages":[{"id":"wamid.doc"}]}'),
      });

      await client.sendDocumentMessage(
        recipientPhone,
        mockMediaId,
        mockFilename,
        mockCaption,
      );

      const [calledUrl, options] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe(
        `https://graph.facebook.com/v21.0/${MOCK_PHONE_ID}/messages`,
      );
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body).toMatchObject({
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: 'document',
        document: {
          id: mockMediaId,
          filename: mockFilename,
          caption: mockCaption,
        },
      });
    });

    it('harus melempar InternalServerErrorException jika sendDocument gagal', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: jest.fn().mockResolvedValue('Invalid media id'),
      });

      await expect(
        client.sendDocumentMessage(
          recipientPhone,
          mockMediaId,
          mockFilename,
          mockCaption,
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ---------------------------------------------------------------------------
  // getMediaMetadata()
  // ---------------------------------------------------------------------------
  describe('getMediaMetadata()', () => {
    const mockMediaId = 'media-id-abc123';

    it('harus mengembalikan metadata yang benar saat sukses', async () => {
      const mockMetadata = {
        url: 'https://lookaside.fbsbx.com/test',
        mime_type: 'image/jpeg',
        file_size: 99999,
        id: mockMediaId,
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockMetadata),
      });

      const result = await client.getMediaMetadata(mockMediaId);
      expect(result).toEqual(mockMetadata);
    });
  });

  // ---------------------------------------------------------------------------
  // downloadMediaStream()
  // ---------------------------------------------------------------------------
  describe('downloadMediaStream()', () => {
    const downloadUrl = 'https://lookaside.fbsbx.com/media/test123';

    it('harus mengembalikan ArrayBuffer dari response yang sukses', async () => {
      const mockBuffer = new ArrayBuffer(100);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(mockBuffer),
      });

      const result = await client.downloadMediaStream(downloadUrl);
      expect(result).toBe(mockBuffer);
    });
  });
});
