package service_test

import (
	"context"
	"errors"
	"invoicego/worker/internal/service"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
)

type mockTextExtractor struct {
	extractFunc func(imagePath string) (string, error)
}

func (m *mockTextExtractor) ExtractText(imagePath string) (string, error) {
	if m.extractFunc != nil {
		return m.extractFunc(imagePath)
	}
	return "", nil
}

func TestWorkerService_ProcessImage(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	// Create temp file for valid testing
	tempDir := t.TempDir()
	validImg := filepath.Join(tempDir, "test_receipt.jpg")
	err := os.WriteFile(validImg, []byte("fake image content"), 0644)
	if err != nil {
		t.Fatalf("Failed to create temp file: %v", err)
	}

	emptyImg := filepath.Join(tempDir, "empty_receipt.jpg")
	err = os.WriteFile(emptyImg, []byte(""), 0644)
	if err != nil {
		t.Fatalf("Failed to create empty temp file: %v", err)
	}

	t.Run("Success flow", func(t *testing.T) {
		mockOCR := &mockTextExtractor{
			extractFunc: func(imagePath string) (string, error) {
				return "INDOMARET\nTOTAL 39400", nil
			},
		}
		ws := service.NewWorkerService(mockOCR, logger)
		res, err := ws.ProcessImage(context.Background(), validImg)
		if err != nil {
			t.Fatalf("Expected no error, got: %v", err)
		}
		if res != "INDOMARET\nTOTAL 39400" {
			t.Errorf("Unexpected result: %s", res)
		}
	})

	t.Run("Empty image path", func(t *testing.T) {
		mockOCR := &mockTextExtractor{}
		ws := service.NewWorkerService(mockOCR, logger)
		_, err := ws.ProcessImage(context.Background(), "")
		if err == nil {
			t.Fatal("Expected error for empty image path, got nil")
		}
	})

	t.Run("File not found", func(t *testing.T) {
		mockOCR := &mockTextExtractor{}
		ws := service.NewWorkerService(mockOCR, logger)
		_, err := ws.ProcessImage(context.Background(), filepath.Join(tempDir, "non_existent.jpg"))
		if err == nil {
			t.Fatal("Expected error for non-existent file, got nil")
		}
	})

	t.Run("Empty file (0 bytes)", func(t *testing.T) {
		mockOCR := &mockTextExtractor{}
		ws := service.NewWorkerService(mockOCR, logger)
		_, err := ws.ProcessImage(context.Background(), emptyImg)
		if err == nil {
			t.Fatal("Expected error for 0-byte file, got nil")
		}
	})

	t.Run("OCR Extractor error", func(t *testing.T) {
		mockOCR := &mockTextExtractor{
			extractFunc: func(imagePath string) (string, error) {
				return "", errors.New("PaddleOCR not found")
			},
		}
		ws := service.NewWorkerService(mockOCR, logger)
		_, err := ws.ProcessImage(context.Background(), validImg)
		if err == nil {
			t.Fatal("Expected error when OCR fails, got nil")
		}
	})
}
