// =============================================================================
// database/index.ts — Barrel Export
// =============================================================================
// Re-exports all public symbols from the database module so that other modules
// can import from '@/database' rather than referencing deep file paths.
// =============================================================================

export { PrismaModule } from './prisma.module';
export { PrismaService } from './prisma.service';
