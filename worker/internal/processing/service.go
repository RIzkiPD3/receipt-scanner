package processing

import (
	"context"
	"errors"
	"fmt"
	llminterface "invoicego/worker/internal/llm/interface"
	"log/slog"
	"strings"
	"time"
)

// imageExtractor mendefinisikan kontrak yang dibutuhkan ProcessingService untuk tahap OCR.
// OCRService dari paket ocr/service mengimplementasikan interface ini.
type imageExtractor interface {
	ExtractFromURL(ctx context.Context, receiptID, imageURL string) (string, error)
}

// ProcessingService mengorkestrasi pipeline lengkap: OCR → validasi → LLM → hasil
type ProcessingService struct {
	ocrService  imageExtractor
	llmProvider llminterface.LLMProvider
	logger      *slog.Logger
}

// NewProcessingService membuat instance baru ProcessingService dengan dependency injection
func NewProcessingService(
	ocrService imageExtractor,
	llmProvider llminterface.LLMProvider,
	logger *slog.Logger,
) *ProcessingService {
	return &ProcessingService{
		ocrService:  ocrService,
		llmProvider: llmProvider,
		logger:      logger,
	}
}

// Run menjalankan pipeline pemrosesan struk secara penuh dari gambar hingga data terstruktur
func (s *ProcessingService) Run(ctx context.Context, input PipelineInput) (*PipelineResult, error) {
	if strings.TrimSpace(input.ReceiptID) == "" || strings.TrimSpace(input.ImageURL) == "" {
		return nil, errors.New("receiptID dan imageURL tidak boleh kosong")
	}

	s.logger.Info("Pipeline dimulai", "receiptId", input.ReceiptID, "imageUrl", input.ImageURL)

	// --- Tahap 1: OCR ---
	s.logger.Info("OCR dimulai", "receiptId", input.ReceiptID)
	ocrStart := time.Now()

	rawText, err := s.ocrService.ExtractFromURL(ctx, input.ReceiptID, input.ImageURL)
	if err != nil {
		s.logger.Error("OCR gagal", "receiptId", input.ReceiptID, "error", err.Error())
		return nil, fmt.Errorf("ocr failed: %w", err)
	}

	ocrDuration := time.Since(ocrStart)
	s.logger.Info("OCR selesai",
		"receiptId", input.ReceiptID,
		"duration", ocrDuration,
		"textLength", len(rawText),
	)

	if strings.TrimSpace(rawText) == "" {
		s.logger.Warn("Hasil OCR kosong, pipeline dihentikan", "receiptId", input.ReceiptID)
		return nil, errors.New("ocr menghasilkan teks kosong")
	}

	// --- Tahap 2: LLM (NVIDIA Nemotron) ---
	s.logger.Info("AI dimulai", "receiptId", input.ReceiptID)
	aiStart := time.Now()

	receiptResult, err := s.llmProvider.ExtractReceipt(ctx, rawText)
	if err != nil {
		s.logger.Error("AI gagal", "receiptId", input.ReceiptID, "error", err.Error())
		return nil, fmt.Errorf("ai extraction failed: %w", err)
	}

	aiDuration := time.Since(aiStart)
	s.logger.Info("AI selesai",
		"receiptId", input.ReceiptID,
		"duration", aiDuration,
	)

	if receiptResult == nil {
		s.logger.Error("AI mengembalikan hasil nil", "receiptId", input.ReceiptID)
		return nil, errors.New("ai mengembalikan hasil nil yang tidak terduga")
	}

	s.logger.Info("Pipeline selesai",
		"receiptId", input.ReceiptID,
		"storeName", receiptResult.StoreName,
		"total", receiptResult.Total,
	)

	return &PipelineResult{
		RawText: rawText,
		Receipt: receiptResult,
	}, nil
}
