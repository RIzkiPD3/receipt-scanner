# 🧾 Receipt Scanner & Automated Invoicing System (InvoiceGo)

Sistem pemindaian struk belanja otomatis berbasis AI yang menerima gambar struk belanja dari **WhatsApp Cloud API**, melakukan ekstraksi teks secara lokal menggunakan **Tesseract OCR**, menguraikan data struk menjadi JSON terstruktur menggunakan **NVIDIA Nemotron AI**, menyimpan data struk, memicu pembuatan **Invoice**, men-generate berkas **PDF Invoice** profesional, dan mengirimkannya kembali ke pengguna via WhatsApp.

---

## 🏗️ Diagram Arsitektur Sistem

```
                      ┌────────────────────────────────────────┐
                      │              WhatsApp User             │
                      └───────────────────┬────────────────────┘
                                          │
                        (1) Kirim Gambar  │  (8) Kirim Dokumen PDF
                        atau Klik Tombol  │      (Invoice & Teks)
                                          ▼
                      ┌────────────────────────────────────────┐
                      │          Meta Webhook HTTP API         │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
    ┌────────────────────────────────────────────────────────────────────────┐
    │                      NestJS Backend Application                        │
    │                                                                        │
    │  ┌──────────────────┐    ┌─────────────────┐    ┌───────────────────┐  │
    │  │ WebhookController│───►│ WebhookService  │───►│WhatsAppMediaSvc   │  │
    │  └──────────────────┘    └────────┬────────┘    └───────────────────┘  │
    │                                   │                       │            │
    │                                   │ (2) Trigger Async     │ (3) Save   │
    │                                   ▼                       ▼            │
    │  ┌──────────────────┐    ┌─────────────────┐    ┌───────────────────┐  │
    │  │   WorkerClient   │◄───│  Prisma Service │    │ StorageProvider   │  │
    │  └────────┬─────────┘    └─────────────────┘    └───────────────────┘  │
    └───────────┼───────────────────────────────────────────────▲────────────┘
                │                                               │
                │ (4) POST /process-receipt                     │ (6) GET Image
                ▼                                               │
    ┌───────────────────────────────────────────────────────────┼────────────┐
    │                       Golang Worker Service               │            │
    │                                                                        │
    │  ┌──────────────────┐    ┌─────────────────┐    ┌─────────┴─────────┐  │
    │  │  ReceiptHandler  │───►│ProcessingService│───►│    OCRService     │  │
    │  └────────┬─────────┘    └────────┬────────┘    └─────────┬─────────┘  │
    │           │                       │                       │            │
    │           │ (7) POST /receipts    │                       ├─►Tesseract │
    │           │     (Save data)       ▼                       │  OCR CLI   │
    │           │              ┌─────────────────┐              └────────────┘
    │           ▼              │  LLM Provider   │                           │
    │  ┌──────────────────┐    │(NVIDIA Nemotron)│                           │
    │  │  BackendClient   │    └─────────────────┘                           │
    │  └──────────────────┘                                                  │
    └────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

### Backend Service (NestJS)
- **Framework**: NestJS v11 (TypeScript Strict Mode)
- **Database ORM**: Prisma v7 (Driver Adapter Pattern)
- **Database Engine**: PostgreSQL 17
- **PDF Renderer**: Puppeteer v25 (Headless Chromium)
- **Networking**: Native Fetch (Zero external dependencies)
- **Validation**: class-validator & Joi (Startup config validation)

### OCR & Parsing Service (Go Worker)
- **Language**: Go (Golang 1.24)
- **OCR Engine**: Tesseract OCR CLI (v5.x)
- **AI Engine**: NVIDIA Nemotron-3 (via OpenAI Compatible HTTP API)
- **Logger**: Standard `log/slog` (Structured JSON in production)

---

## 📁 Struktur Folder Proyek

```
receipt-scanner/
├── backend/                  # NestJS Application Source
│   ├── src/
│   │   ├── config/           # Validasi variabel lingkungan (Joi)
│   │   ├── database/         # PrismaService & Database layer
│   │   └── modules/
│   │       ├── health/       # Health check controller & spec
│   │       ├── invoices/     # Logika pembuatan & penyimpanan invoice
│   │       ├── pdf/          # Template HTML & Puppeteer PDF Service
│   │       ├── receipts/     # Penerimaan callback struk dari worker
│   │       ├── storage/      # Local Storage Provider (abstraksi file)
│   │       ├── whatsapp/     # Webhook controller, parser, & clients
│   │       └── worker/       # Client pembawa request ke Go worker
│   ├── test/                 # E2E Automated Integration Tests
│   ├── Dockerfile            # Multi-stage Dockerfile untuk NestJS
│   └── package.json
│
├── worker/                   # Golang Worker Source
│   ├── cmd/worker/           # Titik masuk utama (main.go)
│   ├── internal/
│   │   ├── client/           # HTTP Client pengirim hasil ke NestJS
│   │   ├── config/           # Loader konfigurasi .env
│   │   ├── handler/          # HTTP handler (/health dan /process-receipt)
│   │   ├── llm/              # Provider NVIDIA Nemotron Client
│   │   ├── ocr/              # Orkestrator Tesseract OCR CLI
│   │   └── processing/       # Orkestrator Pipeline (OCR -> AI -> Save)
│   └── Dockerfile            # Multi-stage Dockerfile (Go + Tesseract)
│
├── docker-compose.yml        # Konfigurasi orkestrasi local dev stack
└── DOCKER.md                 # Dokumentasi pengoperasian Docker
```

---

## ⚙️ Variabel Lingkungan (.env)

Buat file `.env` di root direktori dengan menyalin dari `.env.example`:

```bash
# ── PostgreSQL
POSTGRES_DB=invoicego
POSTGRES_USER=invoicego
POSTGRES_PASSWORD=ganti_dengan_password_rahasia

