#!/usr/bin/env python3
"""
Limpia y normaliza los parquets crudos de data/VUCE/ y genera tablas
listas para la app en data/VUCE/clean/.

Lee:
  data/VUCE/intervenciones.parquet
  data/VUCE/tramites.parquet
  data/VUCE/tributacion.parquet
  data/VUCE/antidumping_vigentes.parquet
  data/VUCE/cnce_medidas.parquet
  data/VUCE/posicion_detalle.parquet

Escribe en data/VUCE/clean/:
  intervenciones.parquet      intervenciones previas + regímenes por posición
  tramites.parquet            trámites TAD por posición
  tributacion.parquet         tributos (formato largo) por posición
  tributacion_wide.parquet    tributos pivotados (un row por posición)
  antidumping.parquet         medidas antidumping vigentes (encoding corregido)
  cnce_medidas.parquet        medidas CNCE por posición (aplanado)
  posicion_detalle.parquet    aranceles/LA por posición (sin raw_json)

Uso:
    python3 scripts/clean_vuce_data.py
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "VUCE"
OUT = SRC / "clean"

ESTADO_MERC = {
    "1": "Nueva",
    "2": "Usada",
    "3": "Todos",  # aplica a cualquier estado (no figura en el dropdown de filtros)
    "4": "Residuos",
    "5": "Alimentos",
    "6": "Otros",
}
# Enum tal como aparece DENTRO del registro de intervención (difiere del
# dropdown de filtros de la web). Para operación importación 1 y 3 son
# destinación definitiva, 2 temporal/suspensiva y 4 tránsito.
TIPO_DEST = {
    "1": "Definitiva",
    "2": "Suspensiva",
    "3": "Definitiva",
    "4": "Tránsito",
}
CLASE_INTERV = {
    "1": "intervencion_previa",
    "2": "regimen_opcional",
}


def fix_mojibake(text: Any) -> Any:
    """Corrige texto UTF-8 mal decodificado como latin1 (ej. 'neumÃ¡ticos')."""
    if not isinstance(text, str):
        return text
    if not any(c in text for c in ("Ã", "Â", " Â", "â€")):
        return text
    try:
        return text.encode("latin1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def strip_html(text: Any) -> Any:
    if not isinstance(text, str):
        return text
    t = re.sub(r"<[^>]+>", " ", text)
    t = unicodedata.normalize("NFKC", t)
    t = (
        t.replace("&aacute;", "á").replace("&eacute;", "é").replace("&iacute;", "í")
        .replace("&oacute;", "ó").replace("&uacute;", "ú").replace("&ntilde;", "ñ")
        .replace("&nbsp;", " ").replace("&deg;", "°").replace("&amp;", "&")
    )
    return " ".join(t.split())


def clean_str(text: Any) -> Any:
    if text is None:
        return None
    if not isinstance(text, str):
        return text
    return " ".join(text.split()).strip()


def to_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        f = float(str(v).replace(",", "."))
        return f
    except (ValueError, TypeError):
        return None


def map_code(v: Any, table: dict[str, str]) -> Any:
    if v is None:
        return None
    return table.get(str(v).strip(), str(v))


# ---------------------------------------------------------------------------
# Intervenciones
# ---------------------------------------------------------------------------
def clean_intervenciones() -> pd.DataFrame:
    df = pd.read_parquet(SRC / "intervenciones.parquet")
    rows: list[dict[str, Any]] = []
    for _, r in df.iterrows():
        try:
            raw = json.loads(r["raw_json"]) if r.get("raw_json") else {}
        except (json.JSONDecodeError, TypeError):
            raw = {}

        operacion = raw.get("operacion")
        # Solo importación (excluye exportación 'E' y tránsito 'A').
        if operacion not in (None, "I"):
            continue
        if str(raw.get("activa", r.get("activa") or "")) not in ("1", "True"):
            continue

        regimen = raw.get("regimen") or {}
        org = raw.get("organismo") or regimen.get("organismo_detalle") or {}

        # Trámites TAD asociados (consecuencias).
        tramites = []
        for c in raw.get("consecuencia") or []:
            tt = c.get("tramite_tad")
            if tt:
                tramites.append(
                    {
                        "nombre": clean_str(tt.get("nombre")),
                        "nro_trata": tt.get("nro_trata"),
                        "link": tt.get("link_tramite"),
                    }
                )

        rows.append(
            {
                "posicion": r["posicion"],
                "clase": map_code(r.get("tipo_intervencion"), CLASE_INTERV),
                "organismo": clean_str(org.get("nombre")) or clean_str(r.get("organismo")),
                "organismo_id": org.get("id") or r.get("organismo_id"),
                "regimen": clean_str(regimen.get("descripcion")) or clean_str(r.get("regimen")),
                "resumen": strip_html(regimen.get("resumen")) or strip_html(r.get("resumen")),
                "tipo_destinacion": map_code(r.get("tipo_destinacion"), TIPO_DEST),
                "estado_mercaderia": map_code(r.get("estado_mercaderia"), ESTADO_MERC),
                "opcional": bool(regimen.get("opcional")),
                "validada": str(raw.get("validada", r.get("validada") or "")) in ("1", "True"),
                "tramites": json.dumps(tramites, ensure_ascii=False) if tramites else None,
                "intervencion_id": r.get("intervencion_id"),
            }
        )
    out = pd.DataFrame(rows)
    out = out.drop_duplicates(subset=["posicion", "intervencion_id"]).reset_index(drop=True)
    return out


# ---------------------------------------------------------------------------
# Trámites
# ---------------------------------------------------------------------------
def clean_tramites() -> pd.DataFrame:
    df = pd.read_parquet(SRC / "tramites.parquet")
    out = pd.DataFrame(
        {
            "posicion": df["posicion"],
            "tramite_id": df["tramite_id"],
            "nro_trata": df["nro_trata"].map(clean_str),
            "nombre": df["nombre"].map(clean_str),
            "organismo": df["organismo"].map(clean_str),
            "descripcion": df["descripcion"].map(clean_str),
            "resumen": df["resumen"].map(strip_html),
            "link_tramite": df["link_tramite"],
            "plataforma": df["plataforma"].map(clean_str),
            "intervencion_id": df["intervencion_id"],
        }
    )
    out = out.drop_duplicates(subset=["posicion", "tramite_id"]).reset_index(drop=True)
    return out


# ---------------------------------------------------------------------------
# Tributación
# ---------------------------------------------------------------------------
def clean_tributacion() -> tuple[pd.DataFrame, pd.DataFrame]:
    df = pd.read_parquet(SRC / "tributacion.parquet")
    # posicion_query = código SIM consultado (84301000100C). Cada fila trae
    # posicion jerárquica (84, 84301000, …): el DIE aplicable suele estar en el
    # padre y el AEC en la hoja. Agrupamos por posicion_query para no perderlo.
    largo = pd.DataFrame(
        {
            "posicion": df["posicion_query"],
            "operacion": df["operacion"],
            "concepto": df["descripcion"].map(clean_str),
            "valor": df["valor"].map(to_float),
        }
    )
    largo = largo.dropna(subset=["concepto"]).drop_duplicates(
        subset=["posicion", "concepto"]
    )

    # Pivote de los conceptos principales (un row por posición SIM).
    principales = {
        "AEC": "aec",
        "DIE": "die",
        "DII": "dii",
        "TE": "tasa_estadistica",
        "IVA": "iva",
        "IVA AD": "iva_adicional",
        "Ganancias": "ganancias",
        "IIBB": "iibb",
    }
    sub = largo[largo["concepto"].isin(principales)].copy()
    sub["col"] = sub["concepto"].map(principales)
    wide = sub.pivot_table(
        index="posicion", columns="col", values="valor", aggfunc="first"
    ).reset_index()
    wide.columns.name = None
    return largo.reset_index(drop=True), wide


# ---------------------------------------------------------------------------
# Antidumping
# ---------------------------------------------------------------------------
def clean_antidumping() -> pd.DataFrame:
    df = pd.read_parquet(SRC / "antidumping_vigentes.parquet")
    for col in df.columns:
        if df[col].dtype == object:
            df[col] = df[col].map(fix_mojibake).map(clean_str)
    df = df.drop_duplicates().reset_index(drop=True)
    df["vencimiento"] = pd.to_datetime(
        df["vencimiento_medida"], format="%d/%m/%Y", errors="coerce"
    )
    return df


# ---------------------------------------------------------------------------
# CNCE medidas
# ---------------------------------------------------------------------------
def clean_cnce() -> pd.DataFrame:
    df = pd.read_parquet(SRC / "cnce_medidas.parquet")
    rows: list[dict[str, Any]] = []
    for _, r in df.iterrows():
        try:
            o = json.loads(r["raw_json"]) if r.get("raw_json") else {}
        except (json.JSONDecodeError, TypeError):
            o = {}
        exp = o.get("expediente") or {}
        pais = o.get("pais") or {}
        tipo = o.get("tipo_medida") or {}
        um = o.get("unidad_medida") or {}
        rows.append(
            {
                "posicion": r["posicion"],
                "producto": clean_str(exp.get("producto")),
                "pais": clean_str(pais.get("descripcion")),
                "tipo_medida": clean_str(tipo.get("descripcion")),
                "medida_aplicada": to_float(o.get("medida_aplicada")),
                "unidad": clean_str(um.get("abreviatura")),
                "vencimiento": o.get("vencimiento_medida"),
                "suspendida": bool(o.get("posee_excepciones"))
                and "suspend" in strip_html(o.get("titulo_excepciones") or "").lower(),
                "expediente": clean_str(exp.get("desc_expediente")),
            }
        )
    out = pd.DataFrame(rows).drop_duplicates(
        subset=["posicion", "expediente", "pais"]
    ).reset_index(drop=True)
    if "vencimiento" in out:
        out["vencimiento"] = pd.to_datetime(out["vencimiento"], errors="coerce")
    return out


# ---------------------------------------------------------------------------
# Detalle de posición
# ---------------------------------------------------------------------------
def clean_posicion_detalle() -> pd.DataFrame:
    df = pd.read_parquet(SRC / "posicion_detalle.parquet")
    rows: list[dict[str, Any]] = []
    for _, r in df.iterrows():
        try:
            raw = json.loads(r["raw_json"]) if r.get("raw_json") else {}
        except (json.JSONDecodeError, TypeError):
            raw = {}
        rows.append(
            {
                "posicion": r["posicion"],
                "posicion_fmt": r.get("posicion_fmt"),
                "descripcion": clean_str(r.get("descripcion")),
                "unidad": r.get("unidad"),
                "aec": to_float(r.get("aec")),
                "die": to_float(r.get("die")),
                "dii": to_float(r.get("dii")),
                "reintegro_extrazona": to_float(raw.get("reintegros_extrazona")),
                "reintegro_intrazona": to_float(raw.get("reintegros_intrazona")),
                "bk": raw.get("bk"),
                "bit": raw.get("bit"),
                "la": r.get("la"),
                "dumping_flag": r.get("dumping_flag"),
                "actualizado": r.get("actualizado"),
            }
        )
    return pd.DataFrame(rows).drop_duplicates(subset=["posicion"]).reset_index(drop=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    print("== Limpieza VUCE ==")

    interv = clean_intervenciones()
    interv.to_parquet(OUT / "intervenciones.parquet", compression="snappy", index=False)
    print(f"  intervenciones.parquet      filas={len(interv):>7}")

    tram = clean_tramites()
    tram.to_parquet(OUT / "tramites.parquet", compression="snappy", index=False)
    print(f"  tramites.parquet            filas={len(tram):>7}")

    trib_largo, trib_wide = clean_tributacion()
    trib_largo.to_parquet(OUT / "tributacion.parquet", compression="snappy", index=False)
    trib_wide.to_parquet(OUT / "tributacion_wide.parquet", compression="snappy", index=False)
    print(f"  tributacion.parquet         filas={len(trib_largo):>7}")
    print(f"  tributacion_wide.parquet    filas={len(trib_wide):>7}")

    anti = clean_antidumping()
    anti.to_parquet(OUT / "antidumping.parquet", compression="snappy", index=False)
    print(f"  antidumping.parquet         filas={len(anti):>7}")

    cnce = clean_cnce()
    cnce.to_parquet(OUT / "cnce_medidas.parquet", compression="snappy", index=False)
    print(f"  cnce_medidas.parquet        filas={len(cnce):>7}")

    det = clean_posicion_detalle()
    det.to_parquet(OUT / "posicion_detalle.parquet", compression="snappy", index=False)
    print(f"  posicion_detalle.parquet    filas={len(det):>7}")

    print("OK - tablas limpias en", OUT)


if __name__ == "__main__":
    main()
