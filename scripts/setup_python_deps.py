#!/usr/bin/env python3
"""Instala modelos OCR en el proyecto (data/easyocr-models). Idempotente."""
from __future__ import annotations

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MODEL_DIR = RAIZ / "data" / "easyocr-models"
MARKER = RAIZ / "data" / ".ocr-models-ready"


def main() -> int:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if MARKER.is_file():
        return 0
    try:
        import easyocr

        easyocr.Reader(
            ["en"],
            gpu=False,
            verbose=False,
            model_storage_directory=str(MODEL_DIR),
        )
    except Exception as exc:
        print(f"[setup_python_deps] OCR no disponible aún: {exc}", file=sys.stderr)
        return 1
    MARKER.write_text("ok\n", encoding="utf-8")
    print(f"[setup_python_deps] Modelos OCR en {MODEL_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
