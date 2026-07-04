package service

import (
	"context"
	"errors"
	"invoicego/worker/internal/llm/model"
	"io"
	"log/slog"
	"testing"
)

// MockLLMProvider mengimplementasikan interface llminterface.LLMProvider untuk pengujian
type MockLLMProvider struct {
	ExtractReceiptFunc func(ctx context.Context, rawText string) (*model.ReceiptResult, error)
}

func (m *MockLLMProvider) ExtractReceipt(ctx context.Context, rawText string) (*model.ReceiptResult, error) {
	if m.ExtractReceiptFunc != nil {
		return m.ExtractReceiptFunc(ctx, rawText)
	}
	return &model.ReceiptResult{
		StoreName: "Mock Store",
		Total:     15000,
	}, nil
}

func TestLLMService_ProcessReceiptText_Success(t *testing.T) {
	mockProvider := &MockLLMProvider{}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	service := NewLLMService(mockProvider, logger)

	result, err := service.ProcessReceiptText(context.Background(), "SOME OCR TEXT")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.StoreName != "Mock Store" {
		t.Errorf("expected StoreName Mock Store, got %s", result.StoreName)
	}
	if result.Total != 15000 {
		t.Errorf("expected Total 15000, got %f", result.Total)
	}
}

func TestLLMService_ProcessReceiptText_EmptyInput(t *testing.T) {
	mockProvider := &MockLLMProvider{}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	service := NewLLMService(mockProvider, logger)

	_, err := service.ProcessReceiptText(context.Background(), "")
	if err == nil {
		t.Fatal("expected error for empty text, got nil")
	}

	if err.Error() != "empty raw text" {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestLLMService_ProcessReceiptText_ProviderError(t *testing.T) {
	mockProvider := &MockLLMProvider{
		ExtractReceiptFunc: func(ctx context.Context, rawText string) (*model.ReceiptResult, error) {
			return nil, errors.New("provider failure")
		},
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	service := NewLLMService(mockProvider, logger)

	_, err := service.ProcessReceiptText(context.Background(), "SOME OCR TEXT")
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if err.Error() != "llm provider error: provider failure" {
		t.Errorf("unexpected error: %v", err)
	}
}
