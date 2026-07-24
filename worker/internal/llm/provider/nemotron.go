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
	startTime := time.Now()
	trimmedText := strings.TrimSpace(rawText)
	if trimmedText == "" {
		p.logger.Warn("Teks OCR mentah kosong")
		p.logger.Error("AI Processing Failed", "error", "empty OCR text", "duration", time.Since(startTime))
		return nil, errors.New("empty OCR text")
	}

	p.logger.Info("AI Processing Started", "ocrTextLength", len(rawText))

	systemPrompt := `You are an expert receipt parser AI. Your task is to convert raw OCR text into structured receipt JSON data.

Rules & Guidelines:
1. Extract the following fields strictly from the OCR text:
   - merchant: name of store/merchant (string or null if absent)
   - transaction_date: date of transaction in YYYY-MM-DD format (string or null if absent)
   - items: array of items purchased, each item having:
     - name: name of the product/item (string)
     - quantity: quantity bought (number, default 1)
     - unit_price: unit price per item (number)
   - subtotal: subtotal amount before tax/discount (number or null)
   - total: total final amount paid (number or null)

2. Strict Data Accuracy:
   - Do NOT invent or hallucinate data that is not present in the OCR text.
   - If information cannot be confidently extracted, return null for that field.
   - Indonesian currency format: dot (.) is thousands separator, comma (,) is decimal separator. Convert all monetary numbers to clean plain numeric values (e.g. 10.000 -> 10000).

3. Output Format:
   - Respond ONLY with valid JSON.
   - Do NOT wrap in explanation or conversational prose.

Required JSON Structure:
{
  "merchant": null,
  "transaction_date": null,
  "items": [
    {
      "name": "",
      "quantity": 1,
      "unit_price": 0
    }
  ],
  "subtotal": null,
  "total": null
}`

	userPrompt := fmt.Sprintf("Extract this OCR receipt text:\n\n%s", rawText)

	reqPayload := chatCompletionRequest{
		Model: p.modelName,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		},
		Temperature: 0.1,
	}

	payloadBytes, err := json.Marshal(reqPayload)
	if err != nil {
		p.logger.Error("AI Processing Failed", "error", err.Error(), "duration", time.Since(startTime))
		return nil, fmt.Errorf("failed to marshal request payload: %w", err)
	}

	url := fmt.Sprintf("%s/chat/completions", strings.TrimSuffix(p.baseURL, "/"))

	var respBody []byte
	var lastErr error
	maxRetries := 3

	p.logger.Info("NVIDIA Request Sent", "url", url, "model", p.modelName)

	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			p.logger.Info("retry", "attempt", attempt, "maxRetries", maxRetries, "lastError", lastErr.Error())
			select {
			case <-ctx.Done():
				p.logger.Error("AI Processing Failed", "error", ctx.Err().Error(), "duration", time.Since(startTime))
				return nil, ctx.Err()
			case <-time.After(time.Duration(attempt) * time.Second):
			}
		}

		reqStart := time.Now()
		req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(payloadBytes))
		if err != nil {
			lastErr = fmt.Errorf("failed to create request: %w", err)
			continue
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", p.apiKey))

		resp, err := p.httpClient.Do(req)
		if err != nil {
			if errors.Is(ctx.Err(), context.DeadlineExceeded) || errors.Is(ctx.Err(), context.Canceled) {
				p.logger.Error("AI Processing Failed", "error", ctx.Err().Error(), "duration", time.Since(startTime))
				return nil, ctx.Err()
			}
			lastErr = fmt.Errorf("network error: %w", err)
			p.logger.Warn("network error", "error", err.Error())
			continue
		}

		reqDuration := time.Since(reqStart)
		p.logger.Info("NVIDIA Response Received", "status", resp.Status, "duration", reqDuration)

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = fmt.Errorf("failed to read response body: %w", err)
			continue
		}

		if resp.StatusCode == http.StatusUnauthorized {
			p.logger.Error("unauthorized: invalid NVIDIA API key")
			p.logger.Error("AI Processing Failed", "error", "unauthorized: invalid API key", "duration", time.Since(startTime))
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
		p.logger.Error("AI Processing Failed", "error", lastErr.Error(), "duration", time.Since(startTime))
		return nil, fmt.Errorf("all retry attempts failed: %w", lastErr)
	}

	var completionResp chatCompletionResponse
	if err := json.Unmarshal(respBody, &completionResp); err != nil {
		p.logger.Error("parsing failed", "error", err.Error(), "rawResponse", string(respBody))
		p.logger.Error("AI Processing Failed", "error", err.Error(), "duration", time.Since(startTime))
		return nil, fmt.Errorf("failed to unmarshal completion response: %w", err)
	}

	if len(completionResp.Choices) == 0 {
		p.logger.Error("parsing failed: empty choices in response", "rawResponse", string(respBody))
		p.logger.Error("AI Processing Failed", "error", "empty choices in response", "duration", time.Since(startTime))
		return nil, errors.New("empty choices in response")
	}

	aiResponseText := completionResp.Choices[0].Message.Content
	if strings.TrimSpace(aiResponseText) == "" {
		p.logger.Error("parsing failed: empty AI response text")
		p.logger.Error("AI Processing Failed", "error", "empty AI response text", "duration", time.Since(startTime))
		return nil, errors.New("empty AI response text")
	}

	cleanJSON := cleanMarkdownJSON(aiResponseText)

	var receiptResult model.ReceiptResult
	if err := json.Unmarshal([]byte(cleanJSON), &receiptResult); err != nil {
		p.logger.Error("parsing failed: invalid JSON returned by AI", "error", err.Error(), "rawResponse", aiResponseText)
		p.logger.Error("AI Processing Failed", "error", err.Error(), "duration", time.Since(startTime))
		return nil, fmt.Errorf("invalid JSON returned by AI: %w", err)
	}

	totalDuration := time.Since(startTime)
	p.logger.Info("AI Processing Completed", "merchant", receiptResult.StoreName, "total", receiptResult.Total, "duration", totalDuration)
	return &receiptResult, nil
}

// cleanMarkdownJSON menghapus block code markdown seperti ```json ... ``` dari teks output
func cleanMarkdownJSON(input string) string {
	input = strings.TrimSpace(input)

	// Clean nested or leading markdown fence tags like ```json or ```
	for strings.HasPrefix(input, "```") {
		if firstNewline := strings.Index(input, "\n"); firstNewline != -1 {
			input = input[firstNewline+1:]
		} else {
			input = strings.TrimPrefix(input, "```")
		}
		input = strings.TrimSpace(input)
	}

	if strings.HasSuffix(input, "```") {
		input = strings.TrimSuffix(input, "```")
		input = strings.TrimSpace(input)
	}

	// Bounding to outermost JSON brackets { and }
	firstBrace := strings.Index(input, "{")
	lastBrace := strings.LastIndex(input, "}")
	if firstBrace != -1 && lastBrace != -1 && lastBrace >= firstBrace {
		input = input[firstBrace : lastBrace+1]
	}

	return strings.TrimSpace(input)
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

