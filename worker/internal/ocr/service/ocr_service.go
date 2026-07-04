package ocrservice

import (
	"context"
	"fmt"
	ocrinterface "invoicego/worker/internal/ocr/interface"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// OCRService mengorkestrasi pengunduhan gambar dan pemanggilan OCR provider
type OCRService struct {
	provider        ocrinterface.OCRProvider
	tempDownloadDir string
	logger          *slog.Logger
}

// NewOCRService membuat instance baru OCRService
func NewOCRService(provider ocrinterface.OCRProvider, tempDownloadDir string, logger *slog.Logger) *OCRService {
	return &OCRService{
		provider:        provider,
		tempDownloadDir: tempDownloadDir,
		logger:          logger,
	}
}

// ExtractFromURL mengunduh gambar dari URL, menjalankan OCR, lalu membersihkan berkas sementara
func (s *OCRService) ExtractFromURL(ctx context.Context, receiptID, imageURL string) (string, error) {
	s.logger.Debug("Mengunduh gambar struk untuk OCR", "receiptId", receiptID, "imageUrl", imageURL)

	if err := os.MkdirAll(s.tempDownloadDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create temp download directory: %w", err)
	}

	localPath, err := s.downloadImage(ctx, receiptID, imageURL)
	if err != nil {
		return "", fmt.Errorf("failed to download receipt image: %w", err)
	}

	defer func() {
		s.logger.Debug("Menghapus berkas gambar sementara", "localPath", localPath)
		if err := os.Remove(localPath); err != nil {
			s.logger.Warn("Gagal menghapus berkas gambar sementara", "localPath", localPath, "error", err.Error())
		}
	}()

	rawText, err := s.provider.ExtractText(ctx, localPath)
	if err != nil {
		return "", fmt.Errorf("failed to extract text via OCR provider: %w", err)
	}

	return rawText, nil
}

// downloadImage mengunduh data biner dari URL dan menyimpannya secara lokal
func (s *OCRService) downloadImage(ctx context.Context, receiptID, imageURL string) (string, error) {
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
	localPath := filepath.Join(s.tempDownloadDir, fileName)

	out, err := os.Create(localPath)
	if err != nil {
		return "", err
	}
	defer out.Close()

	if _, err = io.Copy(out, resp.Body); err != nil {
		return "", err
	}

	s.logger.Debug("Berkas gambar berhasil diunduh", "localPath", localPath)
	return localPath, nil
}
