package service_test

import (
	"invoicego/worker/internal/config"
	"invoicego/worker/internal/service"
	"io"
	"log/slog"
	"os"
	"strings"
	"testing"
)

func TestOCRService_ExtractText_Success(t *testing.T) {
	cfg, err := config.LoadConfig()
	if err != nil {
		t.Fatalf("Gagal memuat konfigurasi: %v", err)
	}

	if cfg.OcrEngine != "paddle" {
		t.Skip("Skip test PaddleOCR karena OCR_ENGINE bukan paddle")
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	ocrSvc := service.NewOCRService(cfg.PythonPath, cfg.PaddleOcrPath, logger)

	// Path ke mock-receipt.png (bisa dijalankan dari worker root atau internal/service)
	imagePath := "../backend/temp/uploads/mock-receipt.png"
	if _, err := os.Stat(imagePath); os.IsNotExist(err) {
		imagePath = "../../../backend/temp/uploads/mock-receipt.png"
	}
	text, err := ocrSvc.ExtractText(imagePath)
	if err != nil {
		t.Fatalf("ExtractText gagal: %v", err)
	}

	if !strings.Contains(text, "SUNSET GROCERS") {
		t.Errorf("Hasil OCR tidak mengandung 'SUNSET GROCERS', hasil: %q", text)
	}
	
	t.Logf("Hasil OCR berhasil didapatkan:\n%s", text)
}

func TestOCRService_ExtractText_FileNotFound(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	ocrSvc := service.NewOCRService("python", "dummy.py", logger)

	_, err := ocrSvc.ExtractText("nonexistent_file_xyz.png")
	if err == nil {
		t.Fatal("Seharusnya terjadi error karena file tidak ditemukan")
	}

	if !strings.Contains(err.Error(), "file not found") {
		t.Errorf("Pesan error tidak mengandung 'file not found': %v", err)
	}
}
