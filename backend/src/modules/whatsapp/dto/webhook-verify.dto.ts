// =============================================================================
// WebhookVerifyDto
// =============================================================================
// DTO untuk memvalidasi query parameters yang dikirim Meta saat verifikasi
// webhook (GET /api/webhook). Parameter ini bersifat fixed dan kita control,
// sehingga penggunaan class-validator di sini aman dan sesuai.
//
// Meta mengirim tiga parameter wajib:
//   hub.mode         → Selalu "subscribe"
//   hub.verify_token → Token yang harus cocok dengan WHATSAPP_VERIFY_TOKEN di .env
//   hub.challenge    → String acak yang harus dikembalikan 1:1 sebagai response
//
// Catatan: NestJS @Query() memetakan key "hub.mode" sebagai nested object
// { hub: { mode: ... } } oleh default. Untuk menghindari kerumitan ini,
// kita gunakan nama property yang sesuai dengan query string dengan
// dekorator @ApiProperty dan custom getter jika diperlukan.
// Namun karena key mengandung titik, kita gunakan pendekatan
// plain object dari @Query() tanpa DTO class-validator agar lebih
// robust. Lihat komentar di WebhookController.
// =============================================================================

import { IsNotEmpty, IsString } from 'class-validator';

export class WebhookVerifyDto {
  @IsString()
  @IsNotEmpty()
  'hub.mode': string;

  @IsString()
  @IsNotEmpty()
  'hub.verify_token': string;

  @IsString()
  @IsNotEmpty()
  'hub.challenge': string;
}
