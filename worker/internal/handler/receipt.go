package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"invoicego/worker/internal/client"
	"invoicego/worker/internal/model"
	"invoicego/worker/internal/processing"
	"invoicego/worker/internal/service"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ReceiptHandler menangani permintaan POST /process-receipt
type ReceiptHandler struct {
	processingService *processing.ProcessingService
	ocrService        *service.OCRService
	ocrEngine         string
	tempDownloadDir   string
	backendClient     *client.BackendClient
	logger            *slog.Logger
}

// NewReceiptHandler membuat instance baru ReceiptHandler dengan dependency injection
func NewReceiptHandler(
	processingService *processing.ProcessingService,
	ocrService *service.OCRService,
	ocrEngine string,
	tempDownloadDir string,
	backendClient *client.BackendClient,
	logger *slog.Logger,
) *ReceiptHandler {
	return &ReceiptHandler{
		processingService: processingService,
		ocrService:        ocrService,
		ocrEngine:         ocrEngine,
		tempDownloadDir:   tempDownloadDir,
		backendClient:     backendClient,
		logger:            logger,
	}
}

// ServeHTTP mengimplementasikan interface http.Handler
func (h *ReceiptHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var req model.ProcessReceiptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.logger.Error("Gagal mendekode body request", "error", err)
		h.sendJSON(w, http.StatusBadRequest, model.ProcessReceiptResponse{
			Status:  "error",
			Message: "invalid request body",
		})
		return
	}

	if req.ReceiptID == "" || req.ImageURL == "" {
		h.logger.Warn("Validasi gagal: receiptId atau imageUrl kosong",
			"receiptId", req.ReceiptID,
			"imageUrl", req.ImageURL,
		)
		h.sendJSON(w, http.StatusBadRequest, model.ProcessReceiptResponse{
			Status:  "error",
			Message: "receiptId and imageUrl are required",
		})
		return
	}

	h.logger.Info("Permintaan pemrosesan struk diterima",
		"receiptId", req.ReceiptID,
		"imageUrl", req.ImageURL,
	)

	// Jika menggunakan PaddleOCR, jalankan OCR mentah dan langsung kembalikan hasilnya (Bypass AI & DB)
	if h.ocrEngine == "paddle" {
		h.logger.Info("Menggunakan PaddleOCR untuk ekstraksi teks mentah", "receiptId", req.ReceiptID)

		if err := os.MkdirAll(h.tempDownloadDir, 0755); err != nil {
			h.logger.Error("Gagal membuat direktori download sementara", "error", err.Error())
			h.sendJSON(w, http.StatusInternalServerError, model.ProcessReceiptResponse{
				Status: "error",
				Error:  fmt.Sprintf("failed to create temp download directory: %s", err.Error()),
			})
			return
		}

		localPath, err := h.downloadImage(r.Context(), req.ReceiptID, req.ImageURL)
		if err != nil {
			h.logger.Error("Gagal mengunduh gambar", "receiptId", req.ReceiptID, "error", err.Error())
			h.sendJSON(w, http.StatusInternalServerError, model.ProcessReceiptResponse{
				Status: "error",
				Error:  fmt.Sprintf("failed to download receipt image: %s", err.Error()),
			})
			return
		}
		defer func() {
			h.logger.Debug("Menghapus berkas gambar sementara", "localPath", localPath)
			if err := os.Remove(localPath); err != nil {
				h.logger.Warn("Gagal menghapus berkas gambar sementara", "localPath", localPath, "error", err.Error())
			}
		}()

		rawText, err := h.ocrService.ExtractText(localPath)
		if err != nil {
			h.logger.Error("PaddleOCR gagal mengekstrak teks", "receiptId", req.ReceiptID, "error", err.Error())
			h.sendJSON(w, http.StatusInternalServerError, model.ProcessReceiptResponse{
				Status: "error",
				Error:  fmt.Sprintf("failed to extract text via OCR provider: %s", err.Error()),
			})
			return
		}

		h.sendJSON(w, http.StatusOK, model.ProcessReceiptResponse{
			Status: "success",
			Text:   rawText,
		})
		return
	}

	result, err := h.processingService.Run(r.Context(), processing.PipelineInput{
		ReceiptID: req.ReceiptID,
		ImageURL:  req.ImageURL,
	})
	if err != nil {
		h.logger.Error("Pipeline pemrosesan struk gagal",
			"receiptId", req.ReceiptID,
			"error", err.Error(),
		)
		h.sendJSON(w, http.StatusInternalServerError, model.ProcessReceiptResponse{
			Status: "error",
			Error:  err.Error(),
		})
		return
	}

	h.logger.Info("Pipeline pemrosesan struk berhasil diselesaikan, menyimpan ke backend", "receiptId", req.ReceiptID)

	// Simpan data struk terstruktur ke backend API
	if err := h.backendClient.SaveReceipt(r.Context(), result.Receipt, req.ImageURL, req.ReceiptID); err != nil {
		h.logger.Error("Gagal menyimpan hasil struk ke backend", "receiptId", req.ReceiptID, "error", err.Error())
		h.sendJSON(w, http.StatusInternalServerError, model.ProcessReceiptResponse{
			Status: "error",
			Error:  fmt.Sprintf("failed to save receipt to database: %s", err.Error()),
		})
		return
	}

	h.logger.Info("Data struk berhasil disimpan ke backend", "receiptId", req.ReceiptID)

	h.sendJSON(w, http.StatusOK, model.ProcessReceiptResponse{
		Status:  "success",
		Text:    result.RawText,
		Receipt: result.Receipt,
	})
}

// downloadImage mengunduh data biner dari URL dan menyimpannya secara lokal
func (h *ReceiptHandler) downloadImage(ctx context.Context, receiptID, imageURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", imageURL, nil)
	if err != nil {
		return "", err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("server mengembalikan HTTP %d", resp.StatusCode)
	}

	ext := ".jpg"
	contentType := resp.Header.Get("Content-Type")
	if strings.Contains(contentType, "image/png") {
		ext = ".png"
	} else if strings.Contains(contentType, "image/webp") {
		ext = ".webp"
	}

	fileName := fmt.Sprintf("%s-%d%s", receiptID, time.Now().UnixNano(), ext)
	localPath := filepath.Join(h.tempDownloadDir, fileName)

	out, err := os.Create(localPath)
	if err != nil {
		return "", err
	}
	defer out.Close()

	if _, err = io.Copy(out, resp.Body); err != nil {
		return "", err
	}

	return localPath, nil
}

// sendJSON menyederhanakan pengiriman response JSON dengan status code tertentu
func (h *ReceiptHandler) sendJSON(w http.ResponseWriter, statusCode int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(payload)
}
