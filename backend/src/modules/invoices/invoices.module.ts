import { Module } from '@nestjs/common';
import { InvoicesController } from './controllers/invoices.controller';
import { InvoicesService } from './services/invoices.service';
import { InvoicesRepository } from './repositories/invoices.repository';
import { InvoicesMapper } from './mapper/invoices.mapper';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesRepository, InvoicesMapper],
  exports: [InvoicesService, InvoicesRepository, InvoicesMapper],
})
export class InvoicesModule {}
