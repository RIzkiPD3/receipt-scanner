package service

import (
	"context"
	"errors"
	"invoicego/worker/internal/model"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

// MockOCRProvider mengimplementasikan interface ocr.Provider untuk keperluan unit testing
type MockOCRProvider struct {
	ExtractTextFunc func(ctx context.Context, imagePath string) (*model.OCRResult, error)
}

func (m *MockOCRProvider) ExtractText(ctx context.Context, imagePath string) (*model.OCRResult, error) {
	if m.ExtractTextFunc != nil {
		return m.ExtractTextFunc(ctx, imagePath)
	}
	return &model.OCRResult{Text: "MOCK TEXT", Confidence: 99.9}, nil
}

func TestOCRService_ProcessReceipt_Success(t *testing.T) {
	// 1. Setup mock HTTP server untuk simulasi unduhan gambar
	mockImageContent := []byte("image binary data")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(mockImageContent)
	}))
	defer server.Close()

	// 2. Setup mock OCR Provider
	mockProvider := &MockOCRProvider{
		ExtractTextFunc: func(ctx context.Context, imagePath string) (*model.OCRResult, error) {
			// Verifikasi bahwa berkas sementara benar-benar ada sebelum dibaca
			_, err := os.Stat(imagePath)
			if err != nil {
				return nil, err
			}
			return &model.OCRResult{
				Text:       "TOKO INDO\nJl. Raya No. 10\nTotal: Rp 50.000",
				Confidence: 87.5,
			}, nil
		},
	}

	tempDir := t.TempDir()
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	service := NewOCRService(mockProvider, tempDir, logger)

	// 3. Eksekusi ProcessReceipt
	ctx := context.Background()
	result, err := service.ProcessReceipt(ctx, "receipt-uuid-123", server.URL)
	if err != nil {
		t.Fatalf("ProcessReceipt mengembalikan error: %v", err)
	}

	// 4. Verifikasi hasil
	if result.Text != "TOKO INDO\nJl. Raya No. 10\nTotal: Rp 50.000" {
		t.Errorf("Ekspektasi teks yang diekstrak berbeda, didapat: %q", result.Text)
	}

	if result.Confidence != 87.5 {
		t.Errorf("Ekspektasi confidence 87.5, didapat: %f", result.Confidence)
	}

	// 5. Verifikasi bahwa berkas sementara telah dihapus setelah proses selesai
	files, err := os.ReadDir(tempDir)
	if err != nil {
		t.Fatalf("Gagal membaca folder temp: %v", err)
	}
	if len(files) > 0 {
		t.Errorf("Folder temp harusnya kosong setelah pemrosesan, didapat %d file tersisa", len(files))
	}
}

func TestOCRService_ProcessReceipt_DownloadFailed(t *testing.T) {
	// Setup mock server yang mengembalikan error 404
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer server.Close()

	mockProvider := &MockOCRProvider{}
	tempDir := t.TempDir()
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	service := NewOCRService(mockProvider, tempDir, logger)

	ctx := context.Background()
	_, err := service.ProcessReceipt(ctx, "receipt-uuid-404", server.URL)
	if err == nil {
		t.Error("Harusnya mengembalikan error jika unduhan gagal (HTTP 404)")
	}
}

func TestOCRService_ProcessReceipt_OCRPersistenceError(t *testing.T) {
	// Setup mock server sukses download
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer server.Close()

	// Setup mock provider yang melempar error
	expectedErr := errors.New("tesseract command failed execution")
	mockProvider := &MockOCRProvider{
		ExtractTextFunc: func(ctx context.Context, imagePath string) (*model.OCRResult, error) {
			return nil, expectedErr
		},
	}

	tempDir := t.TempDir()
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	service := NewOCRService(mockProvider, tempDir, logger)

	ctx := context.Background()
	_, err := service.ProcessReceipt(ctx, "receipt-uuid-ocr-err", server.URL)
	if err == nil {
		t.Error("Harusnya mengembalikan error jika provider OCR gagal")
	}

	// Verifikasi file sementara tetap dihapus jika OCR provider mengembalikan error
	files, err := os.ReadDir(tempDir)
	if err != nil {
		t.Fatalf("Gagal membaca folder temp: %v", err)
	}
	if len(files) > 0 {
		t.Errorf("Folder temp tetap harus bersih dari berkas sementara meskipun terjadi error OCR, didapat %d file tersisa", len(files))
	}
}
