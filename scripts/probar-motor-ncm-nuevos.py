#!/usr/bin/env python3
"""
Benchmark motor sobre 40 muestras en español (scripts/casos_motor_nuevos.py).

  python3 scripts/probar-motor-ncm-nuevos.py
  python3 scripts/probar-motor-ncm-nuevos.py --originales
"""
import importlib.util
import re
import sys

from casos_motor_nuevos import CASOS_NUEVOS

_spec = importlib.util.spec_from_file_location("bench", "scripts/probar-exactitud-ncm.py")
bench = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bench)


def norm_ncm(c: str) -> str:
    return re.sub(r"[^0-9A-Za-z]", "", (c or "").upper())


def partida_esperada(caso: dict) -> str:
    import re
    if caso.get("partida"):
        return caso["partida"]
    return re.sub(r"\D", "", caso["esperado"])[:4]


def correr_casos(casos, etiqueta: str) -> list:
    filas = []
    print(f"\n=== {etiqueta} ({len(casos) * 4} variantes) ===")
    print(f"{'CASO':<24} {'VAR':<8} {'MOTOR':<6} {'PARTIDA':<8} partidas motor")
    print("-" * 100)
    for caso in casos:
        esp_p4 = partida_esperada(caso)
        for var, texto in caso["variantes"].items():
            try:
                mot = bench.motor_paquete(texto)
                ok = bench.motor_partida_ok(caso, mot.get("partidas"))
            except Exception as e:
                mot = {"partidas": []}
                ok = False
                print(f"  ERR {caso['id']}/{var}: {e}", file=sys.stderr)
            filas.append(
                {
                    "id": caso["id"],
                    "var": var,
                    "ok": ok,
                    "partida_esp": esp_p4,
                    "partidas": mot.get("partidas") or [],
                }
            )
            print(
                f"{caso['id']:<24} {var:<8} {'SI' if ok else 'NO':<6} {esp_p4:<8} "
                f"{','.join(mot.get('partidas') or [])}"
            )
    hits = sum(1 for f in filas if f["ok"])
    print("-" * 100)
    print(f"Motor partida en top 5: {hits}/{len(filas)}")
    if hits < len(filas):
        print(
            "Fallos:",
            ", ".join(f"{f['id']}/{f['var']}" for f in filas if not f["ok"]),
        )
    return filas


def main() -> int:
    nuevos = correr_casos(CASOS_NUEVOS, "MUESTRAS NUEVAS")
    ok_nuevos = all(f["ok"] for f in nuevos)

    if "--originales" in sys.argv:
        orig = correr_casos(bench.CASOS, "MUESTRAS ORIGINALES (regresión)")
        ok_orig = all(f["ok"] for f in orig)
        return 0 if ok_nuevos and ok_orig else 1

    return 0 if ok_nuevos else 1


if __name__ == "__main__":
    raise SystemExit(main())
