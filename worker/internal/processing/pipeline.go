package processing

import llmmodel "invoicego/worker/internal/llm/model"

// PipelineInput berisi data masukan untuk pipeline pemrosesan struk
type PipelineInput struct {
	ReceiptID string
	ImageURL  string
}

// PipelineResult berisi data keluaran dari pipeline pemrosesan struk yang telah selesai
type PipelineResult struct {
	RawText string
	Receipt *llmmodel.ReceiptResult
}
