package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	llmmodel "invoicego/worker/internal/llm/model"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// BackendClient bertanggung jawab mengirimkan data struk belanja terstruktur ke NestJS Backend API
type BackendClient struct {
	baseURL    string
	httpClient *http.Client
	logger     *slog.Logger
}

// SaveReceiptRequest merepresentasikan struktur request JSON ke endpoint POST /api/receipts
type SaveReceiptRequest struct {
	StoreName       string                   `json:"storeName"`
	TransactionDate string                   `json:"transactionDate"`
	Subtotal        float64                  `json:"subtotal"`
	Tax             float64                  `json:"tax"`
	Total           float64                  `json:"total"`
	Items           []SaveReceiptItemRequest `json:"items"`
	ImageURL        string                   `json:"imageUrl,omitempty"`
}

// SaveReceiptItemRequest merepresentasikan item dalam SaveReceiptRequest
type SaveReceiptItemRequest struct {
	Name       string  `json:"name"`
	Quantity   float64 `json:"quantity"`
	UnitPrice  float64 `json:"unitPrice"`
	TotalPrice float64 `json:"totalPrice"`
}

// NewBackendClient membuat instance baru dari BackendClient
func NewBackendClient(baseURL string, httpClient *http.Client, logger *slog.Logger) *BackendClient {
	if httpClient == nil {
		httpClient = &http.Client{
			Timeout: 15 * time.Second,
		}
	}
	return &BackendClient{
		baseURL:    baseURL,
		httpClient: httpClient,
		logger:     logger,
	}
}

// SaveReceipt mengirimkan payload data struk belanja ke NestJS Backend
func (c *BackendClient) SaveReceipt(ctx context.Context, receipt *llmmodel.ReceiptResult, imageUrl string) error {
	c.logger.Info("Sending receipt", "storeName", receipt.StoreName, "total", receipt.Total)

	itemsReq := make([]SaveReceiptItemRequest, len(receipt.Items))
	for i, item := range receipt.Items {
		itemsReq[i] = SaveReceiptItemRequest{
			Name:       item.Name,
			Quantity:   item.Quantity,
			UnitPrice:  item.UnitPrice,
			TotalPrice: item.TotalPrice,
		}
	}

	reqPayload := SaveReceiptRequest{
		StoreName:       receipt.StoreName,
		TransactionDate: receipt.TransactionDate,
		Subtotal:        receipt.Subtotal,
		Tax:             receipt.Tax,
		Total:           receipt.Total,
		Items:           itemsReq,
		ImageURL:        imageUrl,
	}

	payloadBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return fmt.Errorf("failed to marshal request payload: %w", err)
	}

	url := fmt.Sprintf("%s/api/receipts", strings.TrimSuffix(c.baseURL, "/"))
	maxRetries := 3
	var lastErr error

	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			c.logger.Info("HTTP retry", "attempt", attempt, "maxRetries", maxRetries, "error", lastErr.Error())
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(time.Duration(attempt) * time.Second):
			}
		}

		req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(payloadBytes))
		if err != nil {
			lastErr = fmt.Errorf("failed to create request: %w", err)
			continue
		}

		req.Header.Set("Content-Type", "application/json")

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("network error: %w", err)
			continue
		}

		c.logger.Info("Backend response", "status", resp.Status)

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = fmt.Errorf("failed to read response body: %w", err)
			continue
		}

		// Tangani bad request (400), not found (404), dan client error lainnya secara langsung tanpa retry
		if resp.StatusCode >= 400 && resp.StatusCode < 500 {
			c.logger.Error("Save failed", "status", resp.StatusCode, "body", string(body))
			return fmt.Errorf("backend rejected request (HTTP %d): %s", resp.StatusCode, string(body))
		}

		// Tangani server error (500) dengan retry
		if resp.StatusCode >= 500 {
			lastErr = fmt.Errorf("backend server error (HTTP %d): %s", resp.StatusCode, string(body))
			continue
		}

		c.logger.Info("Save success", "status", resp.StatusCode)
		return nil
	}

	return fmt.Errorf("all backend retries failed: %w", lastErr)
}
