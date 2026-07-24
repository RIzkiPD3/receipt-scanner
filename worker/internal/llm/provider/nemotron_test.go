package provider

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNemotronProvider_ExtractReceipt_Success(t *testing.T) {
	mockResponseText := `{
  "storeName": "Starbucks",
  "transactionDate": "2026-07-03",
  "subtotal": 120000.0,
  "tax": 12000.0,
  "total": 132000.0,
  "items": [
    {
      "name": "Caramel Macchiato",
      "quantity": 2.0,
      "unitPrice": 60000.0,
      "totalPrice": 120000.0
    }
  ]
}`

	// AI might return it inside markdown code block
	aiMessageContent := "```json\n" + mockResponseText + "\n```"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify request details
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("expected Authorization header Bearer test-key, got %s", r.Header.Get("Authorization"))
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("expected Content-Type application/json, got %s", r.Header.Get("Content-Type"))
		}

		bodyBytes, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal("failed to read request body")
		}

		var req chatCompletionRequest
		if err := json.Unmarshal(bodyBytes, &req); err != nil {
			t.Fatal("failed to unmarshal request body")
		}

		if req.Model != "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning" {
			t.Errorf("unexpected model: %s", req.Model)
		}

		// Respond with mock completions format
		respPayload := chatCompletionResponse{
			Choices: []struct {
				Message chatMessage `json:"message"`
			}{
				{
					Message: chatMessage{
						Role:    "assistant",
						Content: aiMessageContent,
					},
				},
			},
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(respPayload)
	}))
	defer server.Close()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	provider := NewNemotronProvider("test-key", server.URL, "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", server.Client(), logger)

	result, err := provider.ExtractReceipt(context.Background(), "RAW OCR TEXT")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.StoreName != "Starbucks" {
		t.Errorf("expected StoreName Starbucks, got %s", result.StoreName)
	}
	if result.Total != 132000.0 {
		t.Errorf("expected Total 132000.0, got %f", result.Total)
	}
	if len(result.Items) != 1 || result.Items[0].Name != "Caramel Macchiato" {
		t.Errorf("unexpected items: %+v", result.Items)
	}
}

func TestNemotronProvider_ExtractReceipt_EmptyText(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	provider := NewNemotronProvider("test-key", "http://localhost", "model", nil, logger)

	_, err := provider.ExtractReceipt(context.Background(), "")
	if err == nil {
		t.Error("expected error for empty text, got nil")
	}
	if err.Error() != "empty OCR text" {
		t.Errorf("unexpected error message: %s", err.Error())
	}
}

func TestNemotronProvider_ExtractReceipt_Unauthorized(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error": "Unauthorized"}`))
	}))
	defer server.Close()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	provider := NewNemotronProvider("invalid-key", server.URL, "model", server.Client(), logger)

	_, err := provider.ExtractReceipt(context.Background(), "OCR TEXT")
	if err == nil {
		t.Fatal("expected error for HTTP 401, got nil")
	}

	if !strings.Contains(err.Error(), "unauthorized") {
		t.Errorf("expected unauthorized error, got: %s", err.Error())
	}
}

func TestNemotronProvider_ExtractReceipt_Retries(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts < 3 {
			// Fail the first 2 times
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"error": "Internal Server Error"}`))
			return
		}

		// Succeed on 3rd attempt
		respPayload := chatCompletionResponse{
			Choices: []struct {
				Message chatMessage `json:"message"`
			}{
				{
					Message: chatMessage{
						Role:    "assistant",
						Content: `{"storeName": "Success Store"}`,
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(respPayload)
	}))
	defer server.Close()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	// Pass a client, shorten timeout if possible, wait, http.Client handles timeout
	provider := NewNemotronProvider("key", server.URL, "model", server.Client(), logger)

	// Context with short duration to speed up test or keep it simple
	result, err := provider.ExtractReceipt(context.Background(), "OCR TEXT")
	if err != nil {
		t.Fatalf("expected success after retries, got: %v", err)
	}

	if result.StoreName != "Success Store" {
		t.Errorf("expected Success Store, got %s", result.StoreName)
	}

	if attempts != 3 {
		t.Errorf("expected 3 total attempts, got %d", attempts)
	}
}

func TestNemotronProvider_ExtractReceipt_InvalidJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		respPayload := chatCompletionResponse{
			Choices: []struct {
				Message chatMessage `json:"message"`
			}{
				{
					Message: chatMessage{
						Role:    "assistant",
						Content: `This is not valid JSON`,
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(respPayload)
	}))
	defer server.Close()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	provider := NewNemotronProvider("key", server.URL, "model", server.Client(), logger)

	_, err := provider.ExtractReceipt(context.Background(), "OCR TEXT")
	if err == nil {
		t.Fatal("expected JSON parsing error, got nil")
	}

	if !strings.Contains(err.Error(), "invalid JSON returned by AI") {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestNemotronProvider_ExtractReceipt_SnakeCaseFormat(t *testing.T) {
	mockResponseText := `{
  "merchant": "Indomaret",
  "transaction_date": "2026-07-08",
  "items": [
    {
      "name": "RTE ONIGIRI HOT CHKN",
      "quantity": 1,
      "unit_price": 10000
    }
  ],
  "subtotal": 10000,
  "total": 10000
}`

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		respPayload := chatCompletionResponse{
			Choices: []struct {
				Message chatMessage `json:"message"`
			}{
				{
					Message: chatMessage{
						Role:    "assistant",
						Content: "```json\n" + mockResponseText + "\n```",
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(respPayload)
	}))
	defer server.Close()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	provider := NewNemotronProvider("key", server.URL, "model", server.Client(), logger)

	result, err := provider.ExtractReceipt(context.Background(), "INDOMARET BANTUL KM 6.5 TOTAL 10000")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.Merchant != "Indomaret" || result.StoreName != "Indomaret" {
		t.Errorf("expected Merchant/StoreName Indomaret, got Merchant=%s, StoreName=%s", result.Merchant, result.StoreName)
	}
	if result.TransactionDate != "2026-07-08" {
		t.Errorf("expected TransactionDate 2026-07-08, got %s", result.TransactionDate)
	}
	if result.Total != 10000 {
		t.Errorf("expected Total 10000, got %f", result.Total)
	}
	if len(result.Items) != 1 || result.Items[0].UnitPrice != 10000 || result.Items[0].TotalPrice != 10000 {
		t.Errorf("unexpected item contents: %+v", result.Items)
	}
}

func TestNemotronProvider_ExtractReceipt_Timeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Simulate long latency
		<-r.Context().Done()
	}))
	defer server.Close()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	provider := NewNemotronProvider("key", server.URL, "model", server.Client(), logger)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately to trigger timeout error path

	_, err := provider.ExtractReceipt(ctx, "OCR TEXT")
	if err == nil {
		t.Fatal("expected timeout/cancellation error, got nil")
	}
}

