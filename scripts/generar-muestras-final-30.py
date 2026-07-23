#!/usr/bin/env python3
"""30 muestras diversas: máquinas completas, accesorios y repuestos."""
import json
import re
from typing import Optional

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location(
    "generar_muestras_motor",
    ROOT / "scripts" / "generar-muestras-motor.py",
)
_gmm = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_gmm)

FIXTURES = _gmm.FIXTURES
es_compleja = _gmm.es_compleja
es_espanol = _gmm.es_espanol
es_partida_repuestos = _gmm.es_partida_repuestos
es_sim_repuesto_partida = _gmm.es_sim_repuesto_partida
ncms_excluidos = _gmm.ncms_excluidos
norm = _gmm.norm
producto_desde_fila = _gmm.producto_desde_fila
producto_repuesto_desde_fila = _gmm.producto_repuesto_desde_fila

import pyarrow.parquet as pq  # noqa: E402

PARQUET = ROOT / "data" / "Nomenclatura" / "ncm.parquet"
SEED = 20260704
OUT = FIXTURES / "muestras-final-30.json"

PLAN = [
    ("maquina", 12),
    ("repuesto", 10),
    ("accesorio", 8),
]


def cargar_sims():
    df = pq.read_table(
        PARQUET,
        columns=["codigo", "codigo_num", "nivel", "descripcion", "ruta"],
    ).to_pandas()
    sims = df[df["nivel"].isin(["sim", "ncm"])].copy()
    sims = sims[sims.apply(es_compleja, axis=1)].copy()
    sims["partida"] = sims["codigo_num"].astype(str).str.slice(0, 4)
    sims["capitulo"] = sims["partida"].str.slice(0, 2)
    partidas_df = df[df["nivel"] == "partida"]
    partidas_rep = {
        str(r["codigo_num"])[:4]
        for _, r in partidas_df.iterrows()
        if es_partida_repuestos(r["descripcion"])
    }
    sims["es_partida_rep"] = sims["partida"].isin(partidas_rep)
    return sims, partidas_rep


def es_maquina_completa(row, partidas_rep: set[str]) -> bool:
    if row["partida"] in partidas_rep:
        return False
    cap = row["capitulo"]
    if cap not in ("84", "85", "86", "87", "90"):
        return False
    parts = [p.strip() for p in (row["ruta"] or "").split(">") if p.strip()]
    tail = [norm(p) for p in parts[-4:]]
    if any(p == "partes" or re.match(r"^partes\b", p) for p in tail):
        return False
    return True


def es_articulo_terminado(row, partidas_rep: set[str]) -> bool:
    """Artículo terminado bajo partida de aparato, no componente suelto ni PARTES."""
    if row["partida"] in partidas_rep and es_sim_repuesto_partida(row):
        return False
    parts = [p.strip() for p in (row["ruta"] or "").split(">") if p.strip()]
    tail = [norm(p) for p in parts[-4:]]
    if any(p == "partes" or re.match(r"^partes\b", p) for p in tail):
        return False
    return row["partida"] not in partidas_rep


def es_accesorio(row, partidas_rep: set[str]) -> bool:
    if es_articulo_terminado(row, partidas_rep):
        return False
    base = producto_desde_fila(row)
    primer = (base.split(",")[0] if "," in base else base).strip()
    if re.match(r"^partes\b", norm(primer)):
        return False
    ruta = norm(row["ruta"] or "")
    desc = norm(row["descripcion"] or "")
    if row["partida"] in partidas_rep and es_sim_repuesto_partida(row):
        return False
    if "accesorio" not in ruta and "accesorio" not in desc:
        return False
    if re.search(r"\brepuesto\b", producto_desde_fila(row)):
        return False
    return True


def producto_accesorio(row, partidas_rep: set[str]) -> str:
    base = producto_desde_fila(row)
    if re.search(r"\b(?:accesorio|accesorios)\b", norm(base)):
        return base
    if es_articulo_terminado(row, partidas_rep):
        return base
    return f"{base}, accesorio"


def fila_a_muestra(row, tipo: str, partidas_rep: set[str]) -> Optional[dict]:
    if tipo == "repuesto":
        producto = producto_repuesto_desde_fila(row)
    elif tipo == "accesorio":
        producto = producto_accesorio(row, partidas_rep)
    else:
        producto = producto_desde_fila(row)
    if len(producto.split()) < 4 or not es_espanol(producto):
        return None
    return {
        "tipo": tipo,
        "ncm": row["codigo"],
        "partida": row["partida"],
        "producto": producto,
        "descripcion_ncm": row["descripcion"],
    }


def generar_pool(sims, partidas_rep, tipo: str, n: int, excluir: set[str], seed: int) -> list[dict]:
    if tipo == "maquina":
        pool = sims[sims.apply(lambda r: es_maquina_completa(r, partidas_rep), axis=1)]
    elif tipo == "repuesto":
        pool = sims[sims["es_partida_rep"] & sims.apply(es_sim_repuesto_partida, axis=1)]
    else:
        pool = sims[sims.apply(lambda r: es_accesorio(r, partidas_rep), axis=1)]

    pool = pool[~pool["codigo"].isin(excluir)].copy()
    rng = pool.sample(frac=1, random_state=seed)
    caps: set[str] = set()
    out: list[dict] = []

    for _, row in rng.iterrows():
        cap = row["capitulo"]
        if cap in caps and len(caps) >= max(4, n // 3):
            continue
        m = fila_a_muestra(row, tipo, partidas_rep)
        if not m:
            continue
        out.append(m)
        caps.add(cap)
        if len(out) >= n:
            break

    if len(out) < n:
        for _, row in rng.iterrows():
            if any(x["ncm"] == row["codigo"] for x in out):
                continue
            m = fila_a_muestra(row, tipo, partidas_rep)
            if m:
                out.append(m)
            if len(out) >= n:
                break
    return out[:n]


def main() -> None:
    excluir_paths = list(FIXTURES.glob("muestras-*.json"))
    excluir = ncms_excluidos(excluir_paths)
    sims, partidas_rep = cargar_sims()

    muestras: list[dict] = []
    vistos: set[str] = set()
    for i, (tipo, n) in enumerate(PLAN):
        batch = generar_pool(sims, partidas_rep, tipo, n, excluir | vistos, SEED + i)
        for m in batch:
            vistos.add(m["ncm"])
        muestras.extend(batch)

    payload = {
        "seed": SEED,
        "n": len(muestras),
        "plan": {t: c for t, c in PLAN},
        "excluidos": len(excluir),
        "muestras": muestras,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Escritas {len(muestras)} muestras en {OUT}")
    for t, _ in PLAN:
        n = sum(1 for m in muestras if m["tipo"] == t)
        print(f"  {t}: {n}")


if __name__ == "__main__":
    main()
