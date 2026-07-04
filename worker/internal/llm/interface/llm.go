package llminterface

import (
	"context"
	"invoicego/worker/internal/llm/model"
)

// LLMProvider mendefinisikan kontrak interface untuk penyedia layanan LLM
type LLMProvider interface {
	ExtractReceipt(ctx context.Context, rawText string) (*model.ReceiptResult, error)
}