# ── Backend
NODE_ENV=production
DATABASE_URL=postgresql://invoicego:password@postgres:5432/invoicego?schema=public
WHATSAPP_VERIFY_TOKEN=token_verifikasi_webhook_meta
WHATSAPP_ACCESS_TOKEN=access_token_graph_api
WHATSAPP_PHONE_NUMBER_ID=id_nomor_whatsapp_meta
WORKER_SERVICE_URL=http://worker:8080
APP_URL=http://localhost:3000

# ── Worker
TESSERACT_PATH=tesseract
BACKEND_CALLBACK_URL=http://backend:3000/api/v1/receipts/callback
BACKEND_API_URL=http://backend:3000
NVIDIA_API_KEY=kunci_api_nvidia_nemotron_anda
```

---

## 🐳 Setup Lingkungan Docker

Cara termudah menjalankan seluruh stack secara lokal (PostgreSQL + Backend + Worker + Tesseract) adalah menggunakan Docker Compose:

```bash
# Jalankan semua kontainer di background
docker compose up -d --build

# Cek status kesehatan kontainer
docker compose ps

# Memantau log aplikasi
docker compose logs -f
```

Untuk detail perintah manajemen volume, database, dan pemecahan masalah Docker, silakan baca [DOCKER.md](file:///d:/Programmer/receipt-scanner/DOCKER.md).

---

## 🚀 Menjalankan Secara Manual (Tanpa Docker)

### 1. Prasyarat
- Node.js v22 atau lebih baru
- Go v1.24 atau lebih baru
- Tesseract OCR v5.x terpasang di sistem dan terdaftar di `PATH`
- Database PostgreSQL berjalan di `localhost:5432`

### 2. Jalankan Database & Migrasi
```bash
cd backend
npm install
npx prisma migrate dev
```

### 3. Jalankan NestJS Backend
```bash
cd backend
npm run start:dev
```
Aplikasi backend akan berjalan di `http://localhost:3000`.

### 4. Jalankan Go Worker
```bash
cd worker
go run cmd/worker/main.go
```
Worker akan berjalan di `http://localhost:8080`.

