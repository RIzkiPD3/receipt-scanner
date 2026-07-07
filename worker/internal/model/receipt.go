package model

import (
	llmmodel "invoicego/worker/internal/llm/model"
)

// ProcessReceiptRequest adalah struktur request untuk endpoint POST /process-receipt
type ProcessReceiptRequest struct {
	ReceiptID string `json:"receiptId"`
	ImageURL  string `json:"imageUrl"`
}

// ProcessReceiptResponse adalah struktur response untuk endpoint POST /process-receipt
type ProcessReceiptResponse struct {
	Status     string                  `json:"status"`
	Message    string                  `json:"message,omitempty"`
	Text       string                  `json:"text,omitempty"`
	Confidence float64                 `json:"confidence,omitempty"`
	Error      string                  `json:"error,omitempty"`
	Receipt    *llmmodel.ReceiptResult `json:"receipt,omitempty"`
}

// HealthResponse adalah struktur response untuk endpoint GET /health
type HealthResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
	OCR     string `json:"ocr"`
	AI      string `json:"ai"`
}

