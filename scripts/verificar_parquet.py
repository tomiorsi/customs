#!/usr/bin/env python3
"""Verifica línea por línea que los parquets reflejen las fuentes."""
from __future__ import annotations

import sys
from pathlib import Path
from zipfile import ZipFile

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_nomenclatura import _archivo_en_zip, to_float
from nomenclatura_texto import fix_accents

BASE = Path(__file__).resolve().parent.parent / "data" / "Nomenclatura"


def leer():
    with ZipFile(BASE / "arancel.zip") as z:
        nom = z.read(_archivo_en_zip(z, "nomenclador_")).decode("latin1").splitlines()
        cap = z.read(_archivo_en_zip(z, "capitulo_")).decode("latin1").splitlines()
        suf = z.read(_archivo_en_zip(z, "sufijos_")).decode("latin1").splitlines()
    return nom, cap, suf


def verificar_ncm(nom):
    print("=" * 60)
    print("NCM (nomenclador -> ncm.parquet)")
    par = pd.read_parquet(BASE / "ncm.parquet")
    par_nc = par[par["nivel"] != "capitulo"].copy()

    # Reconstruir desde fuente
    src = []
    for line in nom:
        p = line.split("@")
        if len(p) < 11:
            continue
        codigo = p[1].strip()
        if not codigo:
            continue
        desc = fix_accents(p[10])
        if not desc:
            continue
        src.append({
            "codigo": codigo,
            "descripcion": desc,
            "ar1": to_float(p[2]), "ar2": to_float(p[3]), "ar3": to_float(p[4]),
            "ar4": to_float(p[5]), "ar5": to_float(p[6]),
            "unidad": (p[8].strip() or None),
        })
    df_src = pd.DataFrame(src)
    print(f"  filas fuente (desc no vacía): {len(df_src)}")
    print(f"  filas parquet (no capítulo):  {len(par_nc)}")

    # Comparar por orden de código (ambos ordenados igual)
    a = df_src.sort_values(["codigo", "descripcion"]).reset_index(drop=True)
    b = par_nc.sort_values(["codigo", "descripcion"]).reset_index(drop=True)

    cols = ["codigo", "descripcion", "ar1", "ar2", "ar3", "ar4", "ar5", "unidad"]
    if len(a) != len(b):
        print("  ❌ DIFERENTE CANTIDAD DE FILAS")
    diffs = 0
    for c in cols:
        # comparar series alineadas
        sa = a[c].fillna("∅").astype(str).reset_index(drop=True)
        sb = b[c].fillna("∅").astype(str).reset_index(drop=True)
        n = min(len(sa), len(sb))
        d = (sa[:n] != sb[:n]).sum()
        flag = "✅" if d == 0 else "❌"
        print(f"    {flag} columna {c:12} diffs={d}")
        if d and diffs < 1:
            idx = (sa[:n] != sb[:n])
            ej = pd.DataFrame({"src": sa[:n][idx], "par": sb[:n][idx]}).head(5)
            print(ej.to_string())
        diffs += d
    return diffs


def verificar_sufijos(suf):
    print("=" * 60)
    print("SUFIJOS (sufijos.txt -> sufijos.parquet)")
    par = pd.read_parquet(BASE / "sufijos.parquet")
    src = []
    for line in suf:
        p = line.split("@")
        if len(p) < 5:
            continue
        src.append({
            "partida": p[1].strip(),
            "sufijo": p[2].strip(),
            "tipo": p[3].strip(),
            "descripcion": fix_accents(p[4]),
        })
    df_src = pd.DataFrame(src)
    print(f"  filas fuente (>=5 campos): {len(df_src)}")
    print(f"  filas parquet:             {len(par)}")
    a = df_src.sort_values(["partida", "sufijo", "descripcion"]).reset_index(drop=True)
    b = par.sort_values(["partida", "sufijo", "descripcion"]).reset_index(drop=True)
    diffs = 0
    for c in ["partida", "sufijo", "tipo", "descripcion"]:
        sa = a[c].fillna("∅").astype(str).reset_index(drop=True)
        sb = b[c].fillna("∅").astype(str).reset_index(drop=True)
        n = min(len(sa), len(sb))
        d = (sa[:n] != sb[:n]).sum()
        print(f"    {'✅' if d==0 else '❌'} columna {c:12} diffs={d}")
        diffs += d
    return diffs


def verificar_capitulos(cap):
    print("=" * 60)
    print("NOTAS (capitulo.txt -> notas.parquet)")
    par = pd.read_parquet(BASE / "notas.parquet")
    cap_notas = par[par["tipo"] == "nota_capitulo"]
    src_caps = [p.split("@")[1].strip().zfill(2)
                for p in cap if len(p.split("@")) >= 3 and fix_accents(p.split("@")[2])]
    print(f"  capítulos con texto en fuente: {len(src_caps)}")
    print(f"  notas de capítulo en parquet:  {len(cap_notas)}")
    # ¿algún texto de capítulo perdido? comparamos por número
    refs = set(cap_notas["referencia"])
    faltan = [c for c in src_caps if f"Capítulo {int(c)}" not in refs]
    print(f"    {'✅' if not faltan else '❌'} capítulos faltantes: {faltan}")
    return len(faltan)


def main():
    nom, cap, suf = leer()
    total = 0
    total += verificar_ncm(nom)
    total += verificar_sufijos(suf)
    total += verificar_capitulos(cap)
    print("=" * 60)
    print("RESULTADO:", "✅ TODO OK" if total == 0 else f"❌ {total} diferencias")


if __name__ == "__main__":
    main()
