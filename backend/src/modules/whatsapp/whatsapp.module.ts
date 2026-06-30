import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WhatsAppParser } from './whatsapp-parser.service';
import { WhatsAppGraphClient } from './client/whatsapp-graph.client';
import { WhatsAppMediaService } from './services/whatsapp-media.service';
import { StorageModule } from '../storage/storage.module';

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
// Ekspansi di TASK-009:
//   - WhatsAppGraphClient (koneksi API Graph) → ditambahkan ke providers
//   - WhatsAppMediaService (manajemen file lokal) → ditambahkan ke providers
//
// Ekspansi di TASK-010:
//   - StorageModule → diimport agar STORAGE_PROVIDER token tersedia
//     untuk WhatsAppMediaService (Dependency Inversion pada penyimpanan).
// =============================================================================

@Module({
  imports: [StorageModule],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    WhatsAppParser,
    WhatsAppGraphClient,
    WhatsAppMediaService,
  ],
  exports: [
    WebhookService,
    WhatsAppParser,
    WhatsAppGraphClient,
    WhatsAppMediaService,
  ],
})
export class WhatsAppModule {}

