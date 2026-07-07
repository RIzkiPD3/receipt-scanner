package handler

import (
	"context"
	"encoding/json"
	"invoicego/worker/internal/model"
	"log/slog"
	"net/http"
	"time"
)

// pingable defines a small interface for health checking sub-services.
type pingable interface {
	Ping(ctx context.Context) error
}

// HealthHandler menangani permintaan GET /health
type HealthHandler struct {
	ocrProvider pingable
	llmProvider pingable
	logger      *slog.Logger
}

// NewHealthHandler membuat instance baru HealthHandler dengan dependency injection
func NewHealthHandler(ocrProvider pingable, llmProvider pingable, logger *slog.Logger) *HealthHandler {
	return &HealthHandler{
		ocrProvider: ocrProvider,
		llmProvider: llmProvider,
		logger:      logger,
	}
}

// ServeHTTP mengimplementasikan interface http.Handler
func (h *HealthHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.logger.Debug("health check triggered", "method", r.Method, "path", r.URL.Path)

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	ocrStatus := "ready"
	if h.ocrProvider != nil {
		if err := h.ocrProvider.Ping(ctx); err != nil {
			h.logger.Error("OCR ping failed", "error", err.Error())
			ocrStatus = "error"
		}
	} else {
		ocrStatus = "not_configured"
	}

	aiStatus := "reachable"
	if h.llmProvider != nil {
		if err := h.llmProvider.Ping(ctx); err != nil {
			h.logger.Error("AI ping failed", "error", err.Error())
			aiStatus = "error"
		}
	} else {
		aiStatus = "not_configured"
	}

	status := "ok"
	statusCode := http.StatusOK
	if ocrStatus == "error" || aiStatus == "error" {
		status = "error"
		statusCode = http.StatusServiceUnavailable
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(model.HealthResponse{
		Status:  status,
		Service: "worker",
		OCR:     ocrStatus,
		AI:      aiStatus,
	})
}

