import { Module } from '@nestjs/common';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { STORAGE_PROVIDER } from './storage.constants';

// =============================================================================
// StorageModule
// =============================================================================
// Menyediakan STORAGE_PROVIDER sebagai global provider yang dapat diinjeksikan
// ke modul manapun tanpa perlu mengimport StorageModule ulang.
//
// Cara mengganti provider ke cloud di masa depan:
//   Cukup ubah baris ini:
//     { provide: STORAGE_PROVIDER, useClass: LocalStorageProvider }
//   Menjadi:
//     { provide: STORAGE_PROVIDER, useClass: S3StorageProvider }
//
//   Tanpa perlu menyentuh kode bisnis di WhatsAppMediaService atau modul lain.
// =============================================================================

@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      useClass: LocalStorageProvider,
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
