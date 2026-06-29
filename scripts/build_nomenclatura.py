#!/usr/bin/env python3
"""
Construye la base de Nomenclatura (NCM/SIM) en español, limpia y lista para usar.

Toma las fuentes oficiales que hoy viven en data/Nomenclatura/:
  - arancel.zip            -> nomenclador / capitulo / sufijos (ARCA, español)
  - reglas_generales_interpretacion.txt (RGI, español)

Genera 3 parquets:
  - ncm.parquet      árbol completo de la nomenclatura + aranceles
  - notas.parquet    notas legales de sección/capítulo + Reglas Generales (RGI)
  - sufijos.parquet  sufijos de valor SIM por partida

Post-build recomendado si quedan tokens con '?':
    python3 scripts/fix_acentos_parquet.py

Uso:
    python3 scripts/build_nomenclatura.py
"""
from __future__ import annotations

import re
from pathlib import Path
from zipfile import ZipFile

import pandas as pd

from nomenclatura_texto import fix_accents, normalizar

BASE = Path(__file__).resolve().parent.parent / "data" / "Nomenclatura"
ZIP = BASE / "arancel.zip"
RGI_TXT = BASE / "reglas_generales_interpretacion.txt"

# Capítulos que abren sección: el regex de título captura texto de la nota de sección.
TITULOS_CAPITULO_SECCION: dict[str, str] = {
    "50": "SEDA",
    "72": "FUNDICIÓN, HIERRO Y ACERO",
    "86": (
        "VEHÍCULOS Y MATERIAL PARA VÍAS FÉRREAS O SIMILARES, Y SUS PARTES; "
        "APARATOS MECÁNICOS (INCLUSO ELECTROMECÁNICOS) DE SEÑALIZACIÓN PARA "
        "VÍAS DE COMUNICACIÓN"
    ),
}


def to_float(s: str):
    s = (s or "").strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def nivel_de(digitos: str) -> str:
    n = len(digitos)
    if n <= 2:
        return "capitulo"
    if n == 4:
        return "partida"
    if n in (5, 6, 7):
        return "subpartida"
    if n == 8:
        return "ncm"
    return "sim"


def _archivo_en_zip(z: ZipFile, prefijo: str) -> str:
    """Último .txt del zip que empieza con prefijo (p. ej. nomenclador_)."""
    candidatos = [
        n for n in z.namelist()
        if n.startswith(prefijo) and n.lower().endswith(".txt")
    ]
    if not candidatos:
        raise FileNotFoundError(f"No hay {prefijo}*.txt en {ZIP}")
    return sorted(candidatos)[-1]


# ---------------------------------------------------------------------------
# Lectura de fuentes
# ---------------------------------------------------------------------------
def leer_fuentes():
    with ZipFile(ZIP) as z:
        nom_name = _archivo_en_zip(z, "nomenclador_")
        cap_name = _archivo_en_zip(z, "capitulo_")
        suf_name = _archivo_en_zip(z, "sufijos_")
        print(f"  zip: {nom_name}, {cap_name}, {suf_name}")
        nom = z.read(nom_name).decode("latin1").splitlines()
        cap = z.read(cap_name).decode("latin1").splitlines()
        suf = z.read(suf_name).decode("latin1").splitlines()
    rgi = RGI_TXT.read_text(encoding="utf-8")
    return nom, cap, suf, rgi


# ---------------------------------------------------------------------------
# Parseo de capítulos (títulos + notas legales)
# ---------------------------------------------------------------------------
SEC_RE = re.compile(r"SECCI[OÓ]N\s+([IVXLC]+)\s+([A-ZÁÉÍÓÚÑ].+?)\s+Notas?\b")


def _titulo_capitulo(texto: str, num: int) -> str | None:
    pat = re.compile(rf"CAP\w*ULO\s+0*{num}\s+([A-ZÁÉÍÓÚÑ][^.]*?)\s+Notas?\b")
    m = pat.search(texto)
    if m:
        return " ".join(m.group(1).split())
    m = re.search(
        rf"CAP\w*ULO\s+0*{num}\s+([A-ZÁÉÍÓÚÑ].+?)(?:\s+\d+\s*[\.\)]|$)",
        texto,
    )
    return " ".join(m.group(1).split()) if m else None


