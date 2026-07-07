// =============================================================================
// __mocks__/prisma-adapter-pg.ts
// =============================================================================
// Manual Jest mock untuk @prisma/adapter-pg.
//
// PrismaService (database/prisma.service.ts) mengimpor PrismaPg dari paket
// ini dan membutuhkan DATABASE_URL saat construct. Dalam unit test, kita
// tidak ingin membuat koneksi database nyata — cukup stub class PrismaPg.
// =============================================================================

export class PrismaPg {
  constructor(_opts?: any) {}
}

export default { PrismaPg };
