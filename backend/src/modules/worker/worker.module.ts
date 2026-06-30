import { Module } from '@nestjs/common';
import { WorkerClient } from './client/worker.client';

// =============================================================================
// WorkerModule
// =============================================================================
// Mengenkapsulasi semua kode komunikasi dengan Golang Worker.
// WorkerClient diekspor agar dapat diinjeksikan ke modul bisnis lain
// (misal: ReceiptsModule, WhatsAppModule).
// =============================================================================

@Module({
  providers: [WorkerClient],
  exports: [WorkerClient],
})
export class WorkerModule {}