---

## 🏥 Health Monitoring Endpoints

Kedua service dilengkapi dengan health check dinamis:

### NestJS Backend: `GET http://localhost:3000/api/health`
Mengecek koneksi database secara aktif menggunakan raw SQL query ping.
```json
{
  "status": "ok",
  "service": "backend",
  "database": "connected"
}
```

### Go Worker: `GET http://localhost:8080/health`
Mengecek ketersediaan binary Tesseract di path sistem, serta menguji konektivitas DNS & HTTPS ke API NVIDIA Nemotron.
```json
{
  "status": "ok",
  "service": "worker",
  "ocr": "ready",
  "ai": "reachable"
}
```

---

## 🧪 Panduan Pengujian

Proyek ini memiliki cakupan pengujian unit yang sangat luas, serta automated end-to-end integration tests.

### Pengujian Backend (NestJS)

```bash
cd backend

# Jalankan semua unit test
npm run test

# Jalankan E2E Integration test
npm run test:e2e

# Jalankan dengan detail (verbose)
npx jest --config ./test/jest-e2e.json --verbose --forceExit
```

### Pengujian Worker (Go)

```bash
cd worker

# Jalankan seluruh unit test
go test -v ./...
```

---

## 🪵 Structured Logging & Performance Metrics

Log ditulis dalam bentuk terstruktur di stdout. Sistem mencatat durasi pemrosesan di setiap fase penting untuk analisis performa:

```text
[Nest] INFO [WebhookService] Webhook received: gambar struk dari 628123456789 (MediaID: media-123)
[Nest] INFO [WebhookService] [Performance] Media Download took 320ms untuk mediaId: media-123
[Nest] INFO [WebhookService] [Performance] Database Save took 45ms untuk receiptId: receipt-uuid-abc
[Nest] INFO [WebhookService] [OCR Pipeline] Mengirim receiptId receipt-uuid-abc ke Golang Worker...
[Worker] INFO "Memulai pemrosesan Tesseract OCR" imagePath=temp/downloads/receipt-uuid-abc.jpg
[Worker] INFO "Tesseract OCR selesai" duration=1200ms confidence=89.5%
[Worker] INFO "request started" url=https://integrate.api.nvidia.com/v1/chat/completions model=nvidia/nemotron-3-nano
[Worker] INFO "response received" status="200 OK" duration=2400ms
[Nest] INFO [ReceiptsService] Receipt saved (ID: receipt-uuid-abc, Status: PROCESSED)
[Nest] INFO [ReceiptsService] [Performance] Database Save took 60ms untuk receiptId: receipt-uuid-abc
[Nest] INFO [ReceiptsService] [Performance] Invoice Generation took 110ms untuk receiptId: receipt-uuid-abc
[Nest] INFO [WhatsAppNotificationService] [Performance] WhatsApp Sending took 180ms untuk invoice: INV-20260706-0001
[Nest] INFO [WhatsAppNotificationService] [Performance] Total Pipeline took 4315ms (terima gambar -> invoice dikirim ke WhatsApp)
```

---

## 🔍 Troubleshooting

### Error: `tesseract binary not reachable` pada Worker
- Pastikan Tesseract OCR sudah diinstal di komputer Anda.
- Jalankan `tesseract --version` di terminal Anda. Jika tidak ditemukan, daftarkan folder instalasi Tesseract ke `PATH` System Environment Variables Anda, lalu restart terminal/IDE.

### Error: `PrismaClientInitializationError` pada Backend
- Pastikan PostgreSQL Anda menyala.
- Pastikan variabel `DATABASE_URL` di file `.env` sudah sesuai dengan user, password, host, port, dan nama database PostgreSQL lokal Anda.

### Error: `unauthorized: invalid NVIDIA API key` pada Worker
- Masuk ke dashboard NVIDIA Developer dan buat API key baru.
- Update nilai `NVIDIA_API_KEY` di file `.env` root proyek, lalu restart worker.
