import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// =============================================================================
// PrismaModule
// =============================================================================
// A globally-scoped NestJS module that provides and exports PrismaService.
//
// Why @Global()?
//   Marking this module as @Global() means it only needs to be imported ONCE
//   in AppModule. After that, PrismaService is automatically available for
//   injection in every other module without requiring them to import
//   PrismaModule individually. This avoids repetitive imports across dozens
//   of feature modules while keeping the DI graph clean.
//
// exports: [PrismaService]
//   Exporting PrismaService makes it injectable outside this module. Without
//   this export, only components declared inside PrismaModule could inject it.
// =============================================================================

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
