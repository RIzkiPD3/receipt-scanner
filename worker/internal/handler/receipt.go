package handler

import (
	"encoding/json"
	"invoicego/worker/internal/model"
	"invoicego/worker/internal/processing"
	"log/slog"
	"net/http"
)

// ReceiptHandler menangani permintaan POST /process-receipt
type ReceiptHandler struct {
	processingService *processing.ProcessingService
	logger            *slog.Logger
}

// NewReceiptHandler membuat instance baru ReceiptHandler dengan dependency injection
func NewReceiptHandler(processingService *processing.ProcessingService, logger *slog.Logger) *ReceiptHandler {
	return &ReceiptHandler{
		processingService: processingService,
		logger:            logger,
	}
}

// ServeHTTP mengimplementasikan interface http.Handler
func (h *ReceiptHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var req model.ProcessReceiptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.logger.Error("Gagal mendekode body request", "error", err)
		h.sendJSON(w, http.StatusBadRequest, model.ProcessReceiptResponse{
			Status:  "error",
			Message: "invalid request body",
		})
		return
	}

	if req.ReceiptID == "" || req.ImageURL == "" {
		h.logger.Warn("Validasi gagal: receiptId atau imageUrl kosong",
			"receiptId", req.ReceiptID,
			"imageUrl", req.ImageURL,
		)
		h.sendJSON(w, http.StatusBadRequest, model.ProcessReceiptResponse{
			Status:  "error",
			Message: "receiptId and imageUrl are required",
		})
		return
	}

	h.logger.Info("Permintaan pemrosesan struk diterima",
		"receiptId", req.ReceiptID,
		"imageUrl", req.ImageURL,
	)

	result, err := h.processingService.Run(r.Context(), processing.PipelineInput{
		ReceiptID: req.ReceiptID,
		ImageURL:  req.ImageURL,
	})
	if err != nil {
		h.logger.Error("Pipeline pemrosesan struk gagal",
			"receiptId", req.ReceiptID,
			"error", err.Error(),
		)
		h.sendJSON(w, http.StatusInternalServerError, model.ProcessReceiptResponse{
			Status: "error",
			Error:  err.Error(),
		})
		return
	}

	h.logger.Info("Pipeline pemrosesan struk berhasil diselesaikan", "receiptId", req.ReceiptID)

	h.sendJSON(w, http.StatusOK, model.ProcessReceiptResponse{
		Status:  "success",
		Text:    result.RawText,
		Receipt: result.Receipt,
	})
}

// sendJSON menyederhanakan pengiriman response JSON dengan status code tertentu
func (h *ReceiptHandler) sendJSON(w http.ResponseWriter, statusCode int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}
