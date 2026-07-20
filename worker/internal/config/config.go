package config

import (
	"bufio"
	"os"
	"strings"
)

type Config struct {
	Port               string
	Env                string
	AiServiceApiKey    string
	AiModelName        string
	BackendCallbackUrl string
	OcrEngine          string
	TesseractPath      string
	PythonPath         string
	PaddleOcrPath      string
	TempDownloadDir    string
	NvidiaApiKey       string
	NvidiaBaseUrl      string
	NvidiaModel        string
	BackendApiUrl      string
}

func LoadConfig() (*Config, error) {
	// Muat berkas .env jika ada
	_ = loadEnvFile(".env")

	return &Config{
		Port:               getEnv("PORT", "8080"),
		Env:                getEnv("ENV", "development"),
		AiServiceApiKey:    getEnv("AI_SERVICE_API_KEY", ""),
		AiModelName:        getEnv("AI_MODEL_NAME", "gemini-1.5-flash"),
		BackendCallbackUrl: getEnv("BACKEND_CALLBACK_URL", "http://localhost:3000/api/v1/receipts/callback"),
		OcrEngine:          getEnv("OCR_ENGINE", "tesseract"),
		TesseractPath:      getEnv("TESSERACT_PATH", "tesseract"),
		PythonPath:         getEnv("PYTHON_PATH", "python"),
		PaddleOcrPath:      getEnv("PADDLEOCR_PATH", ""),
		TempDownloadDir:    getEnv("TEMP_DOWNLOAD_DIR", "temp/downloads"),
		NvidiaApiKey:       getEnv("NVIDIA_API_KEY", ""),
		NvidiaBaseUrl:      getEnv("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"),
		NvidiaModel:        getEnv("NVIDIA_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"),
		BackendApiUrl:      getEnv("BACKEND_API_URL", "http://localhost:3000"),
	}, nil
}

func getEnv(key, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok {
		return val
	}
	return defaultVal
}

func loadEnvFile(filename string) error {
	file, err := os.Open(filename)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		line = strings.TrimSpace(line)
		if len(line) == 0 || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		// Hapus tanda kutip jika ada
		val = strings.Trim(val, `"'`)
		_ = os.Setenv(key, val)
	}
	return scanner.Err()
}
