package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"
)

// TextExtractor defines the OCR extractor contract required by WorkerService.
// This decouples the worker flow from the concrete OCR implementation.
type TextExtractor interface {
	ExtractText(imagePath string) (string, error)
}

// WorkerService orchestrates the receipt image processing flow.
type WorkerService struct {
	ocrService TextExtractor
	logger     *slog.Logger
}

// NewWorkerService creates a new instance of WorkerService with dependency injection.
func NewWorkerService(ocrService TextExtractor, logger *slog.Logger) *WorkerService {
	return &WorkerService{
		ocrService: ocrService,
		logger:     logger,
	}
}

// ProcessImage handles step-by-step receipt image validation and text extraction via OCR.
func (w *WorkerService) ProcessImage(ctx context.Context, imagePath string) (string, error) {
	w.logger.Info("Worker Started")
	startTime := time.Now()

	// 1. Validate image path (image kosong)
	imagePath = strings.TrimSpace(imagePath)
	if imagePath == "" {
		err := errors.New("image path cannot be empty")
		w.logger.Error("OCR Failed", "error", err.Error())
		return "", err
	}

	w.logger.Info("Image Received", "imagePath", imagePath)

	// 2. Validate file existence and check if file is not empty (path tidak ditemukan / file kosong)
	info, err := os.Stat(imagePath)
	if err != nil {
		if os.IsNotExist(err) {
			err = fmt.Errorf("path not found: %s", imagePath)
		}
		w.logger.Error("OCR Failed", "imagePath", imagePath, "error", err.Error())
		return "", err
	}
	if info.IsDir() {
		err = fmt.Errorf("path is a directory, not a file: %s", imagePath)
		w.logger.Error("OCR Failed", "imagePath", imagePath, "error", err.Error())
		return "", err
	}
	if info.Size() == 0 {
		err = fmt.Errorf("image file is empty (0 bytes): %s", imagePath)
		w.logger.Error("OCR Failed", "imagePath", imagePath, "error", err.Error())
		return "", err
	}

	// 3. Process OCR
	w.logger.Info("OCR Processing", "imagePath", imagePath)

	rawText, err := w.ocrService.ExtractText(imagePath)
	executionTime := time.Since(startTime)

	if err != nil {
		w.logger.Error("OCR Failed",
			"imagePath", imagePath,
			"executionTime", executionTime.String(),
			"error", err.Error(),
		)
		return "", fmt.Errorf("OCR processing failed: %w", err)
	}

	w.logger.Info("OCR Success",
		"imagePath", imagePath,
		"textLength", len(rawText),
	)
	w.logger.Info("Execution Time",
		"duration", executionTime.String(),
	)

	return rawText, nil
}
