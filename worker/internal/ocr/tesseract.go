package ocr

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"invoicego/worker/internal/model"
	"log/slog"
	"os/exec"
	"strconv"
	"strings"
)

// TesseractProvider mengimplementasikan interface Provider menggunakan Tesseract CLI
type TesseractProvider struct {
	binaryPath string
	logger     *slog.Logger
}

// NewTesseractProvider membuat instance baru TesseractProvider
func NewTesseractProvider(binaryPath string, logger *slog.Logger) *TesseractProvider {
	return &TesseractProvider{
		binaryPath: binaryPath,
		logger:     logger,
	}
}

// ExtractText mengekstrak teks mentah dan confidence score dari berkas gambar
func (p *TesseractProvider) ExtractText(ctx context.Context, imagePath string) (*model.OCRResult, error) {
	p.logger.Info("Memulai pemrosesan Tesseract OCR", "imagePath", imagePath, "binaryPath", p.binaryPath)

	// Pastikan context belum dibatalkan
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	// Jalankan Tesseract CLI dengan format output TSV ke stdout
	// Command: tesseract <imagePath> stdout tsv
	cmd := exec.CommandContext(ctx, p.binaryPath, imagePath, "stdout", "tsv")

	outputBytes, err := cmd.Output()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			p.logger.Error("Tesseract CLI mengembalikan error",
				"exitCode", exitErr.ExitCode(),
				"stderr", string(exitErr.Stderr),
				"error", err.Error(),
			)
			return nil, fmt.Errorf("tesseract process failed: %w (stderr: %s)", err, strings.TrimSpace(string(exitErr.Stderr)))
		}
		p.logger.Error("Gagal menjalankan perintah tesseract", "error", err.Error())
		return nil, fmt.Errorf("failed to execute tesseract command: %w", err)
	}

	// Parse TSV untuk mendapatkan rekonstruksi teks dan rata-rata confidence score
	rawText, averageConf, err := p.parseTSV(string(outputBytes))
	if err != nil {
		p.logger.Error("Gagal memparsing output TSV dari Tesseract", "error", err.Error())
		return nil, fmt.Errorf("failed to parse OCR TSV output: %w", err)
	}

	p.logger.Info("Tesseract OCR selesai dilakukan",
		"textLength", len(rawText),
		"confidence", fmt.Sprintf("%.2f%%", averageConf),
	)

	return &model.OCRResult{
		Text:       rawText,
		Confidence: averageConf,
	}, nil
}

// parseTSV membaca data TSV keluaran Tesseract untuk merekonstruksi teks berformat
// dan menghitung rata-rata confidence score kata
func (p *TesseractProvider) parseTSV(tsvContent string) (string, float64, error) {
	scanner := bufio.NewScanner(strings.NewReader(tsvContent))
	
	var (
		totalConf   float64
		wordCount   int
		lines       []string
		currentLine []string
		lastLineNum = -1
	)

	// Flag untuk melewatkan baris header TSV
	isHeader := true

	for scanner.Scan() {
		line := scanner.Text()
		if isHeader {
			// Header baris pertama dimulai dengan kolom 'level'
			if strings.HasPrefix(line, "level") {
				isHeader = false
				continue
			}
		}

		parts := strings.Split(line, "\t")
		if len(parts) < 12 {
			continue // Baris tidak lengkap, lewati
		}

		// Indeks kolom dalam output TSV Tesseract:
		// 4: line_num
		// 10: conf (confidence score)
		// 11: text (teks kata)
		lineNumStr := parts[4]
		confStr := parts[10]
		wordText := parts[11]

		lineNum, err := strconv.Atoi(lineNumStr)
		if err != nil {
			continue
		}

		conf, err := strconv.ParseFloat(confStr, 64)
		if err != nil {
			continue
		}

		// Nilai conf == -1 menunjukkan block/paragraph/line metadata, bukan kata riil
		if conf != -1 {
			totalConf += conf
			wordCount++

			// Jika mendeteksi pergantian baris, gabungkan kata-kata baris sebelumnya
			if lastLineNum != -1 && lineNum != lastLineNum {
				if len(currentLine) > 0 {
					lines = append(lines, strings.Join(currentLine, " "))
					currentLine = nil
				}
			}

			trimmedText := strings.TrimSpace(wordText)
			if trimmedText != "" {
				currentLine = append(currentLine, trimmedText)
			}
			lastLineNum = lineNum
		}
	}

	// Tambahkan kata-kata dari baris terakhir
	if len(currentLine) > 0 {
		lines = append(lines, strings.Join(currentLine, " "))
	}

	reconstructedText := strings.Join(lines, "\n")

	averageConf := 0.0
	if wordCount > 0 {
		averageConf = totalConf / float64(wordCount)
	}

	return reconstructedText, averageConf, nil
}
