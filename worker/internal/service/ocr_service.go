package service

import (
	"context"
	"fmt"
	"invoicego/worker/internal/model"
	"invoicego/worker/internal/ocr"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// OCRService mengoordinasi pengunduhan gambar struk sementara dan pemrosesan OCR
type OCRService struct {
	ocrProvider     ocr.Provider
	tempDownloadDir string
	logger          *slog.Logger
}

// NewOCRService membuat instance baru OCRService
func NewOCRService(ocrProvider ocr.Provider, tempDownloadDir string, logger *slog.Logger) *OCRService {
	return &OCRService{
		ocrProvider:     ocrProvider,
		tempDownloadDir: tempDownloadDir,
		logger:          logger,
	}
}

// ProcessReceipt mengunduh gambar dari imageUrl secara lokal, memproses OCR, dan membersihkan file sementara
func (s *OCRService) ProcessReceipt(ctx context.Context, receiptID string, imageUrl string) (*model.OCRResult, error) {
	s.logger.Info("Memulai pemrosesan struk", "receiptId", receiptID, "imageUrl", imageUrl)

	// 1. Pastikan folder download sementara sudah ada
	if err := os.MkdirAll(s.tempDownloadDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create temporary download directory: %w", err)
	}

	// 2. Download berkas gambar ke disk lokal
	localPath, err := s.downloadImage(ctx, receiptID, imageUrl)
	if err != nil {
		return nil, fmt.Errorf("failed to download receipt image: %w", err)
	}

	// 3. Jamin berkas sementara dihapus setelah OCR selesai menggunakan defer
	defer func() {
		s.logger.Debug("Menghapus berkas gambar sementara", "localPath", localPath)
		if err := os.Remove(localPath); err != nil {
			s.logger.Warn("Gagal menghapus berkas gambar sementara", "localPath", localPath, "error", err.Error())
		}
	}()

	// 4. Ekstrak teks via OCR Provider
	ocrResult, err := s.ocrProvider.ExtractText(ctx, localPath)
	if err != nil {
		return nil, fmt.Errorf("failed to extract text via OCR provider: %w", err)
	}

	return ocrResult, nil
}

// downloadImage mengunduh data biner dari URL dan menyimpannya secara lokal
func (s *OCRService) downloadImage(ctx context.Context, receiptID string, imageUrl string) (string, error) {
	s.logger.Debug("Mengunduh berkas gambar untuk OCR...", "imageUrl", imageUrl)

	req, err := http.NewRequestWithContext(ctx, "GET", imageUrl, nil)
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

	// Tentukan ekstensi berkas berdasarkan Content-Type header
	ext := ".jpg"
	contentType := resp.Header.Get("Content-Type")
	if strings.Contains(contentType, "image/png") {
		ext = ".png"
	} else if strings.Contains(contentType, "image/webp") {
		ext = ".webp"
	}

	fileName := fmt.Sprintf("%s-%d%s", receiptID, time.Now().UnixNano(), ext)
	localPath := filepath.Join(s.tempDownloadDir, fileName)

	// Buat file lokal
	out, err := os.Create(localPath)
	if err != nil {
		return "", err
	}
	defer out.Close()

	// Tulis isi response body ke file lokal
	_, err = io.Copy(out, resp.Body)
	if err != nil {
		return "", err
	}

	s.logger.Debug("Berkas gambar berhasil diunduh secara lokal", "localPath", localPath)
	return localPath, nil
}
