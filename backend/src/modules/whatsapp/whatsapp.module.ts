import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { WhatsAppParser } from './whatsapp-parser.service';
import { WhatsAppGraphClient } from './client/whatsapp-graph.client';
import { WhatsAppMediaService } from './services/whatsapp-media.service';
import { WhatsAppNotificationService } from './services/whatsapp-notification.service';
import { InvoiceMessageFormatter } from './formatter/invoice-message.formatter';
import { PdfRequestHandler } from './services/pdf-request.handler';
import { StorageModule } from '../storage/storage.module';
import { PdfModule } from '../pdf/pdf.module';
import { WorkerModule } from '../worker/worker.module';

// =============================================================================
// WhatsAppModule
// =============================================================================
// Modul fitur yang mengenkapsulasi semua kode terkait WhatsApp Cloud API.
// =============================================================================

@Module({
  imports: [StorageModule, PdfModule, WorkerModule],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    WhatsAppParser,
    WhatsAppGraphClient,
    WhatsAppMediaService,
    InvoiceMessageFormatter,
    WhatsAppNotificationService,
    PdfRequestHandler,
  ],
  exports: [
    WebhookService,
    WhatsAppParser,
    WhatsAppGraphClient,
    WhatsAppMediaService,
    InvoiceMessageFormatter,
    WhatsAppNotificationService,
    PdfRequestHandler,
  ],
})
export class WhatsAppModule {}
