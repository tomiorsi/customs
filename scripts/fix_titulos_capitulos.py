#!/usr/bin/env python3
"""
Repara parquets viejos: títulos de capítulo 50, 72 y 86 mal extraídos.

`build_nomenclatura.py` ya aplica estos títulos al generar. Este script sirve
solo si tenés un ncm.parquet anterior sin rebuild.

Uso:
    python3 scripts/fix_titulos_capitulos.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_nomenclatura import TITULOS_CAPITULO_SECCION
from nomenclatura_texto import normalizar

BASE = Path(__file__).resolve().parent.parent / "data" / "Nomenclatura"

TITULOS_OK = TITULOS_CAPITULO_SECCION


def main():
    ncm = pd.read_parquet(BASE / "ncm.parquet")

    # 1) Corregir títulos de capítulo
    for cap, titulo in TITULOS_OK.items():
        mask = (ncm["nivel"] == "capitulo") & (ncm["codigo_num"] == cap)
        n = int(mask.sum())
        ncm.loc[mask, "descripcion"] = titulo
        print(f"capítulo {cap}: {n} fila(s) -> {titulo[:40]}...")

    # 2) Reconstruir ruta + descripcion_busqueda con los títulos corregidos
    desc = dict(zip(ncm["codigo_num"], ncm["descripcion"]))
    claves = set(desc)

    rutas, busquedas = [], []
    for d, propia in zip(ncm["codigo_num"], ncm["descripcion"]):
        cadena = []
        for L in range(2, len(d)):
            anc = d[:L]
            if anc in claves and desc[anc]:
                cadena.append(str(desc[anc]).lstrip("-").strip())
        p = (propia or "").lstrip("-").strip()
        if p:
            cadena.append(p)
        ruta = " > ".join(cadena)
        rutas.append(ruta)
        busquedas.append(normalizar(ruta))
    ncm["ruta"] = rutas
    ncm["descripcion_busqueda"] = busquedas

    ncm.to_parquet(BASE / "ncm.parquet", compression="snappy", index=False)

    # 3) notas.parquet: corregir 'titulo' de esos capítulos
    notas = pd.read_parquet(BASE / "notas.parquet")
    for cap, titulo in TITULOS_OK.items():
        ref = f"Capítulo {int(cap)}"
        m = (notas["tipo"] == "nota_capitulo") & (notas["referencia"] == ref)
        notas.loc[m, "titulo"] = titulo
    notas.to_parquet(BASE / "notas.parquet", compression="snappy", index=False)

    # Verificación
    caps = ncm[ncm.nivel == "capitulo"]
    malos = caps[caps.descripcion.str.startswith("(")]
    print("\nCapítulos que aún empiezan con '(':", len(malos))
    for c in ("50", "72", "86"):
        ej = ncm[(ncm.nivel == "capitulo") & (ncm.codigo_num == c)].iloc[0]
        print(f"  cap {c}: {ej.descripcion[:50]}")
    # muestra de ruta reconstruida bajo cap 72
    r = ncm[ncm.codigo_num.str.startswith("7308")].head(1)
    if len(r):
        print("\nruta ejemplo (7308):", r.iloc[0]["ruta"][:90])
    print("OK")


if __name__ == "__main__":
    main()
