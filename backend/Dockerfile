# =============================================================================
# backend/Dockerfile
# =============================================================================
# Multi-stage build untuk NestJS backend.
#
# Stage 1 (deps)    — Install production dependencies + generate Prisma client
# Stage 2 (builder) — Install ALL dependencies dan compile TypeScript ke dist/
# Stage 3 (runner)  — Image produksi lean dengan Chromium untuk Puppeteer
#
# Puppeteer membutuhkan Chromium yang sudah tersedia di host (Alpine/Debian).
# Di container kita gunakan Chromium via apk dan set PUPPETEER_SKIP_DOWNLOAD=1
# agar Puppeteer tidak mencoba mengunduh binary Chrome-nya sendiri.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: deps — Production dependencies + Prisma client generation
# -----------------------------------------------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package manifests dan Prisma schema lebih dulu untuk layer caching —
# lapisan ini hanya diinvalidasi jika package.json, schema, atau tsconfig.json berubah.
COPY package.json package-lock.json tsconfig.json ./
COPY prisma/ ./prisma/
COPY prisma.config.ts ./

# Install hanya production dependencies.
# postinstall script menjalankan `prisma generate` secara otomatis.
RUN npm ci --omit=dev

# -----------------------------------------------------------------------------
# Stage 2: builder — Full dependencies + TypeScript compilation
# -----------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY prisma/ ./prisma/
COPY prisma.config.ts ./

# Install semua deps (termasuk devDependencies seperti ts-jest, @types/*, dll)
RUN npm ci

# Copy source setelah deps terinstall untuk memaksimalkan layer cache
COPY . .

# Compile TypeScript ke dist/
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: runner — Lean production image
# -----------------------------------------------------------------------------
FROM node:22-alpine AS runner

LABEL maintainer="InvoiceGo Team"
LABEL description="InvoiceGo NestJS Backend"

# ── Chromium & libs untuk Puppeteer headless ────────────────────────────────
# Puppeteer menggunakan binary Chromium sistem; kita skip download bawaan.
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      wget \
    && rm -rf /var/cache/apk/*

# Beritahu Puppeteer untuk menggunakan Chromium sistem & skip auto-download
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# ── Non-root user untuk keamanan ─────────────────────────────────────────────
RUN addgroup -g 1001 -S nodejs \
    && adduser -S nestjs -u 1001 -G nodejs

WORKDIR /app

# ── Copy production artefacts dari stage sebelumnya ─────────────────────────

# Prisma generated client (dari stage deps — production build)
COPY --from=deps --chown=nestjs:nodejs /app/node_modules ./node_modules

# Compiled JS application
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

# Prisma schema & migrations (dibutuhkan oleh `prisma migrate deploy`)
COPY --chown=nestjs:nodejs prisma ./prisma
COPY --chown=nestjs:nodejs prisma.config.ts ./

# HTML templates untuk PDF generation (dibaca dari filesystem saat runtime)
COPY --from=builder --chown=nestjs:nodejs /app/src/modules/pdf/templates ./src/modules/pdf/templates

# ── Runtime directories ───────────────────────────────────────────────────────
RUN mkdir -p temp/uploads storage/pdf \
    && chown -R nestjs:nodejs temp storage

USER nestjs

# ── Expose & entrypoint ───────────────────────────────────────────────────────
EXPOSE 3000

# Jalankan migrasi Prisma lalu start aplikasi.
# Menggunakan sh -c agar dua perintah dapat dijalankan berurutan.
CMD ["sh", "-c", "node node_modules/.bin/prisma migrate deploy && node dist/src/main"]

