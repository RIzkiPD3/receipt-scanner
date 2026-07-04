package processing

import (
	"context"
	"errors"
	llmmodel "invoicego/worker/internal/llm/model"
	"io"
	"log/slog"
	"testing"
)

// mockOCRExtractor mengimplementasikan interface imageExtractor untuk keperluan unit testing
type mockOCRExtractor struct {
	result string
	err    error
}

func (m *mockOCRExtractor) ExtractFromURL(_ context.Context, _, _ string) (string, error) {
	return m.result, m.err
}

// mockLLMProvider mengimplementasikan interface llminterface.LLMProvider untuk keperluan unit testing
type mockLLMProvider struct {
	result *llmmodel.ReceiptResult
	err    error
}

func (m *mockLLMProvider) ExtractReceipt(_ context.Context, _ string) (*llmmodel.ReceiptResult, error) {
	return m.result, m.err
}

func newTestLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestProcessingService_Run_Success(t *testing.T) {
	ocrMock := &mockOCRExtractor{result: "TOKO MAJU\nTotal: Rp 50.000"}
	llmMock := &mockLLMProvider{
		result: &llmmodel.ReceiptResult{
			StoreName: "Toko Maju",
			Total:     50000,
		},
	}

	svc := NewProcessingService(ocrMock, llmMock, newTestLogger())

	result, err := svc.Run(context.Background(), PipelineInput{
		ReceiptID: "receipt-001",
		ImageURL:  "http://example.com/image.jpg",
	})

	if err != nil {
		t.Fatalf("Tidak diharapkan ada error, tapi mendapat: %v", err)
	}
	if result.RawText != "TOKO MAJU\nTotal: Rp 50.000" {
		t.Errorf("RawText tidak sesuai: %q", result.RawText)
	}
	if result.Receipt.StoreName != "Toko Maju" {
		t.Errorf("StoreName tidak sesuai: %s", result.Receipt.StoreName)
	}
	if result.Receipt.Total != 50000 {
		t.Errorf("Total tidak sesuai: %f", result.Receipt.Total)
	}
}

func TestProcessingService_Run_EmptyInput(t *testing.T) {
	svc := NewProcessingService(&mockOCRExtractor{}, &mockLLMProvider{}, newTestLogger())

	testCases := []struct {
		name  string
		input PipelineInput
	}{
		{"ReceiptID kosong", PipelineInput{ReceiptID: "", ImageURL: "http://example.com/img.jpg"}},
		{"ImageURL kosong", PipelineInput{ReceiptID: "r-001", ImageURL: ""}},
		{"Keduanya kosong", PipelineInput{}},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := svc.Run(context.Background(), tc.input)
			if err == nil {
				t.Error("Seharusnya mengembalikan error untuk input kosong")
			}
		})
	}
}

func TestProcessingService_Run_OCRFailed(t *testing.T) {
	ocrMock := &mockOCRExtractor{err: errors.New("tesseract process exited with code 1")}
	svc := NewProcessingService(ocrMock, &mockLLMProvider{}, newTestLogger())

	_, err := svc.Run(context.Background(), PipelineInput{
		ReceiptID: "receipt-002",
		ImageURL:  "http://example.com/image.jpg",
	})

	if err == nil {
		t.Fatal("Seharusnya mengembalikan error saat OCR gagal")
	}
}

func TestProcessingService_Run_EmptyOCRResult(t *testing.T) {
	ocrMock := &mockOCRExtractor{result: "   "} // hanya spasi
	svc := NewProcessingService(ocrMock, &mockLLMProvider{}, newTestLogger())

	_, err := svc.Run(context.Background(), PipelineInput{
		ReceiptID: "receipt-003",
		ImageURL:  "http://example.com/image.jpg",
	})

	if err == nil {
		t.Fatal("Seharusnya mengembalikan error untuk hasil OCR yang kosong")
	}
}

func TestProcessingService_Run_LLMFailed(t *testing.T) {
	ocrMock := &mockOCRExtractor{result: "TEKS OCR VALID"}
	llmMock := &mockLLMProvider{err: errors.New("nvidia api timeout")}
	svc := NewProcessingService(ocrMock, llmMock, newTestLogger())

	_, err := svc.Run(context.Background(), PipelineInput{
		ReceiptID: "receipt-004",
		ImageURL:  "http://example.com/image.jpg",
	})

	if err == nil {
		t.Fatal("Seharusnya mengembalikan error saat LLM gagal")
	}
}

func TestProcessingService_Run_LLMNilResult(t *testing.T) {
	ocrMock := &mockOCRExtractor{result: "TEKS OCR VALID"}
	llmMock := &mockLLMProvider{result: nil} // AI mengembalikan nil tanpa error
	svc := NewProcessingService(ocrMock, llmMock, newTestLogger())

	_, err := svc.Run(context.Background(), PipelineInput{
		ReceiptID: "receipt-005",
		ImageURL:  "http://example.com/image.jpg",
	})

	if err == nil {
		t.Fatal("Seharusnya mengembalikan error saat hasil AI adalah nil")
	}
}