def parse_capitulos(cap_lines):
    """Devuelve (titulos_por_capitulo, filas_notas)."""
    titulos: dict[str, str] = {}
    notas = []
    secciones_vistas: set[str] = set()
    for line in cap_lines:
        p = line.split("@")
        if len(p) < 3:
            continue
        num = p[1].strip().zfill(2)
        texto = fix_accents(p[2])
        if not texto:
            continue
        tit = TITULOS_CAPITULO_SECCION.get(num) or _titulo_capitulo(texto, int(num))
        if tit:
            titulos[num] = tit
        ms = SEC_RE.search(texto)
        if ms and ms.group(1) not in secciones_vistas:
            secciones_vistas.add(ms.group(1))
            notas.append({
                "tipo": "nota_seccion",
                "referencia": f"Sección {ms.group(1)}",
                "titulo": " ".join(ms.group(2).split()),
                "texto": texto,
            })
        notas.append({
            "tipo": "nota_capitulo",
            "referencia": f"Capítulo {int(num)}",
            "titulo": titulos.get(num, ""),
            "texto": texto,
        })
    return titulos, notas


# ---------------------------------------------------------------------------
# Parseo del nomenclador (árbol + aranceles) y armado de rutas
# ---------------------------------------------------------------------------
def parse_nomenclador(nom_lines, titulos_cap):
    registros = []
    desc_por_digitos: dict[str, str] = {}

    for num, titulo in sorted(titulos_cap.items()):
        digit = num
        registros.append({
            "codigo": num,
            "codigo_num": digit,
            "nivel": "capitulo",
            "nivel_digitos": 2,
            "descripcion": titulo,
            "ar1": None, "ar2": None, "ar3": None, "ar4": None, "ar5": None,
            "unidad": None, "marca": None,
        })
        desc_por_digitos[digit] = titulo

    for line in nom_lines:
        p = line.split("@")
        if len(p) < 11:
            continue
        codigo = p[1].strip()
        if not codigo:
            continue
        digitos = re.sub(r"\D", "", codigo)
        if not digitos:
            continue
        desc = fix_accents(p[10])
        reg = {
            "codigo": codigo,
            "codigo_num": digitos,
            "nivel": nivel_de(digitos),
            "nivel_digitos": len(digitos),
            "descripcion": desc,
            "ar1": to_float(p[2]), "ar2": to_float(p[3]), "ar3": to_float(p[4]),
            "ar4": to_float(p[5]), "ar5": to_float(p[6]),
            "unidad": (p[8].strip() or None),
            "marca": (p[9].strip() or None),
        }
        registros.append(reg)
        desc_por_digitos.setdefault(digitos, desc)

    claves = set(desc_por_digitos)
    for reg in registros:
        d = reg["codigo_num"]
        cadena = []
        for L in range(2, len(d)):
            anc = d[:L]
            if anc in claves and desc_por_digitos[anc]:
                cadena.append(desc_por_digitos[anc].lstrip("-").strip())
        propia = (reg["descripcion"] or "").lstrip("-").strip()
        if propia:
            cadena.append(propia)
        reg["ruta"] = " > ".join(cadena)
        reg["descripcion_busqueda"] = normalizar(reg["ruta"])
    return registros


# ---------------------------------------------------------------------------
# Parseo de sufijos
# ---------------------------------------------------------------------------
def parse_sufijos(suf_lines):
    filas = []
    for line in suf_lines:
        p = line.split("@")
        if len(p) < 5:
            continue
        desc = fix_accents(p[4])
        filas.append({
            "partida": p[1].strip(),
            "sufijo": p[2].strip(),
            "tipo": p[3].strip(),
            "descripcion": desc,
            "descripcion_busqueda": normalizar(desc),
        })
    return filas


