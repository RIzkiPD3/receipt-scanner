import os
import sys

# Framework workarounds for CPU execution issues in PaddlePaddle 3.x
os.environ["PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT"] = "0"
os.environ["FLAGS_enable_pir_api"] = "0"
os.environ["DISABLE_AUTO_LOGGING_CONFIG"] = "1"
os.environ["GLOG_minloglevel"] = "3"

import logging
logging.getLogger("ppocr").setLevel(logging.ERROR)
logging.getLogger("root").setLevel(logging.ERROR)

try:
    from paddleocr import PaddleOCR, logger
    logger.setLevel(logging.ERROR)
except ImportError:
    print("ERROR: paddleocr or paddlepaddle is not installed in this Python environment.", file=sys.stderr)
    sys.exit(4)

def main():
    # Force stdout to use UTF-8 encoding on Windows to prevent UnicodeEncodeError
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        
    if len(sys.argv) < 2:
        print("ERROR: image path is required as a command-line argument.", file=sys.stderr)
        sys.exit(1)

    image_path = sys.argv[1]
    if not os.path.exists(image_path):
        print(f"ERROR: image file not found: {image_path}", file=sys.stderr)
        sys.exit(2)

    try:
        # Initialize PaddleOCR with English language and textline orientation enabled
        ocr = PaddleOCR(use_textline_orientation=True, lang='en')
        result = ocr.predict(image_path)
    except Exception as e:
        print(f"ERROR: OCR execution failed: {str(e)}", file=sys.stderr)
        sys.exit(3)

    if not result:
        # No result found, exit gracefully
        sys.exit(0)

    # PaddleOCR 3.x predict() returns a list of OCRResult objects.
    # We parse the first item to get the recognized text lines.
    try:
        item = result[0]
        if hasattr(item, 'json') and item.json and 'res' in item.json and 'rec_texts' in item.json['res']:
            for text in item.json['res']['rec_texts']:
                print(text)
        else:
            # Fallback if structure changes or it is a list of lists (classic paddleocr format)
            if isinstance(item, list):
                for line in item:
                    if line and len(line) > 1 and line[1]:
                        print(line[1][0])
    except Exception as e:
        print(f"ERROR: Parsing OCR output failed: {str(e)}", file=sys.stderr)
        sys.exit(5)

if __name__ == "__main__":
    main()
