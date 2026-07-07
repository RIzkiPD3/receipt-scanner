import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// =============================================================================
// WorkerClient
// =============================================================================
// Client HTTP terisolasi untuk berkomunikasi dengan Golang Worker.
//
// Fitur resilience yang diimplementasikan:
//   1. Timeout — menggunakan AbortController bawaan browser/Node.js.
//      Jika Golang Worker tidak merespons dalam WORKER_TIMEOUT_MS,
//      request dibatalkan agar tidak menggantung selamanya.
//
//   2. Retry dengan Exponential Backoff — jika koneksi gagal (network error
//      atau timeout), client mencoba lagi hingga WORKER_MAX_RETRIES kali
//      dengan jeda waktu yang meningkat secara eksponensial:
//        Percobaan 1 → gagal → tunggu 2 detik
//        Percobaan 2 → gagal → tunggu 4 detik
//        Percobaan 3 → gagal → throw InternalServerErrorException
//
// Menggunakan native `fetch` bawaan Node.js (zero-dependency tambahan).
// =============================================================================

export interface WorkerProcessReceiptResponse {
  status: string;
  message: string;
}

@Injectable()
export class WorkerClient {
  private readonly logger = new Logger(WorkerClient.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Mengirim request pemrosesan struk ke Golang Worker.
   *
   * @param receiptId ID struk yang akan diproses (UUID dari sisi NestJS)
   * @param imageUrl  URL publik gambar struk yang dapat diunduh oleh Worker
   * @returns Respon dari Golang Worker (status + pesan)
   */
  async sendToWorker(
    receiptId: string,
    imageUrl: string,
  ): Promise<WorkerProcessReceiptResponse> {
    const workerUrl = this.configService.get<string>('WORKER_SERVICE_URL');
    const timeoutMs =
      this.configService.get<number>('WORKER_TIMEOUT_MS') || 5000;
    const maxRetries =
      this.configService.get<number>('WORKER_MAX_RETRIES') || 3;

    const endpoint = `${workerUrl}/process-receipt`;
    const requestBody = JSON.stringify({ receiptId, imageUrl });

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.logger.log(
        `Mengirim ke Golang Worker — endpoint: ${endpoint}, receiptId: ${receiptId}, percobaan: ${attempt}/${maxRetries}`,
        WorkerClient.name,
      );

      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
          signal: controller.signal,
        });

        clearTimeout(timeoutHandle);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = (await response.json()) as WorkerProcessReceiptResponse;

        this.logger.log(
          `Respon dari Golang Worker — status: ${data.status}, message: ${data.message}`,
          WorkerClient.name,
        );

        return data;
      } catch (error) {
        clearTimeout(timeoutHandle);
        lastError = error as Error;

        const isAborted = error instanceof Error && error.name === 'AbortError';
        const label = isAborted ? 'TIMEOUT' : 'ERROR';

        this.logger.warn(
          `[Percobaan ${attempt}/${maxRetries}] ${label} — ${lastError.message}`,
          WorkerClient.name,
        );

        if (attempt < maxRetries) {
          // Exponential backoff: 2^attempt detik (2s, 4s, 8s, ...)
          const backoffMs = Math.pow(2, attempt) * 1000;
          this.logger.log(
            `Menunggu ${backoffMs / 1000}s sebelum percobaan berikutnya...`,
            WorkerClient.name,
          );
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    throw new InternalServerErrorException(
      `Gagal menghubungi Golang Worker setelah ${maxRetries} percobaan. Error terakhir: ${lastError?.message ?? 'unknown'}`,
    );
  }
}