# ---------------------------------------------------------------------------
# Parseo de RGI
# ---------------------------------------------------------------------------
def parse_rgi(rgi_text):
    lineas = rgi_text.splitlines()
    cuerpo = []
    for ln in lineas:
        s = ln.strip()
        if not s:
            continue
        if s.startswith(("Fuente:", "URL:", "Descargado", "___")):
            continue
        if set(s) <= {"="}:
            continue
        if re.fullmatch(
            r"REGLAS GENERALES PARA LA INTERPRETACION DE LA NOMENCLATURA.*", s
        ):
            continue
        cuerpo.append(s)
    texto = re.sub(r"\s+", " ", " ".join(cuerpo)).strip()

    filas = []
    partes = re.split(
        r"(REGLAS GENERALES COMPLEMENTARIAS[^.]*?)(?=\s+[1-9]\.)",
        texto,
        maxsplit=1,
    )
    sa = partes[0].strip()
    sa = re.sub(
        r"^REGLAS GENERALES PARA LA INTERPRETACION DEL SISTEMA ARMONIZADO\s*",
        "",
        sa,
        flags=re.IGNORECASE,
    ).strip()
    if sa:
        filas.append({
            "tipo": "rgi",
            "referencia": "RGI - Sistema Armonizado",
            "titulo": "Reglas Generales para la Interpretación del Sistema Armonizado",
            "texto": sa,
        })
    if len(partes) >= 3:
        comp = (partes[1] + " " + partes[2]).strip()
        filas.append({
            "tipo": "rgi",
            "referencia": "RGC - Complementarias",
            "titulo": "Reglas Generales Complementarias",
            "texto": comp,
        })

    if not filas:
        filas.append({
            "tipo": "rgi", "referencia": "RGI",
            "titulo": "Reglas Generales de Interpretación",
            "texto": texto,
        })
    return filas


def _filas_con_interrogacion(df: pd.DataFrame, columnas: list[str]) -> int:
    n = 0
    for col in columnas:
        if col not in df.columns:
            continue
        n += int(df[col].fillna("").astype(str).str.contains(r"\?", regex=True).sum())
    return n


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    nom, cap, suf, rgi = leer_fuentes()

    titulos_cap, notas_cap = parse_capitulos(cap)
    registros = parse_nomenclador(nom, titulos_cap)
    sufijos = parse_sufijos(suf)
    rgi_filas = parse_rgi(rgi)

    df_ncm = pd.DataFrame(registros, columns=[
        "codigo", "codigo_num", "nivel", "nivel_digitos",
        "descripcion", "descripcion_busqueda", "ruta",
        "ar1", "ar2", "ar3", "ar4", "ar5", "unidad", "marca",
    ])
    df_ncm = df_ncm[df_ncm["descripcion"].fillna("").str.strip() != ""]
    df_ncm = df_ncm.sort_values("codigo_num").reset_index(drop=True)

    df_notas = pd.DataFrame(notas_cap + rgi_filas,
                            columns=["tipo", "referencia", "titulo", "texto"])

    df_suf = pd.DataFrame(sufijos, columns=[
        "partida", "sufijo", "tipo", "descripcion", "descripcion_busqueda",
    ]).reset_index(drop=True)

    out_ncm = BASE / "ncm.parquet"
    out_notas = BASE / "notas.parquet"
    out_suf = BASE / "sufijos.parquet"
    df_ncm.to_parquet(out_ncm, compression="snappy", index=False)
    df_notas.to_parquet(out_notas, compression="snappy", index=False)
    df_suf.to_parquet(out_suf, compression="snappy", index=False)

    q_ncm = _filas_con_interrogacion(df_ncm, ["descripcion", "ruta"])
    q_suf = _filas_con_interrogacion(df_suf, ["descripcion"])
    q_notas = _filas_con_interrogacion(df_notas, ["titulo", "texto"])
    q_total = q_ncm + q_suf + q_notas

    print("OK - parquets generados en", BASE)
    print(f"  ncm.parquet      filas={len(df_ncm):>6}")
    print(f"  notas.parquet    filas={len(df_notas):>6}")
    print(f"  sufijos.parquet  filas={len(df_suf):>6}")
    if q_total:
        print(
            f"  aviso: {q_total} celdas con '?' sin corregir "
            "(CORR solo cubre tokens frecuentes)."
        )
        print("         Siguiente paso: python3 scripts/fix_acentos_parquet.py")


if __name__ == "__main__":
    main()
