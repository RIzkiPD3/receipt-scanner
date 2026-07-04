package ocrinterface

import "context"

// OCRProvider mendefinisikan kontrak interface untuk mengekstrak teks dari berkas gambar lokal
type OCRProvider interface {
	ExtractText(ctx context.Context, imagePath string) (string, error)
}
