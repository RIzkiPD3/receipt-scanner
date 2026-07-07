import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

// =============================================================================
// HealthController
// =============================================================================
// Menangani REST endpoint GET /health untuk monitoring kesehatan sistem.
// Memverifikasi status koneksi ke database PostgreSQL via Prisma secara dinamis.
// =============================================================================

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth() {
    try {
      // Jalankan query SQL sederhana untuk memastikan koneksi database aktif
      await this.prisma.$queryRawUnsafe('SELECT 1');

      return {
        status: 'ok',
        service: 'backend',
        database: 'connected',
      };
    } catch (error) {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'backend',
        database: 'disconnected',
      });
    }
  }
}
