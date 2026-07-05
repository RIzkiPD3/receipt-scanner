import { Module } from '@nestjs/common';
import { InvoicesController } from './controllers/invoices.controller';
import { InvoicesService } from './services/invoices.service';
import { InvoicesRepository } from './repositories/invoices.repository';
import { InvoicesMapper } from './mapper/invoices.mapper';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsAppModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesRepository, InvoicesMapper],
  exports: [InvoicesService, InvoicesRepository, InvoicesMapper],
})
export class InvoicesModule {}
