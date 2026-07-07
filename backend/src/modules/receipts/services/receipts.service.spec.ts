import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptsService } from './receipts.service';
import { ReceiptsRepository } from '../repositories/receipts.repository';
import { PrismaService } from '../../../database/prisma.service';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { NotFoundException } from '@nestjs/common';

// =============================================================================
// ReceiptsService — Unit Tests
// =============================================================================

describe('ReceiptsService', () => {
  let service: ReceiptsService;
  let repository: jest.Mocked<ReceiptsRepository>;
  let prisma: jest.Mocked<PrismaService>;
  let invoicesService: jest.Mocked<InvoicesService>;

  beforeEach(async () => {
    const mockRepository = {
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    const mockInvoicesService = {
      generateInvoice: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptsService,
        { provide: ReceiptsRepository, useValue: mockRepository },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InvoicesService, useValue: mockInvoicesService },
      ],
    }).compile();

    service = module.get<ReceiptsService>(ReceiptsService);
    repository = module.get(ReceiptsRepository);
    prisma = module.get(PrismaService);
    invoicesService = module.get(InvoicesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createReceipt()', () => {
    const mockDto = {
      storeName: 'Indomaret Raya',
      transactionDate: '2026-07-06T12:00:00Z',
      subtotal: 10000,
      tax: 1000,
      total: 11000,
      items: [],
      imageUrl: 'http://uploads/image.jpg',
    };

    it('harus membuat receipt baru dan memicu generateInvoice jika receiptId tidak disediakan', async () => {
      const mockUser = {
        id: 'user-123',
        phoneNumber: '+628000000000',
        name: 'Default User',
      };
      prisma.user.findUnique.mockResolvedValue(mockUser as any);

      const mockReceipt = {
        id: 'receipt-123',
        status: 'PROCESSED',
        ...mockDto,
      };
      repository.create.mockResolvedValue(mockReceipt as any);
      invoicesService.generateInvoice.mockResolvedValue({
        id: 'invoice-123',
        invoiceNumber: 'INV-123',
      } as any);

      const result = await service.createReceipt(mockDto);

      expect(repository.create).toHaveBeenCalled();
      expect(invoicesService.generateInvoice).toHaveBeenCalledWith(
        'receipt-123',
      );
      expect(result).toEqual(mockReceipt);
    });

    it('harus mengupdate receipt berstatus PENDING jika receiptId disediakan dan ditemukan', async () => {
      const dtoWithId = { ...mockDto, receiptId: 'pending-receipt-123' };

      repository.findById.mockResolvedValue({
        id: 'pending-receipt-123',
        status: 'PENDING',
      } as any);

      const mockReceipt = {
        id: 'pending-receipt-123',
        status: 'PROCESSED',
        ...mockDto,
      };
      repository.update.mockResolvedValue(mockReceipt as any);
      invoicesService.generateInvoice.mockResolvedValue({
        id: 'invoice-123',
        invoiceNumber: 'INV-123',
      } as any);

      const result = await service.createReceipt(dtoWithId);

      expect(repository.findById).toHaveBeenCalledWith('pending-receipt-123');
      expect(repository.update).toHaveBeenCalledWith(
        'pending-receipt-123',
        dtoWithId,
      );
      expect(invoicesService.generateInvoice).toHaveBeenCalledWith(
        'pending-receipt-123',
      );
      expect(result).toEqual(mockReceipt);
    });

    it('harus melempar NotFoundException jika receiptId disediakan tapi tidak ditemukan di DB', async () => {
      const dtoWithId = { ...mockDto, receiptId: 'missing-receipt-123' };
      repository.findById.mockResolvedValue(null);

      await expect(service.createReceipt(dtoWithId)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.update).not.toHaveBeenCalled();
      expect(invoicesService.generateInvoice).not.toHaveBeenCalled();
    });

    it('harus tetap mengembalikan receipt meskipun proses generateInvoice otomatis mengalami kegagalan', async () => {
      const mockUser = {
        id: 'user-123',
        phoneNumber: '+628000000000',
        name: 'Default User',
      };
      prisma.user.findUnique.mockResolvedValue(mockUser as any);

      const mockReceipt = {
        id: 'receipt-123',
        status: 'PROCESSED',
        ...mockDto,
      };
      repository.create.mockResolvedValue(mockReceipt as any);
      invoicesService.generateInvoice.mockRejectedValue(
        new Error('Generate invoice crash'),
      );

      const result = await service.createReceipt(mockDto);

      expect(repository.create).toHaveBeenCalled();
      expect(invoicesService.generateInvoice).toHaveBeenCalledWith(
        'receipt-123',
      );
      // Memastikan flow tidak terhenti dan data receipt tetap dikembalikan (Error Recovery)
      expect(result).toEqual(mockReceipt);
    });
  });
});
