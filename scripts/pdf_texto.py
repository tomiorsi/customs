#!/usr/bin/env python3
"""
Extrae texto de un PDF: capa embebida (PyMuPDF) y OCR local en páginas solo-imagen.

Criterio general por página:
  - Texto embebido suficiente (≥ MIN_CHARS) → usar embebido.
  - Poco o ningún texto + imágenes → OCR local (render 2× + imagen embebida mayor).
  - Rotación: probar 0/90/180/270 y quedarse con la transcripción más rica.

Sin cloud. Opt-out OCR: PDF_TEXTO_SIN_OCR=1
"""
from __future__ import annotations

import json
import os
import sys
from io import BytesIO
from typing import Any

from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import fitz

from pdf_lock import candado_pdf

RAIZ = Path(__file__).resolve().parent.parent


def _model_dir() -> Path:
    env = os.environ.get("EASYOCR_MODEL_DIR", "").strip()
    if env:
        return Path(env)
    return RAIZ / "data" / "easyocr-models"

MIN_CHARS_PAGINA = 80
OCR_ALNUM_STOP = 400
OCR_ALNUM_MIN = 120
RENDER_SCALE = 1.75
EMBED_SCALE_MIN = 1.5

_reader: Any = None


def _ocr_habilitado() -> bool:
    v = os.environ.get("PDF_TEXTO_SIN_OCR", "").strip().lower()
    return v not in ("1", "true", "yes")


def _get_reader() -> Any:
    global _reader
    if _reader is None:
        import easyocr

        _reader = easyocr.Reader(
            ["en"],
            gpu=False,
            verbose=False,
            model_storage_directory=str(_model_dir()),
        )
    return _reader


def pagina_necesita_ocr(page: fitz.Page) -> bool:
    texto = (page.get_text() or "").strip()
    if len(texto) >= MIN_CHARS_PAGINA:
        return False
    return len(page.get_images(full=True)) > 0


def _ocr_array(arr: Any) -> str:
    reader = _get_reader()
    partes = reader.readtext(arr, detail=0, paragraph=True)
    return "\n".join(partes)


def _ocr_pixmap(page: fitz.Page, scale: float = RENDER_SCALE) -> str:
    import numpy as np

    mejor, mejor_n = "", 0
    for rot in (0, 90, 180, 270):
        mat = fitz.Matrix(scale, scale).prerotate(rot)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(
            pix.height, pix.width, pix.n
        )
        if pix.n == 4:
            arr = arr[:, :, :3]
        texto = _ocr_array(arr)
        n = sum(c.isalnum() for c in texto)
        if n > mejor_n:
            mejor_n, mejor = n, texto
        if n > OCR_ALNUM_STOP:
            break
    return mejor


def _ocr_imagen_embebida(doc: fitz.Document, page: fitz.Page) -> str:
    from PIL import Image
    import numpy as np

    mejor_info: dict[str, Any] | None = None
    mejor_area = 0
    for img in page.get_images(full=True):
        info = doc.extract_image(img[0])
        area = int(info["width"]) * int(info["height"])
        if area > mejor_area:
            mejor_area = area
            mejor_info = info
    if not mejor_info:
        return ""

    img = Image.open(BytesIO(mejor_info["image"]))
    w, h = img.size
    if max(w, h) < 1500:
        img = img.resize(
            (int(w * EMBED_SCALE_MIN), int(h * EMBED_SCALE_MIN)), Image.LANCZOS
        )

    mejor, mejor_n = "", 0
    for rot in (0, 90, 180, 270):
        base = img.rotate(-rot, expand=True) if rot else img
        arr = np.array(base.convert("RGB"))
        texto = _ocr_array(arr)
        n = sum(c.isalnum() for c in texto)
        if n > mejor_n:
            mejor_n, mejor = n, texto
        if n > OCR_ALNUM_STOP:
            break
    return mejor


def _ocr_pagina(doc: fitz.Document, page: fitz.Page) -> str:
    """Un motor a la vez por página: render; embed solo si el render es pobre."""
    render = _ocr_pixmap(page)
    n_r = sum(c.isalnum() for c in render)
    if n_r >= OCR_ALNUM_MIN:
        return render.strip()
    embed = _ocr_imagen_embebida(doc, page)
    n_e = sum(c.isalnum() for c in embed)
    if n_e > n_r:
        return embed.strip()
    return render.strip()


def extraer_texto(path: str) -> dict[str, Any]:
    with candado_pdf():
        return _extraer_texto_sin_lock(path)


def _extraer_texto_sin_lock(path: str) -> dict[str, Any]:
    doc = fitz.open(path)
    partes: list[str] = []
    paginas_ocr: list[int] = []
    paginas_embebido: list[int] = []
    ocr_fallo = False

    for i, page in enumerate(doc):
        n = i + 1
        nativo = (page.get_text() or "").strip()

        if not pagina_necesita_ocr(page):
            if nativo:
                partes.append(nativo)
                paginas_embebido.append(n)
            continue

        if not _ocr_habilitado():
            if nativo:
                partes.append(nativo)
                paginas_embebido.append(n)
            else:
                ocr_fallo = True
            continue

        try:
            ocr = _ocr_pagina(doc, page)
        except Exception:
            ocr = ""
            ocr_fallo = True

        bloque = f"{nativo}\n\n{ocr}".strip() if nativo else ocr
        if bloque:
            partes.append(bloque)
            if ocr:
                paginas_ocr.append(n)
            elif nativo:
                paginas_embebido.append(n)
        elif nativo:
            partes.append(nativo)
            paginas_embebido.append(n)
        else:
            ocr_fallo = True

    total = doc.page_count
    doc.close()

    texto = "\n\n".join(partes).strip()
    return {
        "texto": texto,
        "paginas": total,
        "tiene_texto": bool(texto),
        "ocr_usado": len(paginas_ocr) > 0,
        "paginas_ocr": paginas_ocr,
        "paginas_embebido": paginas_embebido,
        "ocr_fallo": ocr_fallo,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: pdf_texto.py <path>"}), file=sys.stderr)
        sys.exit(1)
    print(json.dumps(extraer_texto(sys.argv[1]), ensure_ascii=False))
