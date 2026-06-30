import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import type { WhatsAppWebhookPayload } from './interfaces/webhook-payload.interface';
import { WebhookService } from './webhook.service';

// =============================================================================
// WebhookController
// =============================================================================
// Menangani dua endpoint webhook WhatsApp Cloud API:
//
//   GET  /api/webhook  → Verifikasi handshake dari Meta (satu kali saat setup)
//   POST /api/webhook  → Menerima event real-time dari WhatsApp
//
// Desain keputusan penting:
//
// 1. Mengapa @Query() tanpa DTO class di GET?
//    Meta mengirim query key dengan titik seperti "hub.mode". NestJS @Query()
//    dengan ValidationPipe (whitelist: true) dan DTO class tidak dapat
//    menangani key yang mengandung titik secara otomatis karena akan diparsing
//    sebagai nested object (hub: { mode: ... }). Kita destructure manual
//    dari query object untuk keandalan maksimal.
//
// 2. Mengapa @HttpCode(HttpStatus.OK) di POST?
//    Default NestJS untuk POST adalah 201 Created. Meta mengharapkan 200 OK.
//    Jika mendapat non-200, Meta akan terus melakukan retry webhook yang sama.
//
// 3. Mengapa @Body() typed sebagai WhatsAppWebhookPayload bukan DTO?
//    Payload POST dari Meta sangat kompleks. Menggunakan interface TypeScript
//    memberikan type safety di kompilasi tanpa risiko menolak payload valid
//    karena ketidakcocokan skema runtime (class-validator).
// =============================================================================

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly webhookService: WebhookService) {}

  // ---------------------------------------------------------------------------
  // GET /api/webhook
  // ---------------------------------------------------------------------------
  // Endpoint verifikasi webhook dari Meta Developer Platform.
  //
  // Meta mengirim tiga query params:
  //   ?hub.mode=subscribe
  //   &hub.verify_token=<token yang kita set di Meta Dashboard>
  //   &hub.challenge=<string acak>
  //
  // Jika token cocok → kembalikan hub.challenge sebagai plain text (string)
  // Jika token tidak cocok → 403 Forbidden (ditangani WebhookService)
  // ---------------------------------------------------------------------------
  @Get()
  verifyWebhook(@Query() query: Record<string, string>): string {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    this.logger.log(
      `GET /webhook verification request received — mode: ${mode}`,
      WebhookController.name,
    );

    if (!mode || !token || !challenge) {
      this.logger.warn(
        'GET /webhook missing required query parameters',
        WebhookController.name,
      );
      throw new ForbiddenException(
        'Missing required webhook verification parameters.',
      );
    }

    return this.webhookService.verifyWebhook(mode, token, challenge);
  }

  // ---------------------------------------------------------------------------
  // POST /api/webhook
  // ---------------------------------------------------------------------------
  // Endpoint penerima event real-time dari WhatsApp Cloud API.
  //
  // Meta mengirim payload JSON untuk setiap event:
  //   - Pesan masuk (text, image, document, dsb.)
  //   - Status update (sent, delivered, read, failed)
  //   - Error notifikasi
  //
  // Penting: Kita selalu kembalikan 200 OK sesegera mungkin.
  // Jika response > 20 detik atau non-200, Meta akan melakukan retry.
  // Pemrosesan berat (OCR, AI, dll.) harus dilakukan secara asinkron
  // di task-task selanjutnya, BUKAN di sini.
  // ---------------------------------------------------------------------------
  @Post()
  @HttpCode(HttpStatus.OK)
  receiveWebhook(
    @Body() payload: WhatsAppWebhookPayload,
  ): { status: string } {
    this.logger.log(
      `POST /webhook event received — object: ${payload?.object ?? 'unknown'}`,
      WebhookController.name,
    );

    // Delegasikan seluruh pemrosesan dan logging ke service
    this.webhookService.handleWebhookEvent(payload);

    // Segera kembalikan 200 OK ke Meta
    return { status: 'ok' };
  }
}
