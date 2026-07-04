package model

// ReceiptResult merepresentasikan hasil ekstraksi data struk belanja terstruktur
type ReceiptResult struct {
	StoreName       string        `json:"storeName"`
	TransactionDate string        `json:"transactionDate"`
	Subtotal        float64       `json:"subtotal"`
	Tax             float64       `json:"tax"`
	Total           float64       `json:"total"`
	Items           []ReceiptItem `json:"items"`
}
