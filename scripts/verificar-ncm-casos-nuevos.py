#!/usr/bin/env python3
"""Verifica que cada NCM esperada de casos-motor-nuevos existe en ncm.parquet."""
import sys
from pathlib import Path

import pandas as pd

from casos_motor_nuevos import CASOS_NUEVOS

NCM = Path(__file__).resolve().parents[1] / "data" / "Nomenclatura" / "ncm.parquet"


def main() -> int:
    df = pd.read_parquet(NCM)
    sim = df[df["nivel"] == "sim"].set_index("codigo")
    errores = []
    for caso in CASOS_NUEVOS:
        esp = caso["esperado"]
        if esp not in sim.index:
            errores.append(f"{caso['id']}: {esp} no está en parquet")
            continue
        p4 = esp.replace(".", "")[:4]
        if caso.get("partida") and p4 != caso["partida"]:
            errores.append(f"{caso['id']}: partida {caso['partida']} != {p4}")
    if errores:
        for e in errores:
            print("ERROR:", e)
        return 1
    print(f"OK: {len(CASOS_NUEVOS)} NCM verificadas en {NCM.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
