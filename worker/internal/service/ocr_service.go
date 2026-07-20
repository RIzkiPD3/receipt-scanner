package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"strings"
	"time"
)

// OCRService runs PaddleOCR via Python helper script
type OCRService struct {
	pythonPath    string
	paddleOcrPath string
	logger        *slog.Logger
}

// NewOCRService creates a new instance of OCRService
func NewOCRService(pythonPath, paddleOcrPath string, logger *slog.Logger) *OCRService {
	return &OCRService{
		pythonPath:    pythonPath,
		paddleOcrPath: paddleOcrPath,
		logger:        logger,
	}
}

// ExtractText processes the image path and returns extracted text using PaddleOCR
func (s *OCRService) ExtractText(imagePath string) (string, error) {
	s.logger.Info("OCR Started", "imagePath", imagePath)
	startTime := time.Now()

	// 1. Handle file not found (pre-check)
	if _, err := os.Stat(imagePath); os.IsNotExist(err) {
		s.logger.Error("OCR Error", "error", "file not found", "imagePath", imagePath)
		return "", fmt.Errorf("file not found: %s", imagePath)
	}

	// 2. Handle configuration validation
	if s.pythonPath == "" {
		s.logger.Error("OCR Error", "error", "PYTHON_PATH is not configured")
		return "", errors.New("PYTHON_PATH is not configured")
	}
	if s.paddleOcrPath == "" {
		s.logger.Error("OCR Error", "error", "PADDLEOCR_PATH is not configured")
		return "", errors.New("PADDLEOCR_PATH is not configured")
	}
	if _, err := os.Stat(s.paddleOcrPath); os.IsNotExist(err) {
		s.logger.Error("OCR Error", "error", "paddleocr_helper.py not found at configured path", "path", s.paddleOcrPath)
		return "", fmt.Errorf("paddleocr_helper.py not found at %s", s.paddleOcrPath)
	}

	// Set execution timeout (120 seconds)
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, s.pythonPath, s.paddleOcrPath, imagePath)
	
	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	duration := time.Since(startTime)

	// 3. Handle timeout
	if ctx.Err() == context.DeadlineExceeded {
		s.logger.Error("OCR Error", "error", "OCR execution timed out", "duration", duration.String())
		return "", fmt.Errorf("OCR execution timed out after %s", duration.String())
	}

	if err != nil {
		stderrStr := strings.TrimSpace(stderr.String())
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			exitCode := exitErr.ExitCode()
			switch exitCode {
			case 1:
				s.logger.Error("OCR Error", "error", "image path parameter required", "stderr", stderrStr)
				return "", fmt.Errorf("OCR failed: image path required (stderr: %s)", stderrStr)
			case 2:
				s.logger.Error("OCR Error", "error", "image file not found inside Python script", "stderr", stderrStr)
				return "", fmt.Errorf("OCR failed: image file not found (stderr: %s)", stderrStr)
			case 3:
				// Exit code 3 represents OCR failed (e.g. corrupt image)
				s.logger.Error("OCR Error", "error", "image corrupt or OCR failed", "stderr", stderrStr)
				return "", fmt.Errorf("OCR failed: image corrupt or OCR failed (stderr: %s)", stderrStr)
			case 4:
				// Exit code 4 represents dependency not installed
				s.logger.Error("OCR Error", "error", "dependencies not installed", "stderr", stderrStr)
				return "", fmt.Errorf("OCR failed: dependencies not installed. Please run pip install paddlepaddle paddleocr (stderr: %s)", stderrStr)
			case 5:
				s.logger.Error("OCR Error", "error", "parsing OCR output failed", "stderr", stderrStr)
				return "", fmt.Errorf("OCR failed: parsing output failed (stderr: %s)", stderrStr)
			default:
				s.logger.Error("OCR Error", "error", fmt.Sprintf("failed with exit code %d", exitCode), "stderr", stderrStr)
				return "", fmt.Errorf("OCR failed with exit code %d (stderr: %s)", exitCode, stderrStr)
			}
		}

		s.logger.Error("OCR Error", "error", err.Error(), "stderr", stderrStr)
		return "", fmt.Errorf("failed to execute PaddleOCR: %w (stderr: %s)", err, stderrStr)
	}

	result := stdout.String()
	
	s.logger.Info("OCR Finished", "textLength", len(result))
	s.logger.Info("Execution Time", "duration", duration.String())

	return result, nil
}

// Ping checks if the Python interpreter and the helper script are reachable
func (s *OCRService) Ping(ctx context.Context) error {
	if s.pythonPath == "" {
		return errors.New("PYTHON_PATH is not configured")
	}
	if s.paddleOcrPath == "" {
		return errors.New("PADDLEOCR_PATH is not configured")
	}
	if _, err := os.Stat(s.paddleOcrPath); os.IsNotExist(err) {
		return fmt.Errorf("paddleocr helper script not found at %s", s.paddleOcrPath)
	}

	cmd := exec.CommandContext(ctx, s.pythonPath, "--version")
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("python interpreter not reachable: %w", err)
	}

	return nil
}
