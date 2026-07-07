package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"invoicego/worker/internal/llm/model"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// NemotronProvider mengimplementasikan interface LLMProvider untuk model NVIDIA Nemotron
type NemotronProvider struct {
	apiKey     string
	baseURL    string
	modelName  string
	httpClient *http.Client
	logger     *slog.Logger
}

// NewNemotronProvider membuat instance baru dari NemotronProvider
func NewNemotronProvider(apiKey, baseURL, modelName string, httpClient *http.Client, logger *slog.Logger) *NemotronProvider {
	if httpClient == nil {
		httpClient = &http.Client{
			Timeout: 30 * time.Second,
		}
	}
	return &NemotronProvider{
		apiKey:     apiKey,
		baseURL:    baseURL,
		modelName:  modelName,
		httpClient: httpClient,
		logger:     logger,
	}
}

// chatMessage mewakili format pesan tunggal untuk API chat/completions NVIDIA
type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// chatCompletionRequest mewakili format request untuk API chat/completions NVIDIA
type chatCompletionRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
}

// chatCompletionResponse mewakili format response dari API chat/completions NVIDIA
type chatCompletionResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
}

// ExtractReceipt mengambil teks OCR mentah dan mengekstraknya menjadi objek ReceiptResult terstruktur
func (p *NemotronProvider) ExtractReceipt(ctx context.Context, rawText string) (*model.ReceiptResult, error) {
	if strings.TrimSpace(rawText) == "" {
		p.logger.Warn("Teks OCR mentah kosong")
		return nil, errors.New("empty OCR text")
	}

	systemPrompt := `You are an expert receipt parser.

Extract receipt information into JSON only.

Never explain anything.

Return valid JSON.

Required JSON structure:

{
  "storeName": "",
  "transactionDate": "",
  "subtotal": 0,
  "tax": 0,
  "total": 0,
  "items": [
    {
      "name": "",
      "quantity": 0,
      "unitPrice": 0,
      "totalPrice": 0
    }
  ]
}`

	userPrompt := fmt.Sprintf("Extract this receipt:\n\n%s", rawText)

	reqPayload := chatCompletionRequest{
		Model: p.modelName,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
		Temperature: 0.2, // Nilai rendah untuk hasil yang deterministik
	}

	payloadBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request payload: %w", err)
	}

	url := fmt.Sprintf("%s/chat/completions", strings.TrimSuffix(p.baseURL, "/"))

	var respBody []byte
	var lastErr error
	maxRetries := 3

	p.logger.Info("request started", "url", url, "model", p.modelName)

	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			p.logger.Info("retry", "attempt", attempt, "maxRetries", maxRetries, "lastError", lastErr.Error())
			// Jeda waktu backoff sederhana sebelum mencoba kembali
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Duration(attempt) * time.Second):
			}
		}

		startTime := time.Now()
		req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(payloadBytes))
		if err != nil {
			lastErr = fmt.Errorf("failed to create request: %w", err)
			continue
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", p.apiKey))

		resp, err := p.httpClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("network error: %w", err)
			p.logger.Warn("network error", "error", err.Error())
			continue
		}

		duration := time.Since(startTime)
		p.logger.Info("response received", "status", resp.Status, "duration", duration)

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = fmt.Errorf("failed to read response body: %w", err)
			continue
		}

		// Jika status HTTP 401 Unauthorized, langsung kembalikan error (jangan coba lagi)
		if resp.StatusCode == http.StatusUnauthorized {
			p.logger.Error("unauthorized: invalid NVIDIA API key")
			return nil, errors.New("unauthorized: invalid API key")
		}

		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Errorf("invalid response: status code %d, body: %s", resp.StatusCode, string(body))
			continue
		}

		respBody = body
		lastErr = nil
		break
	}

	if lastErr != nil {
		return nil, fmt.Errorf("all retry attempts failed: %w", lastErr)
	}

	var completionResp chatCompletionResponse
	if err := json.Unmarshal(respBody, &completionResp); err != nil {
		p.logger.Error("parsing failed", "error", err.Error(), "rawResponse", string(respBody))
		return nil, fmt.Errorf("failed to unmarshal completion response: %w", err)
	}

	if len(completionResp.Choices) == 0 {
		p.logger.Error("parsing failed: empty choices in response", "rawResponse", string(respBody))
		return nil, errors.New("empty choices in response")
	}

	aiResponseText := completionResp.Choices[0].Message.Content
	cleanJSON := cleanMarkdownJSON(aiResponseText)

	var receiptResult model.ReceiptResult
	if err := json.Unmarshal([]byte(cleanJSON), &receiptResult); err != nil {
		p.logger.Error("parsing failed: invalid JSON returned by AI", "error", err.Error(), "rawResponse", aiResponseText)
		return nil, fmt.Errorf("invalid JSON returned by AI: %w", err)
	}

	p.logger.Info("success", "storeName", receiptResult.StoreName, "total", receiptResult.Total)
	return &receiptResult, nil
}

// cleanMarkdownJSON menghapus block code markdown seperti ```json ... ``` dari teks output
func cleanMarkdownJSON(input string) string {
	input = strings.TrimSpace(input)

	// Hapus backticks blok markdown jika ada
	if strings.HasPrefix(input, "```") {
		if firstNewline := strings.Index(input, "\n"); firstNewline != -1 {
			input = input[firstNewline+1:]
		}
		if strings.HasSuffix(input, "```") {
			input = input[:len(input)-3]
		}
		input = strings.TrimSpace(input)
	}

	// Untuk mengantisipasi teks tambahan di luar JSON {}
	firstBrace := strings.Index(input, "{")
	lastBrace := strings.LastIndex(input, "}")
	if firstBrace != -1 && lastBrace != -1 && lastBrace > firstBrace {
		input = input[firstBrace : lastBrace+1]
	}

	return input
}

// Ping memeriksa apakah layanan NVIDIA API dapat dijangkau
func (p *NemotronProvider) Ping(ctx context.Context) error {
	if p.apiKey == "" {
		return errors.New("NVIDIA API Key is not configured")
	}

	url := fmt.Sprintf("%s/models", strings.TrimSuffix(p.baseURL, "/"))
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", p.apiKey))
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("network connection error: %w", err)
	}
	defer resp.Body.Close()

	// Kita anggap status di luar 5xx sebagai reachable (termasuk 401 Unauthorized atau 404 Not Found)
	// karena itu membuktikan server merespons request HTTP kita.
	if resp.StatusCode >= 500 {
		return fmt.Errorf("server returned error status: %d", resp.StatusCode)
	}
	return nil
}

