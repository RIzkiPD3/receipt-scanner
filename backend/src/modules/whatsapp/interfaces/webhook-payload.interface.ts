// =============================================================================
// WhatsApp Webhook Payload Interfaces
// =============================================================================
// Mendefinisikan tipe TypeScript untuk payload yang dikirim Meta ke endpoint
// POST /api/webhook. Interface ini bersifat read-only dan tidak divalidasi
// dengan class-validator karena data berasal dari pihak ketiga terpercaya (Meta).
//
// Referensi: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
// =============================================================================

// -----------------------------------------------------------------------------
// Root Payload
// -----------------------------------------------------------------------------
export interface WhatsAppWebhookPayload {
  /** Selalu bernilai "whatsapp_business_account" */
  object: string;
  entry: WhatsAppEntry[];
}

// -----------------------------------------------------------------------------
// Entry & Change
// -----------------------------------------------------------------------------
export interface WhatsAppEntry {
  /** ID WhatsApp Business Account */
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  value: WhatsAppChangeValue;
  /** Selalu bernilai "messages" */
  field: string;
}

export interface WhatsAppChangeValue {
  /** Selalu bernilai "whatsapp" */
  messaging_product: string;
  metadata: WhatsAppMetadata;
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
  errors?: WhatsAppError[];
}

// -----------------------------------------------------------------------------
// Metadata
// -----------------------------------------------------------------------------
export interface WhatsAppMetadata {
  display_phone_number: string;
  phone_number_id: string;
}

// -----------------------------------------------------------------------------
// Contact
// -----------------------------------------------------------------------------
export interface WhatsAppContact {
  profile: { name: string };
  /** Nomor WhatsApp pengirim (tanpa '+') */
  wa_id: string;
}

// -----------------------------------------------------------------------------
// Message
// -----------------------------------------------------------------------------
export interface WhatsAppMessage {
  /** Nomor telepon pengirim (tanpa '+') */
  from: string;
  /** Message ID unik dari Meta — digunakan sebagai kunci idempotency */
  id: string;
  /** Unix timestamp sebagai string */
  timestamp: string;
  type: WhatsAppMessageType;
  /** Tersedia jika type === 'text' */
  text?: { body: string };
  /** Tersedia jika type === 'image' */
  image?: WhatsAppMediaObject;
  /** Tersedia jika type === 'document' */
  document?: WhatsAppMediaObject;
  /** Tersedia jika type === 'audio' */
  audio?: WhatsAppMediaObject;
  /** Tersedia jika type === 'video' */
  video?: WhatsAppMediaObject;
  /** Tersedia jika type === 'sticker' */
  sticker?: WhatsAppMediaObject;
}

export type WhatsAppMessageType =
  | 'text'
  | 'image'
  | 'document'
  | 'audio'
  | 'video'
  | 'sticker'
  | 'location'
  | 'interactive'
  | 'button'
  | 'unsupported';

// -----------------------------------------------------------------------------
// Media Object
// -----------------------------------------------------------------------------
export interface WhatsAppMediaObject {
  caption?: string;
  mime_type: string;
  sha256: string;
  /** Media ID — digunakan untuk mengunduh media di task selanjutnya */
  id: string;
}

// -----------------------------------------------------------------------------
// Status (Delivery/Read Receipt)
// -----------------------------------------------------------------------------
export interface WhatsAppStatus {
  /** ID pesan yang di-update statusnya */
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  /** Unix timestamp sebagai string */
  timestamp: string;
  /** Nomor penerima (tanpa '+') */
  recipient_id: string;
}

// -----------------------------------------------------------------------------
// Error
// -----------------------------------------------------------------------------
export interface WhatsAppError {
  code: number;
  title: string;
  message?: string;
  error_data?: { details: string };
}
