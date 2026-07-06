// =============================================================================
// IncomingMessage Interface
// =============================================================================
// Merepresentasikan struktur pesan WhatsApp yang telah diurai (normalized).
// Ini adalah objek internal yang bersih yang akan digunakan oleh modul-modul
// bisnis backend NestJS tanpa bergantung pada detail schema API Meta.
// =============================================================================

export interface IncomingMessage {
  /** Nomor telepon pengirim (misal: "628111222333") */
  from: string;

  /** ID unik pesan WhatsApp dari Meta */
  messageId: string;

  /** Waktu pengiriman pesan yang telah dikonversi ke objek Date */
  timestamp: Date;

  /** Tipe isi pesan */
  type: 'text' | 'image' | 'document' | 'interactive' | 'other';

  /** Konten teks pesan (jika bertipe 'text', atau berupa caption gambar/dokumen) */
  textBody?: string;

  /** Media ID dari Meta (jika bertipe 'image' atau 'document') untuk diunduh nanti */
  mediaId?: string;

  /** MIME type dari berkas media (jika bertipe 'image' atau 'document') */
  mimeType?: string;

  /** Nama file asli (jika bertipe 'document') */
  filename?: string;

  /** ID tombol yang ditekan (untuk tipe 'interactive' button_reply) */
  buttonReplyId?: string;

  /** Judul/Label tombol yang ditekan */
  buttonReplyTitle?: string;
}
