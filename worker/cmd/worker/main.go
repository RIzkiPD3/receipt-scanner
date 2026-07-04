package main

import (
	"context"
	"errors"
	"fmt"
	"invoicego/worker/internal/config"
	"invoicego/worker/internal/handler"
	llmprovider "invoicego/worker/internal/llm/provider"
	llmservice "invoicego/worker/internal/llm/service"
	"invoicego/worker/internal/ocr"
	"invoicego/worker/internal/service"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	// 1. Muat konfigurasi dari .env dan variabel lingkungan
	cfg, err := config.LoadConfig()
	if err != nil {
		fmt.Printf("Gagal memuat konfigurasi: %v\n", err)
		os.Exit(1)
	}

	// 2. Setup structured logging
	// Mode production → JSON (mudah di-parse oleh log aggregator)
	// Mode development → teks berwarna (mudah dibaca manusia)
	var logHandler slog.Handler
	if cfg.Env == "production" {
		logHandler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelInfo,
		})
	} else {
		logHandler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
			Level: slog.LevelDebug,
		})
	}
	logger := slog.New(logHandler)
	slog.SetDefault(logger)

	logger.Info("InvoiceGo Golang Worker starting...", "env", cfg.Env, "port", cfg.Port)

	// 3. Inisialisasi OCR Provider (Tesseract CLI) dan OCR Service
	logger.Info("Menginisialisasi sistem OCR...", "tesseractPath", cfg.TesseractPath, "tempDownloadDir", cfg.TempDownloadDir)
	ocrProvider := ocr.NewTesseractProvider(cfg.TesseractPath, logger)
	ocrService := service.NewOCRService(ocrProvider, cfg.TempDownloadDir, logger)

	// Inisialisasi LLM Provider dan LLM Service
	logger.Info("Menginisialisasi sistem LLM Nemotron...", "baseUrl", cfg.NvidiaBaseUrl, "model", cfg.NvidiaModel)
	llmProvider := llmprovider.NewNemotronProvider(cfg.NvidiaApiKey, cfg.NvidiaBaseUrl, cfg.NvidiaModel, nil, logger)
	llmService := llmservice.NewLLMService(llmProvider, logger)

	// 4. Inisialisasi handler dengan dependency injection
	healthHandler := handler.NewHealthHandler(logger)
	receiptHandler := handler.NewReceiptHandler(ocrService, llmService, logger)

	// 5. Daftarkan routes ke ServeMux
	// Go 1.22+ mendukung method pattern seperti "GET /health"
	mux := http.NewServeMux()
	mux.Handle("GET /health", healthHandler)
	mux.Handle("POST /process-receipt", receiptHandler)

	// 6. Konfigurasi HTTP server yang siap produksi
	// ReadTimeout & WriteTimeout mencegah koneksi menggantung selamanya
	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      mux,
		ReadTimeout:  30 * time.Second, // Ditingkatkan ke 30s karena proses OCR gambar bisa memakan waktu
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// 7. Jalankan server di goroutine terpisah agar tidak memblokir
	serverErrors := make(chan error, 1)
	go func() {
		logger.Info("HTTP server mendengarkan...", "address", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrors <- err
		}
	}()

	// 8. Graceful Shutdown
	// Dengarkan sinyal OS (CTRL+C atau sinyal termination dari orchestrator seperti Docker/K8s)
	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-serverErrors:
		logger.Error("Terjadi error pada server, keluar...", "error", err)
		os.Exit(1)

	case sig := <-shutdown:
		logger.Info("Sinyal shutdown diterima", "signal", sig.String())

		// Beri batas waktu 5 detik untuk menyelesaikan request yang sedang berjalan
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		logger.Info("Menutup HTTP server secara graceful...")
		if err := server.Shutdown(ctx); err != nil {
			logger.Error("Gagal menutup server secara graceful", "error", err)
			_ = server.Close()
		} else {
			logger.Info("HTTP server berhasil ditutup")
		}
	}
}
