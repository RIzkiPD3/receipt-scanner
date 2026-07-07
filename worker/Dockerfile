# =============================================================================
# worker/Dockerfile
# =============================================================================
# Multi-stage build untuk Golang Worker + Tesseract OCR.
#
# Stage 1 (builder) — Compile Go binary dengan CGO_ENABLED=0 (static binary)
# Stage 2 (runner)  — Lean Debian image dengan Tesseract OCR diinstall
#
# Menggunakan debian:bookworm-slim (bukan Alpine) karena package Tesseract OCR
# di Debian lebih lengkap dan stabil dibanding Alpine; termasuk bahasa
# Indonesia (tesseract-ocr-ind) yang diperlukan untuk memproses struk.
#
# Binary Go dikompilasi secara statis (CGO_ENABLED=0) sehingga tidak memiliki
# dependency ke glibc — aman dijalankan di Debian slim.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: builder — Compile Go binary
# -----------------------------------------------------------------------------
FROM golang:1.24-alpine AS builder

# Install git untuk go mod download (dibutuhkan jika ada deps via git)
RUN apk add --no-cache git

WORKDIR /app

# Copy go.mod dahulu untuk memanfaatkan Docker layer cache —
# go mod download hanya dijalankan ulang jika go.mod berubah
COPY go.mod ./
RUN go mod download

# Copy semua source code
COPY . .

# Build binary dengan optimasi ukuran:
#   CGO_ENABLED=0 → static binary, tidak bergantung pada libc host
#   GOOS=linux    → target OS Linux
#   -ldflags="-w -s" → strip debug info & symbol table (ukuran lebih kecil)
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build \
      -ldflags="-w -s" \
      -o /app/worker \
      ./cmd/worker

# -----------------------------------------------------------------------------
# Stage 2: runner — Production image dengan Tesseract OCR
# -----------------------------------------------------------------------------
FROM debian:bookworm-slim AS runner

LABEL maintainer="InvoiceGo Team"
LABEL description="InvoiceGo Golang Worker with Tesseract OCR"

# ── Tesseract OCR + language packs ──────────────────────────────────────────
# tesseract-ocr     → binary utama
# tesseract-ocr-eng → bahasa Inggris (default)
# tesseract-ocr-ind → bahasa Indonesia (struk belanja lokal)
# ca-certificates   → untuk HTTPS request ke WhatsApp API
# curl              → digunakan oleh Docker health check
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
         tesseract-ocr \
         tesseract-ocr-eng \
         tesseract-ocr-ind \
         ca-certificates \
         curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ── Non-root user untuk keamanan ─────────────────────────────────────────────
RUN groupadd -g 1001 worker \
    && useradd -u 1001 -g worker -s /bin/sh -m worker

WORKDIR /app

# ── Copy binary dari stage builder ───────────────────────────────────────────
COPY --from=builder --chown=worker:worker /app/worker ./worker

# ── Runtime directories ───────────────────────────────────────────────────────
RUN mkdir -p temp/downloads \
    && chown -R worker:worker temp

USER worker

# ── Expose & entrypoint ───────────────────────────────────────────────────────
EXPOSE 8080

CMD ["./worker"]
