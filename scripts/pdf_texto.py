#!/usr/bin/env python3
"""Extrae texto embebido de un PDF. Sin render ni reglas por documento."""
from __future__ import annotations

import json
import sys

import fitz


def extraer_texto(path: str) -> dict:
    doc = fitz.open(path)
    partes = [page.get_text() for page in doc]
    n = doc.page_count
    doc.close()
    texto = "".join(partes).strip()
    return {"texto": texto, "paginas": n, "tiene_texto": bool(texto)}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: pdf_texto.py <path>"}), file=sys.stderr)
        sys.exit(1)
    print(json.dumps(extraer_texto(sys.argv[1]), ensure_ascii=False))
