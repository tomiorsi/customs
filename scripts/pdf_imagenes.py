#!/usr/bin/env python3
"""
Escaneo sin capa de texto: una imagen JPEG por página.
Zoom 2× (estándar PyMuPDF). Solo baja zoom si la API rechaza el tamaño (~10 MB).
"""
from __future__ import annotations

import base64
import json
import sys

import fitz

MAX_BYTES = 9_500_000
ZOOM = 1.75
JPEG_QUALITY = 78


def _jpeg_pagina(page: fitz.Page) -> tuple[str, str]:
    zoom = ZOOM
    pix = None
    while zoom >= 0.5:
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        jpeg = pix.tobytes("jpeg", jpg_quality=JPEG_QUALITY)
        if len(jpeg) <= MAX_BYTES:
            return base64.b64encode(jpeg).decode("ascii"), "image/jpeg"
        zoom *= 0.75
    assert pix is not None
    jpeg = pix.tobytes("jpeg", jpg_quality=max(65, JPEG_QUALITY - 10))
    return base64.b64encode(jpeg).decode("ascii"), "image/jpeg"


def imagenes(path: str) -> dict:
    doc = fitz.open(path)
    paginas = []
    for i, page in enumerate(doc):
        b64, media = _jpeg_pagina(page)
        paginas.append({"n": i + 1, "base64": b64, "media_type": media})
    doc.close()
    return {"paginas": paginas}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: pdf_imagenes.py <path>"}), file=sys.stderr)
        sys.exit(1)
    print(json.dumps(imagenes(sys.argv[1]), ensure_ascii=False))
