import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

// =============================================================================
// PrismaService
// =============================================================================
// Extends PrismaClient to integrate Prisma into the NestJS lifecycle.
//
// PRISMA 7 — DRIVER ADAPTER PATTERN:
//   Prisma 7 removed the Rust query engine and replaced it with a pure
//   TypeScript client that requires a "Driver Adapter" for database
//   connectivity. For PostgreSQL, we use `@prisma/adapter-pg` backed by
//   the `pg` (node-postgres) driver.
//
//   The adapter is created with the DATABASE_URL connection string and passed
//   to PrismaClient's constructor via the `adapter` option. This replaces the
//   old `datasourceUrl` / `schema.prisma url = env(...)` pattern.
//
// Why extend PrismaClient?
//   Extending gives us direct access to all Prisma query methods on `this`
//   (e.g. this.user.findMany(), this.receipt.create()). The service itself
//   IS the Prisma client — injectable everywhere via NestJS DI.
//
// Why OnModuleInit / OnModuleDestroy?
//   NestJS does NOT automatically call $connect() / $disconnect(). Without
//   these lifecycle hooks, the connection would never be explicitly released
//   on shutdown, causing connection-pool leaks and dirty shutdowns.
// =============================================================================

@Injectable()
export class PrismaService
  extends (PrismaClient as any)
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  // Expose typed access to the underlying PrismaClient instance
  declare $connect: () => Promise<void>;
  declare $disconnect: () => Promise<void>;

  constructor(private readonly configService: ConfigService) {
    // -------------------------------------------------------------------------
    // Build the Driver Adapter
    // -------------------------------------------------------------------------
    // PrismaPg wraps node-postgres (pg) and exposes the SQL driver interface
    // that Prisma 7's TypeScript client expects. The connectionString is read
    // from the validated environment via ConfigService.
    // -------------------------------------------------------------------------
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');
    const adapter = new PrismaPg({ connectionString });

    // -------------------------------------------------------------------------
    // Construct PrismaClient with the adapter
    // -------------------------------------------------------------------------
    // In Prisma 7, the `adapter` option is REQUIRED for direct database
    // connections. There is no longer a built-in query engine binary.
    // -------------------------------------------------------------------------
    super({
      adapter,
      log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
    });
  }

  // ---------------------------------------------------------------------------
  // onModuleInit
  // ---------------------------------------------------------------------------
  // Called once by NestJS when the host module has been fully initialized.
  // We eagerly connect here so that database issues surface at startup rather
  // than silently failing on the first user request.
  // ---------------------------------------------------------------------------
  async onModuleInit(): Promise<void> {
    this.logger.log('Connecting to database...');
    await this.$connect();
    this.logger.log('✅ Database connection established.');
  }

  // ---------------------------------------------------------------------------
  // onModuleDestroy
  // ---------------------------------------------------------------------------
  // Called by NestJS during graceful shutdown (SIGTERM / app.close()).
  // Ensures the connection pool is cleanly released before the process exits.
  // ---------------------------------------------------------------------------
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting from database...');
    await this.$disconnect();
    this.logger.log('Database connection closed.');
  }
}
