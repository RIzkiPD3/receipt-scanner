import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './database';
import { HealthModule } from './modules/health/health.module';

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
    // Future modules will be added here:
    //   WhatsAppModule    (TASK-005)
    //   ReceiptsModule    (TASK-006)
    //   InvoicesModule    (TASK-007)
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
