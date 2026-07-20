package main

import (
	"context"
	"errors"
	"fmt"
	"invoicego/worker/internal/client"
	"invoicego/worker/internal/config"
	"invoicego/worker/internal/handler"
	llmprovider "invoicego/worker/internal/llm/provider"
	ocrprovider "invoicego/worker/internal/ocr/provider"
	ocrservice "invoicego/worker/internal/ocr/service"
	"invoicego/worker/internal/processing"
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
	var logHandler slog.Handler
	if cfg.Env == "production" {
		logHandler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	} else {
		logHandler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})
	}
	logger := slog.New(logHandler)
	slog.SetDefault(logger)

	logger.Info("InvoiceGo Golang Worker starting...", "env", cfg.Env, "port", cfg.Port)

	// 3. Inisialisasi Tesseract OCR Provider (selalu diinisialisasi sebagai fallback/default)
	logger.Info("Menginisialisasi Tesseract OCR Provider...",
		"tesseractPath", cfg.TesseractPath,
		"tempDownloadDir", cfg.TempDownloadDir,
	)
	tesseractProvider := ocrprovider.NewTesseractProvider(cfg.TesseractPath, logger)

	// 4. Inisialisasi Tesseract OCR Service
	ocrSvc := ocrservice.NewOCRService(tesseractProvider, cfg.TempDownloadDir, logger)

	// Inisialisasi PaddleOCR jika dikonfigurasi
	var paddleOcrSvc *service.OCRService
	var healthOcrProvider interface {
		Ping(ctx context.Context) error
	}
	healthOcrProvider = tesseractProvider

	if cfg.OcrEngine == "paddle" {
		logger.Info("Menginisialisasi PaddleOCR Service...",
			"pythonPath", cfg.PythonPath,
			"paddleOcrPath", cfg.PaddleOcrPath,
		)
		paddleOcrSvc = service.NewOCRService(cfg.PythonPath, cfg.PaddleOcrPath, logger)
		healthOcrProvider = paddleOcrSvc
	}

	// 5. Inisialisasi LLM Provider (NVIDIA Nemotron)
	logger.Info("Menginisialisasi NVIDIA Nemotron LLM Provider...",
		"baseUrl", cfg.NvidiaBaseUrl,
		"model", cfg.NvidiaModel,
	)
	llmProv := llmprovider.NewNemotronProvider(cfg.NvidiaApiKey, cfg.NvidiaBaseUrl, cfg.NvidiaModel, nil, logger)

	// Inisialisasi NestJS Backend API Client
	logger.Info("Menginisialisasi NestJS Backend Client...", "baseUrl", cfg.BackendApiUrl)
	backendClient := client.NewBackendClient(cfg.BackendApiUrl, nil, logger)

	// 6. Inisialisasi Processing Service (pipeline OCR → LLM)
	processingSvc := processing.NewProcessingService(ocrSvc, llmProv, logger)

	// 7. Inisialisasi handler dengan dependency injection
	healthHandler := handler.NewHealthHandler(healthOcrProvider, llmProv, logger)
	receiptHandler := handler.NewReceiptHandler(processingSvc, paddleOcrSvc, cfg.OcrEngine, cfg.TempDownloadDir, backendClient, logger)

	// 8. Daftarkan routes ke ServeMux
	mux := http.NewServeMux()
	mux.Handle("GET /health", healthHandler)
	mux.Handle("POST /process-receipt", receiptHandler)

	// 9. Konfigurasi HTTP server
	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      mux,
		ReadTimeout:  60 * time.Second, // Diperpanjang karena pipeline OCR + LLM bisa memakan waktu
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// 10. Jalankan server di goroutine terpisah
	serverErrors := make(chan error, 1)
	go func() {
		logger.Info("HTTP server mendengarkan...", "address", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrors <- err
		}
	}()

	// 11. Graceful Shutdown
	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-serverErrors:
		logger.Error("Terjadi error pada server", "error", err)
		os.Exit(1)

	case sig := <-shutdown:
		logger.Info("Sinyal shutdown diterima", "signal", sig.String())

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
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
