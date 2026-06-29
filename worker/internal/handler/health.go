package handler

import (
	"encoding/json"
	"invoicego/worker/internal/model"
	"log/slog"
	"net/http"
)

// HealthHandler menangani permintaan GET /health
type HealthHandler struct {
	logger *slog.Logger
}

// NewHealthHandler membuat instance baru HealthHandler dengan dependency injection logger
func NewHealthHandler(logger *slog.Logger) *HealthHandler {
	return &HealthHandler{logger: logger}
}

// ServeHTTP mengimplementasikan interface http.Handler
func (h *HealthHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.logger.Debug("health check triggered", "method", r.Method, "path", r.URL.Path)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(model.HealthResponse{Status: "ok"})
}
