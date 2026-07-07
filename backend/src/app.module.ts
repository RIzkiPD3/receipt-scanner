import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './database';
import { HealthModule } from './modules/health/health.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { StorageModule } from './modules/storage/storage.module';
import { WorkerModule } from './modules/worker/worker.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PdfModule } from './modules/pdf/pdf.module';

// =============================================================================
// AppModule — Root Application Module
// =============================================================================
// Import order follows dependency layering:
//   1. ConfigModule   — must be first so env vars are available globally
//   2. PrismaModule   — database layer, global scope (no need to re-import)
//   3. StorageModule  — storage abstraction layer (TASK-010)
//   4. WorkerModule   — komunikasi dengan Golang Worker (TASK-010)
//   5. Feature modules — depend on config & database
// =============================================================================

@Module({
  imports: [
    // -------------------------------------------------------------------------
    // ConfigModule
    // -------------------------------------------------------------------------
    // isGlobal: true  → ConfigService injectable everywhere without re-importing
    // validate        → Joi schema validation; throws at startup if env is bad
    // -------------------------------------------------------------------------
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),

    // -------------------------------------------------------------------------
    // PrismaModule
    // -------------------------------------------------------------------------
    // @Global() on PrismaModule means PrismaService is now injectable in every
    // feature module without requiring them to import PrismaModule themselves.
    // -------------------------------------------------------------------------
    PrismaModule,

    // -------------------------------------------------------------------------
    // Infrastructure Modules (TASK-010)
    // -------------------------------------------------------------------------
    // StorageModule — menyediakan STORAGE_PROVIDER (LocalStorageProvider)
    //                 sebagai abstraksi penyimpanan file yang dapat diganti
    //                 ke S3/MinIO/GCS tanpa mengubah kode bisnis.
    StorageModule,

    // WorkerModule — menyediakan WorkerClient untuk berkomunikasi dengan
    //               Golang Worker via HTTP REST (dengan retry + timeout).
    WorkerModule,

    // PdfModule — modul generator dokumen PDF
    PdfModule,

    // -------------------------------------------------------------------------
    // Feature Modules
    // -------------------------------------------------------------------------
    HealthModule,

    // WhatsAppModule — handles Meta webhook verification & incoming events
    // Implemented in TASK-007, expanded in TASK-009 & TASK-010
    WhatsAppModule,

    // ReceiptsModule — handles receipt storage (TASK-014)
    ReceiptsModule,

    // InvoicesModule — handles invoice generation (TASK-015)
    InvoicesModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
