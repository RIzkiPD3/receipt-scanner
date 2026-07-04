package model

// ReceiptItem merepresentasikan item tunggal dalam struk belanja
type ReceiptItem struct {
	Name       string  `json:"name"`
	Quantity   float64 `json:"quantity"`
	UnitPrice  float64 `json:"unitPrice"`
	TotalPrice float64 `json:"totalPrice"`
}
