package handler

import (
	"context"
	"encoding/json"
	"errors"
	"invoicego/worker/internal/model"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

type mockPingable struct {
	err error
}

func (m *mockPingable) Ping(ctx context.Context) error {
	return m.err
}

func TestHealthHandler_ServeHTTP(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))

	tests := []struct {
		name           string
		ocr            *mockPingable
		llm            *mockPingable
		expectedStatus int
		expectedBody   model.HealthResponse
	}{
		{
			name:           "both healthy",
			ocr:            &mockPingable{err: nil},
			llm:            &mockPingable{err: nil},
			expectedStatus: http.StatusOK,
			expectedBody: model.HealthResponse{
				Status:  "ok",
				Service: "worker",
				OCR:     "ready",
				AI:      "reachable",
			},
		},
		{
			name:           "ocr failed",
			ocr:            &mockPingable{err: errors.New("tesseract binary missing")},
			llm:            &mockPingable{err: nil},
			expectedStatus: http.StatusServiceUnavailable,
			expectedBody: model.HealthResponse{
				Status:  "error",
				Service: "worker",
				OCR:     "error",
				AI:      "reachable",
			},
		},
		{
			name:           "ai failed",
			ocr:            &mockPingable{err: nil},
			llm:            &mockPingable{err: errors.New("nvidia api key invalid")},
			expectedStatus: http.StatusServiceUnavailable,
			expectedBody: model.HealthResponse{
				Status:  "error",
				Service: "worker",
				OCR:     "ready",
				AI:      "error",
			},
		},
		{
			name:           "not configured providers",
			ocr:            nil,
			llm:            nil,
			expectedStatus: http.StatusOK,
			expectedBody: model.HealthResponse{
				Status:  "ok",
				Service: "worker",
				OCR:     "not_configured",
				AI:      "not_configured",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var ocr pingable
			if tt.ocr != nil {
				ocr = tt.ocr
			}
			var llm pingable
			if tt.llm != nil {
				llm = tt.llm
			}

			h := NewHealthHandler(ocr, llm, logger)
			req := httptest.NewRequest("GET", "/health", nil)
			rr := httptest.NewRecorder()

			h.ServeHTTP(rr, req)

			if rr.Code != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, rr.Code)
			}

			var resp model.HealthResponse
			if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
				t.Fatal(err)
			}

			if resp.Status != tt.expectedBody.Status {
				t.Errorf("expected Status %q, got %q", tt.expectedBody.Status, resp.Status)
			}
			if resp.Service != tt.expectedBody.Service {
				t.Errorf("expected Service %q, got %q", tt.expectedBody.Service, resp.Service)
			}
			if resp.OCR != tt.expectedBody.OCR {
				t.Errorf("expected OCR %q, got %q", tt.expectedBody.OCR, resp.OCR)
			}
			if resp.AI != tt.expectedBody.AI {
				t.Errorf("expected AI %q, got %q", tt.expectedBody.AI, resp.AI)
			}
		})
	}
}
