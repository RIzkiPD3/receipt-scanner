import { Module } from '@nestjs/common';
import { ReceiptsController } from './controllers/receipts.controller';
import { ReceiptsService } from './services/receipts.service';
import { ReceiptsRepository } from './repositories/receipts.repository';

@Module({
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptsRepository],
  exports: [ReceiptsService, ReceiptsRepository],
})
export class ReceiptsModule {}
