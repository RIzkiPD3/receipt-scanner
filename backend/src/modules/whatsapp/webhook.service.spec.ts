import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service';
import { ConfigService } from '@nestjs/config';
import { WhatsAppParser } from './whatsapp-parser.service';
import { PdfRequestHandler } from './services/pdf-request.handler';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppMediaService } from './services/whatsapp-media.service';
import { WorkerClient } from '../worker/client/worker.client';
import { ForbiddenException } from '@nestjs/common';
import { WhatsAppGraphClient } from './client/whatsapp-graph.client';

// =============================================================================
// WebhookService — Unit Tests
// =============================================================================

describe('WebhookService', () => {
  let service: WebhookService;
  let configService: jest.Mocked<ConfigService>;
  let parser: jest.Mocked<WhatsAppParser>;
  let pdfRequestHandler: jest.Mocked<PdfRequestHandler>;
  let mediaService: jest.Mocked<WhatsAppMediaService>;
  let workerClient: jest.Mocked<WorkerClient>;
  let prisma: jest.Mocked<PrismaService>;
  let whatsappClient: jest.Mocked<WhatsAppGraphClient>;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'WHATSAPP_VERIFY_TOKEN') return 'secure_token';
        if (key === 'APP_URL') return 'http://test-server';
        return null;
      }),
    };

    const mockParser = {
      parse: jest.fn(),
    };

    const mockPdfRequestHandler = {
      isPdfRequest: jest.fn(),
      handle: jest.fn(),
    };

    const mockMediaService = {
      downloadMedia: jest.fn(),
    };

    const mockWorkerClient = {
      sendToWorker: jest.fn(),
    };

    const mockWhatsAppGraphClient = {
      sendTextMessage: jest.fn().mockResolvedValue(undefined),
    };

    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      receipt: {
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({} as any),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: WhatsAppParser, useValue: mockParser },
        { provide: PdfRequestHandler, useValue: mockPdfRequestHandler },
        { provide: WhatsAppMediaService, useValue: mockMediaService },
        { provide: WorkerClient, useValue: mockWorkerClient },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WhatsAppGraphClient, useValue: mockWhatsAppGraphClient },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
    configService = module.get(ConfigService);
    parser = module.get(WhatsAppParser);
    pdfRequestHandler = module.get(PdfRequestHandler);
    mediaService = module.get(WhatsAppMediaService);
    workerClient = module.get(WorkerClient);
    prisma = module.get(PrismaService);
    whatsappClient = module.get(WhatsAppGraphClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyWebhook()', () => {
    it('harus mengembalikan challenge jika verify_token sesuai', () => {
      const result = service.verifyWebhook(
        'subscribe',
        'secure_token',
        'rand_challenge_123',
      );
      expect(result).toBe('rand_challenge_123');
    });

    it('harus melempar ForbiddenException jika verify_token tidak sesuai', () => {
      expect(() =>
        service.verifyWebhook('subscribe', 'wrong_token', 'rand_challenge_123'),
      ).toThrow(ForbiddenException);
    });

    it('harus melempar ForbiddenException jika mode bukan subscribe', () => {
      expect(() =>
        service.verifyWebhook('other', 'secure_token', 'rand_challenge_123'),
      ).toThrow(ForbiddenException);
    });
  });

  describe('handleWebhookEvent()', () => {
    const basePayload = {
      object: 'whatsapp_business_account',
      entry: [],
    };

    it('harus memproses interactive button PDF request jika parser mendeteksinya', async () => {
      const mockMessage = {
        type: 'interactive',
        from: '628123456789',
        messageId: 'msg-1',
        buttonReplyId: 'pdf_req:INV-123',
      };
      parser.parse.mockReturnValue([mockMessage as any]);
      pdfRequestHandler.isPdfRequest.mockReturnValue(true);
      pdfRequestHandler.handle.mockResolvedValue(undefined);

      service.handleWebhookEvent(basePayload);

      expect(parser.parse).toHaveBeenCalledWith(basePayload);
      expect(pdfRequestHandler.isPdfRequest).toHaveBeenCalledWith(
        'pdf_req:INV-123',
      );
      expect(pdfRequestHandler.handle).toHaveBeenCalledWith(
        '628123456789',
        'pdf_req:INV-123',
      );
    });

    it('harus mengunduh gambar struk, menyimpan ke DB, dan memanggil worker secara asinkron jika bertipe image', async () => {
      const mockMessage = {
        type: 'image',
        from: '628123456789',
        messageId: 'msg-image-123',
        mediaId: 'media-abc-123',
      };
      parser.parse.mockReturnValue([mockMessage as any]);

      prisma.user.findUnique.mockResolvedValue({ id: 'user-id-123' } as any);
      mediaService.downloadMedia.mockResolvedValue({
        filename: 'media-abc-123.jpg',
      } as any);
      prisma.receipt.create.mockResolvedValue({
        id: 'receipt-uuid-abc',
      } as any);
      workerClient.sendToWorker.mockResolvedValue({
        status: 'success',
        message: 'started',
      });

      service.handleWebhookEvent(basePayload);

      // Webhook handler bersifat async/background untuk pengolahan gambar, jadi kita tunggu scheduler mikro
      await new Promise((resolve) => process.nextTick(resolve));

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { phoneNumber: '628123456789' },
      });
      expect(mediaService.downloadMedia).toHaveBeenCalledWith('media-abc-123');
      expect(prisma.receipt.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-id-123',
          whatsappMessageId: 'msg-image-123',
          whatsappMediaId: 'media-abc-123',
          imageUrl: 'http://test-server/uploads/media-abc-123.jpg',
          status: 'PENDING',
        },
      });
      expect(workerClient.sendToWorker).toHaveBeenCalledWith(
        'receipt-uuid-abc',
        'http://test-server/uploads/media-abc-123.jpg',
      );
    });

    it('harus mengirim pesan WhatsApp error jika downloadMedia gagal', async () => {
      const mockMessage = {
        type: 'image',
        from: '628123456789',
        messageId: 'msg-image-123',
        mediaId: 'media-abc-123',
      };
      parser.parse.mockReturnValue([mockMessage as any]);

      prisma.user.findUnique.mockResolvedValue({ id: 'user-id-123' } as any);
      mediaService.downloadMedia.mockRejectedValue(new Error('Format file tidak didukung'));

      service.handleWebhookEvent(basePayload);

      await new Promise((resolve) => process.nextTick(resolve));

      expect(mediaService.downloadMedia).toHaveBeenCalledWith('media-abc-123');
      expect(whatsappClient.sendTextMessage).toHaveBeenCalledWith(
        '628123456789',
        expect.stringContaining('Format file tidak didukung'),
      );
    });

    it('harus mengirim pesan WhatsApp error dan mengubah status ke FAILED jika worker gagal', async () => {
      const mockMessage = {
        type: 'image',
        from: '628123456789',
        messageId: 'msg-image-123',
        mediaId: 'media-abc-123',
      };
      parser.parse.mockReturnValue([mockMessage as any]);

      prisma.user.findUnique.mockResolvedValue({ id: 'user-id-123' } as any);
      mediaService.downloadMedia.mockResolvedValue({
        filename: 'media-abc-123.jpg',
      } as any);
      prisma.receipt.create.mockResolvedValue({
        id: 'receipt-uuid-abc',
      } as any);
      prisma.receipt.update.mockResolvedValue({} as any);
      workerClient.sendToWorker.mockRejectedValue(new Error('ocr menghasilkan teks kosong'));

      service.handleWebhookEvent(basePayload);

      await new Promise((resolve) => process.nextTick(resolve));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(prisma.receipt.update).toHaveBeenCalledWith({
        where: { id: 'receipt-uuid-abc' },
        data: { status: 'PROCESSING' },
      });
      expect(prisma.receipt.update).toHaveBeenCalledWith({
        where: { id: 'receipt-uuid-abc' },
        data: { status: 'FAILED' },
      });
      expect(whatsappClient.sendTextMessage).toHaveBeenCalledWith(
        '628123456789',
        expect.stringContaining('kurang jelas atau buram'),
      );
    });
  });
});
