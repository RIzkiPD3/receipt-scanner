package client

import (
	"context"
	llmmodel "invoicego/worker/internal/llm/model"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBackendClient_SaveReceipt_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("expected Content-Type application/json, got %s", r.Header.Get("Content-Type"))
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"status":"success","id":"test-id"}`))
	}))
	defer server.Close()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	client := NewBackendClient(server.URL, server.Client(), logger)

	receipt := &llmmodel.ReceiptResult{
		StoreName:       "Test Store",
		TransactionDate: "2026-07-04",
		Subtotal:        100,
		Tax:             10,
		Total:           110,
		Items: []llmmodel.ReceiptItem{
			{Name: "Item 1", Quantity: 1, UnitPrice: 100, TotalPrice: 100},
		},
	}

	err := client.SaveReceipt(context.Background(), receipt, "http://image.url")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestBackendClient_SaveReceipt_ClientError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"message":["storeName should not be empty"]}`))
	}))
	defer server.Close()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	client := NewBackendClient(server.URL, server.Client(), logger)

	receipt := &llmmodel.ReceiptResult{
		StoreName: "",
	}

	err := client.SaveReceipt(context.Background(), receipt, "")
	if err == nil {
		t.Fatal("expected error, got nil")
	}

	if !strings.Contains(err.Error(), "backend rejected request") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestBackendClient_SaveReceipt_Retries(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts < 3 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"status":"success"}`))
	}))
	defer server.Close()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	client := NewBackendClient(server.URL, server.Client(), logger)

	receipt := &llmmodel.ReceiptResult{
		StoreName: "Store",
	}

	err := client.SaveReceipt(context.Background(), receipt, "")
	if err != nil {
		t.Fatalf("expected success after retries, got: %v", err)
	}

	if attempts != 3 {
		t.Errorf("expected 3 attempts, got %d", attempts)
	}
}
