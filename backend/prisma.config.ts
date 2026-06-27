// =============================================================================
// prisma.config.ts
// =============================================================================
// Prisma 7 configuration file. This file is used by the Prisma CLI to
// locate the schema, migrations folder, and database connection URL.
//
// It loads environment variables from `.env` via `dotenv/config` so that the
// DATABASE_URL is available when running CLI commands (e.g. prisma migrate dev)
// without requiring a running NestJS application.
// =============================================================================

import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  // Path to the Prisma schema file (relative to this config file)
  schema: 'prisma/schema.prisma',

  // Migrations directory (relative to this config file)
  migrations: {
    path: 'prisma/migrations',
  },

  // Database connection URL — read from the DATABASE_URL environment variable.
  // This must be a valid PostgreSQL connection string:
  //   postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
