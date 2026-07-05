import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WhatsAppParser } from './whatsapp-parser.service';
import { WhatsAppGraphClient } from './client/whatsapp-graph.client';
import { WhatsAppMediaService } from './services/whatsapp-media.service';
import { WhatsAppNotificationService } from './services/whatsapp-notification.service';
import { InvoiceMessageFormatter } from './formatter/invoice-message.formatter';
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
//
// Ekspansi di TASK-016:
//   - InvoiceMessageFormatter → memformat pesan invoice menjadi teks WhatsApp
//   - WhatsAppNotificationService → mengorkestrasi format + kirim notifikasi
// =============================================================================

@Module({
  imports: [StorageModule],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    WhatsAppParser,
    WhatsAppGraphClient,
    WhatsAppMediaService,
    InvoiceMessageFormatter,
    WhatsAppNotificationService,
  ],
  exports: [
    WebhookService,
    WhatsAppParser,
    WhatsAppGraphClient,
    WhatsAppMediaService,
    InvoiceMessageFormatter,
    WhatsAppNotificationService,
  ],
})
export class WhatsAppModule {}

