import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

// =============================================================================
// WhatsAppModule
// =============================================================================
// Modul fitur yang mengenkapsulasi semua kode terkait WhatsApp Cloud API.
//
// Desain keputusan:
// - ConfigModule TIDAK perlu di-import di sini karena sudah didaftarkan
//   sebagai global module (isGlobal: true) di AppModule. ConfigService
//   langsung dapat diinjeksikan ke WebhookService.
// - PrismaModule TIDAK di-import karena TASK-007 tidak menyentuh database.
//
// Ekspansi di task selanjutnya:
//   - WhatsAppSenderService (pengiriman pesan) → tambahkan ke providers
//   - MediaService (download media) → tambahkan sebagai sub-module atau provider
// =============================================================================

@Module({
  controllers: [WebhookController],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WhatsAppModule {}
