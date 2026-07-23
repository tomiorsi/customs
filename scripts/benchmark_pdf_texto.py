#!/usr/bin/env python3
"""Benchmark secuencial de extracción PDF en data/a fijarse/."""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import fitz

from pdf_texto import MIN_CHARS_PAGINA, extraer_texto, pagina_necesita_ocr

RAIZ = Path(__file__).resolve().parent.parent
CARPETA = RAIZ / "data" / "a fijarse"
MIN_CHARS_PAGINA_CUBIERTA = 40


def evaluar(path: Path, result: dict) -> tuple[bool, str]:
    if result.get("ocr_fallo"):
        return False, "ocr_fallo"

    if not result.get("tiene_texto"):
        return False, "sin_texto"

    texto = str(result.get("texto") or "")
    paginas = int(result.get("paginas") or 1)
    paginas_ocr = set(result.get("paginas_ocr") or [])

    doc = fitz.open(str(path))
    for i, page in enumerate(doc):
        n = i + 1
        nativo = (page.get_text() or "").strip()
        if pagina_necesita_ocr(page):
            if n not in paginas_ocr and len(nativo) < MIN_CHARS_PAGINA:
                doc.close()
                return False, f"pag_{n}_sin_ocr"
        elif len(nativo) < MIN_CHARS_PAGINA_CUBIERTA and len(page.get_images(full=True)) == 0:
            # página casi vacía sin imágenes (ej. "292")
            pass
    doc.close()

    por_pag = len(texto) / max(1, paginas)
    if por_pag < 30:
        return False, f"poco_texto_por_pagina({por_pag:.0f})"

    return True, "ok"


def main() -> int:
    pdfs = sorted(CARPETA.glob("*/*.pdf"))
    if not pdfs:
        print("No hay PDFs en data/a fijarse/", file=sys.stderr)
        return 1

    resultados = []
    t_total = time.time()
    ok_n = 0

    print(f"Benchmark secuencial — {len(pdfs)} PDFs en {CARPETA}\n")

    for path in pdfs:
        rel = path.relative_to(CARPETA)
        t0 = time.time()
        try:
            out = extraer_texto(str(path))
            elapsed = time.time() - t0
            ok, motivo = evaluar(path, out)
            if ok:
                ok_n += 1
            resultados.append(
                {
                    "archivo": str(rel),
                    "ok": ok,
                    "motivo": motivo,
                    "segundos": round(elapsed, 1),
                    "chars": len(out.get("texto") or ""),
                    "paginas": out.get("paginas"),
                    "ocr": out.get("ocr_usado"),
                    "paginas_ocr": out.get("paginas_ocr"),
                }
            )
            estado = "OK" if ok else f"FALLO ({motivo})"
            print(
                f"  {rel}: {estado} | {elapsed:.1f}s | "
                f"{len(out.get('texto') or '')} chars | ocr={out.get('ocr_usado')}"
            )
        except Exception as exc:
            elapsed = time.time() - t0
            resultados.append(
                {
                    "archivo": str(rel),
                    "ok": False,
                    "motivo": str(exc),
                    "segundos": round(elapsed, 1),
                }
            )
            print(f"  {rel}: ERROR {exc} | {elapsed:.1f}s")

    total = time.time() - t_total
    print(f"\n{'='*60}")
    print(f"Total: {ok_n}/{len(pdfs)} OK ({round(100*ok_n/len(pdfs))}%)")
    print(f"Tiempo total secuencial: {total:.1f}s ({total/60:.1f} min)")
    print(f"Promedio por PDF: {total/len(pdfs):.1f}s")

    out_path = RAIZ / "scripts" / "fixtures" / "benchmark-pdf-texto.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(
            {"total_segundos": round(total, 1), "ok": ok_n, "total": len(pdfs), "items": resultados},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return 0 if ok_n == len(pdfs) else 1


if __name__ == "__main__":
    sys.exit(main())
