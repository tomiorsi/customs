#!/usr/bin/env python3
"""Genera muestras aleatorias (NCM SIM complejas) con descripción en español desde el nomenclador."""
import argparse
import json
import re
import unicodedata
from pathlib import Path

import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[1]
PARQUET = ROOT / "data" / "Nomenclatura" / "ncm.parquet"
FIXTURES = ROOT / "scripts" / "fixtures"


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower()


def es_residual(desc: str) -> bool:
    d = norm(desc).strip("- ")
    return d.startswith("los demas") or d.startswith("las demas") or d == "demas"


def es_compleja(row) -> bool:
    cod = (row["codigo"] or "").strip()
    digits = re.sub(r"\D", "", cod)
    if len(digits) < 10:
        return False
    if str(row["codigo_num"])[:4].startswith("000"):
        return False
    if not re.search(r"[A-Z]$", cod):
        return False
    desc = row["descripcion"] or ""
    if es_residual(desc):
        return False
    ruta = row["ruta"] or ""
    niveles = [p.strip() for p in ruta.split(">") if p.strip()]
    if len(niveles) < 4:
        return False
    if any(es_residual(p) for p in niveles[-3:]):
        return False
    return True


def es_encabezado_partida(texto: str) -> bool:
    """Encabezado legal de partida/capítulo (ruido para IA; no descripción facturada)."""
    t = (texto or "").strip()
    if not t:
        return True
    letters = [c for c in t if c.isalpha()]
    if len(letters) < 15:
        return False
    upper = sum(1 for c in letters if c.isupper())
    ratio = upper / len(letters)
    has_digit = any(c.isdigit() for c in t)
    if len(t) >= 80 and ratio > 0.75:
        return True
    # Título de partida/subpartida: mayúsculas sin cifras discriminantes
    if ratio > 0.85 and not has_digit:
        return True
    return False


def producto_desde_fila(row) -> str:
    parts = [p.strip() for p in (row["ruta"] or "").split(">") if p.strip()]
    rama = parts[1:] if len(parts) > 1 else parts
    tail = [p for p in rama if not es_residual(p) and not es_encabezado_partida(p)]
    if len(tail) > 4:
        cuerpo = tail[-4:]
    else:
        cuerpo = tail
    desc = (row["descripcion"] or "").strip()
    textos: list[str] = []
    for t in cuerpo:
        if t not in textos:
            textos.append(t)
    if desc and not es_residual(desc):
        dn = norm(desc)
        if not any(dn in norm(t) or norm(t) in dn for t in textos):
            textos.append(desc)
    # Preservar la hoja SIM; truncar solo el prefijo de rama
    if desc and not es_residual(desc) and desc in textos:
        textos.remove(desc)
        prefix = ", ".join(textos)
        max_prefix = max(0, 320 - len(desc) - 2)
        if len(prefix) > max_prefix:
            prefix = prefix[-max_prefix:].lstrip(" ,")
        s = f"{prefix}, {desc}".strip(", ") if prefix else desc
    else:
        s = ", ".join(textos)
    return (s[:320] if len(s) > 320 else s) or desc


def ncms_excluidos(paths: list[Path]) -> set[str]:
    out: set[str] = set()
    for p in paths:
        if not p.is_file():
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        for m in data.get("muestras", []):
            if m.get("ncm"):
                out.add(m["ncm"])
    return out


def generar(seed: int, n: int, excluir: set[str]) -> list[dict]:
    df = pq.read_table(
        PARQUET,
        columns=["codigo", "codigo_num", "nivel", "descripcion", "ruta"],
    ).to_pandas()
    sims = df[df["nivel"].isin(["sim", "ncm"])].copy()
    sims = sims[sims.apply(es_compleja, axis=1)].copy()
    sims = sims[~sims["codigo"].isin(excluir)].copy()
    sims["partida"] = sims["codigo_num"].astype(str).str.slice(0, 4)
    sims["capitulo"] = sims["partida"].str.slice(0, 2)

    elegidas: list[dict] = []
    caps_usados: set[str] = set()
    rng = sims.sample(frac=1, random_state=seed)

    def agregar(row) -> bool:
        producto = producto_desde_fila(row)
        if len(producto.split()) < 4:
            return False
        elegidas.append(
            {
                "ncm": row["codigo"],
                "partida": row["partida"],
                "producto": producto,
                "descripcion_ncm": row["descripcion"],
            }
        )
        return True

    for _, row in rng.iterrows():
        cap = row["capitulo"]
        if cap in caps_usados and len(caps_usados) < min(20, n // 2):
            continue
        if agregar(row):
            caps_usados.add(cap)
        if len(elegidas) >= n:
            break

    if len(elegidas) < n:
        for _, row in rng.iterrows():
            if any(e["ncm"] == row["codigo"] for e in elegidas):
                continue
            if agregar(row) and len(elegidas) >= n:
                break

    return elegidas


def main() -> None:
    parser = argparse.ArgumentParser(description="Genera muestras benchmark motor NCM")
    parser.add_argument("-n", type=int, default=40, help="Cantidad de muestras")
    parser.add_argument("--seed", type=int, default=20260627, help="Semilla aleatoria")
    parser.add_argument(
        "--out",
        type=Path,
        default=FIXTURES / "muestras-motor-40.json",
        help="Archivo JSON de salida",
    )
    parser.add_argument(
        "--excluir",
        type=Path,
        nargs="*",
        default=[],
        help="Fixtures cuyos NCM no deben repetirse",
    )
    args = parser.parse_args()

    excluir = ncms_excluidos(args.excluir)
    elegidas = generar(args.seed, args.n, excluir)

    if len(elegidas) < args.n:
        print(f"AVISO: solo se obtuvieron {len(elegidas)}/{args.n} muestras")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "seed": args.seed,
        "n": len(elegidas),
        "excluidos": len(excluir),
        "muestras": elegidas,
    }
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Escritas {len(elegidas)} muestras en {args.out}")


if __name__ == "__main__":
    main()
