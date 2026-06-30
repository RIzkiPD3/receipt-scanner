// =============================================================================
// Storage DI Token Constants
// =============================================================================
// Mendefinisikan string token yang digunakan untuk Dependency Injection
// provider penyimpanan di NestJS.
//
// Mengapa menggunakan string token, bukan class langsung?
//   - StorageProvider adalah sebuah interface. TypeScript interface tidak
//     dapat digunakan sebagai token DI secara langsung karena terhapus
//     pada saat kompilasi (type erasure).
//   - String token memungkinkan kita menggunakan @Inject(STORAGE_PROVIDER)
//     di manapun dan mengganti implementasinya dari StorageModule.
// =============================================================================

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
