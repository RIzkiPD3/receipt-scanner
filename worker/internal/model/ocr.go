package model

// OCRResult membawa data hasil pembacaan OCR
type OCRResult struct {
	Text       string  `json:"text"`
	Confidence float64 `json:"confidence"`
}
