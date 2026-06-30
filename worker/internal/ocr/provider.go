package ocr

import (
	"context"
	"invoicego/worker/internal/model"
)

// Provider mendefinisikan kontrak interface sistem OCR
type Provider interface {
	ExtractText(ctx context.Context, imagePath string) (*model.OCRResult, error)
}
