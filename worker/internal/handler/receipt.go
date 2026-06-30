package handler

import (
	"encoding/json"
	"invoicego/worker/internal/model"
	"invoicego/worker/internal/service"
	"log/slog"
	"net/http"
)

// ReceiptHandler menangani permintaan POST /process-receipt
type ReceiptHandler struct {
	ocrService *service.OCRService
	logger     *slog.Logger
}

// NewReceiptHandler membuat instance baru ReceiptHandler dengan dependency injection ocrService dan logger
func NewReceiptHandler(ocrService *service.OCRService, logger *slog.Logger) *ReceiptHandler {
	return &ReceiptHandler{
		ocrService: ocrService,
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

	h.logger.Info("permintaan pemrosesan struk diterima untuk OCR",
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

	h.logger.Info("Pemrosesan struk dengan OCR berhasil diselesaikan",
		"receiptId", req.ReceiptID,
		"confidence", ocrResult.Confidence,
	)

	h.sendJSON(w, http.StatusOK, model.ProcessReceiptResponse{
		Status:     "success",
		Text:       ocrResult.Text,
		Confidence: ocrResult.Confidence,
	})
}

// sendJSON menyederhanakan pengiriman response JSON dengan status code tertentu
func (h *ReceiptHandler) sendJSON(w http.ResponseWriter, statusCode int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}
