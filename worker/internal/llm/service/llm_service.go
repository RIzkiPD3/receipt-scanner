package service

import (
	"context"
	"errors"
	"fmt"
	llminterface "invoicego/worker/internal/llm/interface"
	"invoicego/worker/internal/llm/model"
	"log/slog"
)

// LLMService mengoordinasikan pengolahan teks struk belanja mentah menggunakan LLMProvider
type LLMService struct {
	provider llminterface.LLMProvider
	logger   *slog.Logger
}

// NewLLMService membuat instance baru LLMService
func NewLLMService(provider llminterface.LLMProvider, logger *slog.Logger) *LLMService {
	return &LLMService{
		provider: provider,
		logger:   logger,
	}
}

// ProcessReceiptText mengambil teks mentah, memvalidasi input, dan memanggil provider untuk mem-parsing data struk terstruktur
func (s *LLMService) ProcessReceiptText(ctx context.Context, rawText string) (*model.ReceiptResult, error) {
	s.logger.Info("Memulai ekstraksi data struk terstruktur via LLM")

	if rawText == "" {
		s.logger.Warn("Teks mentah kosong diberikan ke LLM service")
		return nil, errors.New("empty raw text")
	}

	result, err := s.provider.ExtractReceipt(ctx, rawText)
	if err != nil {
		s.logger.Error("Gagal mengekstrak struk via LLM provider", "error", err.Error())
		return nil, fmt.Errorf("llm provider error: %w", err)
	}

	s.logger.Info("Struk belanja berhasil di-parse dan distrukturkan oleh LLM")
	return result, nil
}
