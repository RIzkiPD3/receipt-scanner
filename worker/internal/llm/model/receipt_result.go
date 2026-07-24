package model

import (
	"encoding/json"
)

// ReceiptResult merepresentasikan hasil ekstraksi data struk belanja terstruktur
type ReceiptResult struct {
	Merchant        string        `json:"merchant,omitempty"`
	StoreName       string        `json:"storeName"`
	TransactionDate string        `json:"transactionDate"`
	Subtotal        float64       `json:"subtotal"`
	Tax             float64       `json:"tax,omitempty"`
	Total           float64       `json:"total"`
	Items           []ReceiptItem `json:"items"`
}

// UnmarshalJSON menguraikan JSON ke ReceiptResult dengan mendukung field alias (merchant/storeName, transaction_date/transactionDate)
func (r *ReceiptResult) UnmarshalJSON(data []byte) error {
	type Alias ReceiptResult
	aux := struct {
		MerchantAlt        *string `json:"merchant"`
		StoreNameAlt       *string `json:"store_name"`
		TransactionDateAlt *string `json:"transaction_date"`
		*Alias
	}{
		Alias: (*Alias)(r),
	}

	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}

	// Sinkronisasi merchant / storeName
	if r.StoreName == "" {
		if aux.MerchantAlt != nil && *aux.MerchantAlt != "" {
			r.StoreName = *aux.MerchantAlt
		} else if aux.StoreNameAlt != nil && *aux.StoreNameAlt != "" {
			r.StoreName = *aux.StoreNameAlt
		} else if r.Merchant != "" {
			r.StoreName = r.Merchant
		}
	}
	if r.Merchant == "" {
		r.Merchant = r.StoreName
	}

	// Sinkronisasi transaction_date / transactionDate
	if r.TransactionDate == "" && aux.TransactionDateAlt != nil {
		r.TransactionDate = *aux.TransactionDateAlt
	}

	return nil
}

