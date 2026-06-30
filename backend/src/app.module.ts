import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './database';
import { HealthModule } from './modules/health/health.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';

// =============================================================================
// AppModule — Root Application Module
// =============================================================================
// Import order follows dependency layering:
//   1. ConfigModule   — must be first so env vars are available globally
//   2. PrismaModule   — database layer, global scope (no need to re-import)
//   3. Feature modules — depend on config & database
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
    // Feature Modules
    // -------------------------------------------------------------------------
    HealthModule,

    // WhatsAppModule — handles Meta webhook verification & incoming events
    // Implemented in TASK-007
    WhatsAppModule,

    // Future modules will be added here:
    //   ReceiptsModule    (TASK-008)
    //   InvoicesModule    (TASK-009)
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}

