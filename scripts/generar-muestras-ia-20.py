#!/usr/bin/env python3
"""Selecciona N muestras de fixtures motor para benchmark IA (misma lógica de producto)."""
import argparse
import importlib.util
import json
import random
from pathlib import Path

import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "scripts" / "fixtures"
PARQUET = ROOT / "data" / "Nomenclatura" / "ncm.parquet"
DEFAULT_OUT = FIXTURES / "muestras-ia-20.json"
DEFAULT_FUENTE = FIXTURES / "muestras-motor-100.json"


def _gen_motor():
    spec = importlib.util.spec_from_file_location(
        "generar_muestras_motor",
        ROOT / "scripts" / "generar-muestras-motor.py",
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def refrescar_productos(muestras: list[dict]) -> list[dict]:
    gen = _gen_motor()
    df = pq.read_table(
        PARQUET,
        columns=["codigo", "codigo_num", "nivel", "descripcion", "ruta"],
    ).to_pandas()
    by_cod = {row["codigo"]: row for _, row in df.iterrows()}
    out: list[dict] = []
    for m in muestras:
        row = by_cod.get(m["ncm"])
        if row is None:
            out.append(m)
            continue
        out.append(
            {
                **m,
                "producto": gen.producto_desde_fila(row),
                "descripcion_ncm": row["descripcion"],
            }
        )
    return out


def cargar_muestras(paths: list[Path]) -> list[dict]:
    out: list[dict] = []
    vistos: set[str] = set()
    for p in paths:
        data = json.loads(p.read_text(encoding="utf-8"))
        for m in data.get("muestras", []):
            ncm = m.get("ncm")
            if not ncm or ncm in vistos:
                continue
            vistos.add(ncm)
            out.append(m)
    return out


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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("-n", type=int, default=20)
    parser.add_argument("--seed", type=int, default=20260630)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "fixtures",
        nargs="*",
        type=Path,
        default=[DEFAULT_FUENTE],
        help="Pool de muestras motor (p. ej. muestras-motor-100.json)",
    )
    parser.add_argument(
        "--excluir",
        type=Path,
        nargs="*",
        default=[],
        help="Fixtures IA previos cuyos NCM no deben repetirse (lote 2, 3, …)",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Regenera campo producto desde parquet (misma lista de NCM)",
    )
    parser.add_argument(
        "--in",
        dest="input",
        type=Path,
        default=DEFAULT_OUT,
        help="Fixture a refrescar (solo con --refresh)",
    )
    args = parser.parse_args()

    if args.refresh:
        data = json.loads(args.input.read_text(encoding="utf-8"))
        data["muestras"] = refrescar_productos(data.get("muestras", []))
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Refrescadas {len(data['muestras'])} muestras en {args.out}")
        return

    pool = cargar_muestras(args.fixtures)
    excluir = ncms_excluidos(args.excluir)
    if excluir:
        pool = [m for m in pool if m["ncm"] not in excluir]
    if len(pool) < args.n:
        raise SystemExit(
            f"Solo hay {len(pool)} muestras únicas tras exclusiones; se pidieron {args.n}",
        )

    rng = random.Random(args.seed)
    elegidas = rng.sample(pool, args.n)
    elegidas.sort(key=lambda m: m["ncm"])

    payload = {
        "seed": args.seed,
        "n": len(elegidas),
        "fuente": [str(p.name) for p in args.fixtures],
        "excluidos": len(excluir),
        "muestras": elegidas,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Escritas {len(elegidas)} muestras en {args.out}")


if __name__ == "__main__":
    main()
