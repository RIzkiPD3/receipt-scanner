package handler

import (
	"encoding/json"
	llmservice "invoicego/worker/internal/llm/service"
	"invoicego/worker/internal/model"
	"invoicego/worker/internal/service"
	"log/slog"
	"net/http"
)

// ReceiptHandler menangani permintaan POST /process-receipt
type ReceiptHandler struct {
	ocrService *service.OCRService
	llmService *llmservice.LLMService
	logger     *slog.Logger
}

// NewReceiptHandler membuat instance baru ReceiptHandler dengan dependency injection
func NewReceiptHandler(ocrService *service.OCRService, llmService *llmservice.LLMService, logger *slog.Logger) *ReceiptHandler {
	return &ReceiptHandler{
		ocrService: ocrService,
		llmService: llmService,
		logger:     logger,
	}
}

// ServeHTTP mengimplementasikan interface http.Handler
func (h *ReceiptHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var req model.ProcessReceiptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.logger.Error("gagal mendekode body request", "error", err)
		h.sendJSON(w, http.StatusBadRequest, model.ProcessReceiptResponse{
			Status:  "error",
			Message: "invalid request body",
		})
		return
	}

	if req.ReceiptID == "" || req.ImageURL == "" {
		h.logger.Warn("validasi gagal: receiptId atau imageUrl kosong",
			"receiptId", req.ReceiptID,
			"imageUrl", req.ImageURL,
		)
		h.sendJSON(w, http.StatusBadRequest, model.ProcessReceiptResponse{
			Status:  "error",
			Message: "receiptId and imageUrl are required",
		})
		return
	}

	h.logger.Info("permintaan pemrosesan struk diterima untuk OCR dan LLM",
		"receiptId", req.ReceiptID,
		"imageUrl", req.ImageURL,
	)

	// Panggil service untuk memproses struk dengan OCR
	ocrResult, err := h.ocrService.ProcessReceipt(r.Context(), req.ReceiptID, req.ImageURL)
	if err != nil {
		h.logger.Error("Gagal memproses struk dengan OCR", "receiptId", req.ReceiptID, "error", err.Error())
		h.sendJSON(w, http.StatusInternalServerError, model.ProcessReceiptResponse{
			Status: "error",
			Error:  err.Error(),
		})
		return
	}

	h.logger.Info("Pemrosesan struk dengan OCR berhasil diselesaikan, memulai ekstraksi LLM",
		"receiptId", req.ReceiptID,
		"confidence", ocrResult.Confidence,
	)

	// Ubah teks OCR menjadi data struk belanja terstruktur
	receiptResult, err := h.llmService.ProcessReceiptText(r.Context(), ocrResult.Text)
	if err != nil {
		h.logger.Error("Gagal mengubah teks OCR menjadi data terstruktur", "receiptId", req.ReceiptID, "error", err.Error())
		h.sendJSON(w, http.StatusInternalServerError, model.ProcessReceiptResponse{
			Status: "error",
			Error:  err.Error(),
		})
		return
	}

	h.logger.Info("Pemrosesan struk dengan LLM berhasil diselesaikan",
		"receiptId", req.ReceiptID,
	)

	h.sendJSON(w, http.StatusOK, model.ProcessReceiptResponse{
		Status:     "success",
		Text:       ocrResult.Text,
		Confidence: ocrResult.Confidence,
		Receipt:    receiptResult,
	})
}

// sendJSON menyederhanakan pengiriman response JSON dengan status code tertentu
func (h *ReceiptHandler) sendJSON(w http.ResponseWriter, statusCode int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}
