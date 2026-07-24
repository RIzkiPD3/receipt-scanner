package model

import "encoding/json"

// ReceiptItem merepresentasikan item tunggal dalam struk belanja
type ReceiptItem struct {
	Name       string  `json:"name"`
	Quantity   float64 `json:"quantity"`
	UnitPrice  float64 `json:"unitPrice"`
	TotalPrice float64 `json:"totalPrice"`
}

// UnmarshalJSON menguraikan JSON ke ReceiptItem dengan mendukung unit_price / unitPrice dan total_price / totalPrice
func (item *ReceiptItem) UnmarshalJSON(data []byte) error {
	type Alias ReceiptItem
	aux := struct {
		UnitPriceAlt  *float64 `json:"unit_price"`
		TotalPriceAlt *float64 `json:"total_price"`
		*Alias
	}{
		Alias: (*Alias)(item),
	}

	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}

	if item.UnitPrice == 0 && aux.UnitPriceAlt != nil {
		item.UnitPrice = *aux.UnitPriceAlt
	}

	if item.TotalPrice == 0 && aux.TotalPriceAlt != nil {
		item.TotalPrice = *aux.TotalPriceAlt
	}

	if item.TotalPrice == 0 && item.Quantity > 0 && item.UnitPrice > 0 {
		item.TotalPrice = item.Quantity * item.UnitPrice
	}

	return nil
}

