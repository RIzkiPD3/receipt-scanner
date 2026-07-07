// =============================================================================
// __mocks__/prisma-client.ts
// =============================================================================
// Manual Jest mock untuk Prisma generated client.
//
// Prisma 7 generates the client to `src/generated/prisma/client.js`, tapi
// file tersebut tidak ada saat menjalankan unit test karena `prisma generate`
// belum dijalankan di CI atau environment fresh.
//
// Mock ini menyediakan PrismaClient class stub yang bisa di-override
// per-test dengan jest.fn() / mockResolvedValue di setiap spec.
// =============================================================================

export class PrismaClient {
  invoice = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };

  receipt = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };

  receiptItem = {
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  };

  user = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  $connect = jest.fn().mockResolvedValue(undefined);
  $disconnect = jest.fn().mockResolvedValue(undefined);
  $transaction = jest.fn();

  constructor(_opts?: any) {}
}

export default PrismaClient;
