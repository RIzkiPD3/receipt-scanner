package handler

import (
	"encoding/json"
	"invoicego/worker/internal/model"
	"log/slog"
	"net/http"
)

// ReceiptHandler menangani permintaan POST /process-receipt
type ReceiptHandler struct {
	logger *slog.Logger
}

// NewReceiptHandler membuat instance baru ReceiptHandler dengan dependency injection logger
func NewReceiptHandler(logger *slog.Logger) *ReceiptHandler {
	return &ReceiptHandler{logger: logger}
}

// ServeHTTP mengimplementasikan interface http.Handler
func (h *ReceiptHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var req model.ProcessReceiptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.logger.Error("gagal mendekode body request", "error", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid request body"})
		return
	}

	if req.ReceiptID == "" || req.ImageURL == "" {
		h.logger.Warn("validasi gagal: receiptId atau imageUrl kosong",
			"receiptId", req.ReceiptID,
			"imageUrl", req.ImageURL,
		)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "receiptId and imageUrl are required"})
		return
	}

	h.logger.Info("permintaan pemrosesan struk diterima",
		"receiptId", req.ReceiptID,
		"imageUrl", req.ImageURL,
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(model.ProcessReceiptResponse{
		Status:  "accepted",
		Message: "Receipt processing request received.",
	})
}
