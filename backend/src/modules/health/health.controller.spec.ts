import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../../database/prisma.service';
import { ServiceUnavailableException } from '@nestjs/common';

// =============================================================================
// HealthController — Unit Tests
// =============================================================================

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      $queryRawUnsafe: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    prisma = module.get(PrismaService);
  });

  it('harus mengembalikan data connected jika koneksi DB sehat', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);

    const result = await controller.getHealth();

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
    expect(result).toEqual({
      status: 'ok',
      service: 'backend',
      database: 'connected',
    });
  });

  it('harus melempar ServiceUnavailableException jika koneksi DB bermasalah', async () => {
    prisma.$queryRawUnsafe.mockRejectedValue(
      new Error('Koneksi database terputus'),
    );

    await expect(controller.getHealth()).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
  });
});
