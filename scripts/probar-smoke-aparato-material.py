#!/usr/bin/env python3
"""
Smoke E2E del clasificador: material vs aparato (regla APARATO VS MATERIAL).

Uso: python3 scripts/probar-smoke-aparato-material.py
Requiere servidor en localhost:3000 y ANTHROPIC_API_KEY.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CASOS = [
    {
        "nombre": "material (placa acero)",
        "producto": "placa de acero inoxidable",
        "partida_prefijo": "72",
    },
    {
        "nombre": "aparato (quemador gas)",
        "producto": "quemador de gas industrial",
        "partida_prefijo": "84",
        "no_partida_prefijo": "27",
    },
]


def partida4(out: str) -> str:
    m = re.search(r"partida: (\d{4})", out)
    if m:
        return m.group(1)
    m = re.search(r"NCM: ([0-9.]+)", out)
    if m:
        return re.sub(r"\D", "", m.group(1))[:4]
    return ""


def main() -> int:
    fallos = 0
    for caso in CASOS:
        print(f"\n{'='*60}\nSMOKE: {caso['nombre']} — {caso['producto']}\n{'='*60}")
        r = subprocess.run(
            [sys.executable, "scripts/probar-clasificador-api.py", caso["producto"], "--auto-primera"],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        out = r.stdout + r.stderr
        print(out)
        ok = r.returncode == 0 and "NCM:" in out
        p4 = partida4(out)
        if ok and caso.get("partida_prefijo") and not p4.startswith(caso["partida_prefijo"]):
            print(f"FALLO: partida {p4} — esperaba prefijo {caso['partida_prefijo']}")
            ok = False
        no = caso.get("no_partida_prefijo")
        if ok and no and p4.startswith(no):
            print(f"FALLO: partida {p4} — no debe ser capítulo {no}")
            ok = False
        if ok:
            print(f"OK — partida {p4}")
        else:
            if r.returncode != 0:
                print(f"FALLO: exit {r.returncode}")
            elif "NCM:" not in out:
                print("FALLO: no cerró con NCM")
            fallos += 1
    print(f"\n{'='*60}")
    print(f"{len(CASOS) - fallos}/{len(CASOS)} smoke OK" if not fallos else f"{fallos} fallo(s)")
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
