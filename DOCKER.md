# 🐳 Docker — InvoiceGo Local Development

Panduan lengkap menjalankan seluruh stack InvoiceGo secara lokal menggunakan Docker dan Docker Compose.

---

## Prasyarat

| Kebutuhan | Versi Minimum | Cek |
|-----------|--------------|-----|
| Docker Engine / Docker Desktop | 24.x | `docker --version` |
| Docker Compose Plugin | v2.x | `docker compose version` |
| (Opsional) Git | 2.x | `git --version` |

> [!NOTE]
> Docker Desktop sudah menyertakan Docker Compose Plugin. Tidak perlu instalasi terpisah.

---

## Arsitektur Stack

```
┌──────────────────────────────────────────────────────┐
│                 invoicego-network (bridge)            │
│                                                      │
│  ┌─────────────┐   ┌─────────────┐  ┌─────────────┐ │
│  │  postgres   │   │   backend   │  │   worker    │ │
│  │ :5432       │◄──│ :3000       │◄─│ :8080       │ │
│  │ PG 17 Alpine│   │ NestJS      │  │ Go+Tesseract│ │
│  └─────────────┘   └─────────────┘  └─────────────┘ │
│       ▲                  ▲                           │
│       │                  │                           │
└───────┼──────────────────┼───────────────────────────┘
        │                  │
   localhost:5432     localhost:3000     localhost:8080
   (opsional ekspor)  (host machine)    (host machine)
```

**Urutan startup:**
```
postgres (healthy) → backend (healthy) → worker
```

---

## Cara Menjalankan

### 1. Setup Environment Variables

```bash
# Dari root direktori proyek
cp .env.example .env
```

Buka `.env` dan isi nilai berikut dengan nilai asli kamu:

| Variabel | Keterangan |
|----------|-----------|
| `POSTGRES_PASSWORD` | Password database PostgreSQL |
| `WHATSAPP_VERIFY_TOKEN` | Token verifikasi webhook Meta |
| `WHATSAPP_ACCESS_TOKEN` | Access token WhatsApp Cloud API |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone Number ID dari Meta Developer |
| `NVIDIA_API_KEY` | API key NVIDIA untuk AI extraction |

> [!IMPORTANT]
> `DATABASE_URL` di `.env` harus menggunakan hostname `postgres` (bukan `localhost`) agar backend bisa terhubung ke database di dalam Docker network.
>
> Contoh: `DATABASE_URL=postgresql://invoicego:passwordku@postgres:5432/invoicego?schema=public`

---

### 2. Build & Jalankan Semua Service

```bash
docker compose up -d --build
```

Perintah ini akan:
1. Build image backend (NestJS + Chromium) dan worker (Go + Tesseract)
2. Pull image postgres:17-alpine
3. Jalankan ketiga container secara berurutan (postgres → backend → worker)

> Proses build pertama membutuhkan waktu **3–8 menit** tergantung koneksi internet dan spesifikasi mesin.

---

### 3. Verifikasi Status

```bash
# Cek status semua container
docker compose ps

# Cek health backend
curl http://localhost:3000/api/health

# Cek health worker
curl http://localhost:8080/health
```

Output yang diharapkan:
```json
// backend
{"status": "ok"}

// worker
{"status": "ok"}
```

---

## Perintah Berguna

### Melihat Log

```bash
# Semua service secara bersamaan
docker compose logs -f

# Service tertentu
docker compose logs -f backend
docker compose logs -f worker
docker compose logs -f postgres
```

### Menghentikan Stack

```bash
# Stop container (data volume tetap tersimpan)
docker compose down

# Stop container DAN hapus semua volume (RESET TOTAL — data hilang!)
docker compose down -v
```

### Rebuild Satu Service

```bash
# Rebuild dan restart hanya backend (misalnya setelah perubahan kode)
docker compose up -d --build backend

# Rebuild hanya worker
docker compose up -d --build worker
```

### Masuk ke Dalam Container

```bash
# Masuk ke shell backend
docker compose exec backend sh

# Masuk ke shell worker
docker compose exec worker sh

# Masuk ke psql PostgreSQL
docker compose exec postgres psql -U invoicego -d invoicego
```

---

## Database & Migrasi

Migrasi Prisma dijalankan **otomatis** saat backend container start melalui perintah:
```
prisma migrate deploy && node dist/main
```

### Menjalankan Migrasi Manual

```bash
# Dari dalam container backend
docker compose exec backend node node_modules/.bin/prisma migrate deploy

# Atau menggunakan Prisma Studio (UI database)
docker compose exec backend node node_modules/.bin/prisma studio
```

### Reset Database

```bash
# Hapus semua data dan ulang migrasi dari awal
docker compose down -v
docker compose up -d postgres
docker compose exec postgres psql -U invoicego -d invoicego -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker compose up -d backend worker
```

---

## Volumes (Data Persisten)

| Volume | Isi | Dihapus saat |
|--------|-----|-------------|
| `invoicego-postgres-data` | Data PostgreSQL | `docker compose down -v` |
| `invoicego-storage` | File PDF yang di-generate (`storage/pdf/`) | `docker compose down -v` |
| `invoicego-uploads` | Upload struk sementara (`temp/uploads/`) | `docker compose down -v` |
| `invoicego-downloads` | Download gambar OCR sementara (`temp/downloads/`) | `docker compose down -v` |

```bash
# Lihat daftar volume
docker volume ls | grep invoicego

# Hapus satu volume tertentu
docker volume rm invoicego-postgres-data
```

---

## Troubleshooting

### Backend tidak bisa terhubung ke database

Pastikan `DATABASE_URL` di `.env` menggunakan hostname `postgres`, bukan `localhost`:
```
# ❌ Salah
DATABASE_URL=postgresql://invoicego:secret@localhost:5432/invoicego

# ✅ Benar
DATABASE_URL=postgresql://invoicego:secret@postgres:5432/invoicego?schema=public
```

### Backend gagal start karena migrasi

```bash
# Lihat error migrasi
docker compose logs backend | grep -i "error\|migration"

# Jalankan migrasi ulang secara manual
docker compose exec backend node node_modules/.bin/prisma migrate deploy
```

### Worker tidak bisa memanggil backend

Pastikan `BACKEND_API_URL` dan `BACKEND_CALLBACK_URL` menggunakan hostname `backend`:
```
BACKEND_API_URL=http://backend:3000
BACKEND_CALLBACK_URL=http://backend:3000/api/v1/receipts/callback
```

### Puppeteer / PDF generation gagal di backend

Pastikan `PUPPETEER_EXECUTABLE_PATH` tidak di-set secara manual di `.env` (sudah di-handle otomatis oleh Dockerfile backend via env var `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`).

### Cek penggunaan resource

```bash
docker stats
```

---

## Health Check URLs

| Service | Endpoint | Ekspektasi |
|---------|----------|-----------|
| Backend | `GET http://localhost:3000/api/health` | `{"status":"ok"}` |
| Worker | `GET http://localhost:8080/health` | `{"status":"ok"}` |
| Postgres | (internal) `pg_isready` | — |
