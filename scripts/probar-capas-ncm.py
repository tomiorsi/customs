#!/usr/bin/env python3
"""
Diagnóstico en dos capas: MOTOR (paquete) vs IA (cierre).

  python3 scripts/probar-capas-ncm.py           # 24 casos (fallos + regresión)
  python3 scripts/probar-capas-ncm.py --motor   # solo motor (rápido)
  python3 scripts/probar-capas-ncm.py --ia     # solo IA (requiere dev server)
"""
import importlib.util
import subprocess
import sys

_spec = importlib.util.spec_from_file_location("bench", "scripts/probar-exactitud-ncm.py")
bench = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bench)

_spec_m = importlib.util.spec_from_file_location("mot", "scripts/probar-motor-ncm.py")
mot = importlib.util.module_from_spec(_spec_m)
_spec_m.loader.exec_module(mot)


def correr(modo: str, solo_motor: bool, solo_ia: bool):
    filas = []
    for caso, var, texto in mot.variantes_a_correr(modo):
        esp = caso["esperado"]
        esp_n = bench.norm_ncm(esp)
        tag = "REG" if var in mot.REGRESION.get(caso["id"], set()) else "FAIL"

        en_motor = False
        partidas: list = []
        if not solo_ia:
            try:
                pkg = bench.motor_paquete(texto)
                partidas = pkg.get("partidas") or []
                en_motor = any(bench.norm_ncm(c) == esp_n for c in pkg.get("ncms", []))
            except Exception as e:
                print(f"  motor ERR {caso['id']}/{var}: {e}", file=sys.stderr)

        status = "—"
        obt = None
        if not solo_motor:
            r = bench.clasificar(texto, auto_primera=True)
            obt = r.get("ncm")
            status = bench.eval_ncm(esp, obt)
            if r.get("decision") == "SIN_RESULTADO":
                status = "SIN"
            elif r.get("decision") == "PREGUNTA":
                status = "PREG"

        if en_motor and status == "EXACT":
            capa = "OK"
        elif not en_motor:
            capa = "MOTOR"
        elif status != "EXACT":
            capa = "IA"
        else:
            capa = "?"

        filas.append({
            "id": caso["id"], "var": var, "tag": tag, "motor": en_motor,
            "status": status, "capa": capa, "partidas": partidas, "obt": obt,
        })

    return filas


def reporte(filas, titulo: str):
    n = len(filas)
    m_ok = sum(1 for f in filas if f["motor"])
    ia_exact = sum(1 for f in filas if f.get("status") == "EXACT")
    solo_motor = [f for f in filas if f["capa"] == "MOTOR"]
    solo_ia = [f for f in filas if f["capa"] == "IA"]
    reg = [f for f in filas if f["tag"] == "REG"]
    reg_ok = sum(1 for f in reg if f["motor"] and f.get("status") == "EXACT")

    print(f"\n=== {titulo} ===")
    print(f"Motor NCM en paquete: {m_ok}/{n}")
    print(f"IA EXACT (E2E):       {ia_exact}/{n}")
    print(f"Regresión E2E:        {reg_ok}/{len(reg)}")
    print(f"Fallo capa MOTOR:     {len(solo_motor)}")
    print(f"Fallo capa IA:        {len(solo_ia)} (motor tenía la NCM)")

    if solo_motor:
        print("\n  → MOTOR:", ", ".join(f"{f['id']}/{f['var']}" for f in solo_motor))
    if solo_ia:
        print("  → IA:", ", ".join(f"{f['id']}/{f['var']} ({f['status']})" for f in solo_ia))


def main() -> int:
    solo_motor = "--motor" in sys.argv
    solo_ia = "--ia" in sys.argv
    if solo_motor and solo_ia:
        print("Usá --motor o --ia, no ambos", file=sys.stderr)
        return 2

    filas = correr("fallos", solo_motor, solo_ia)
    reporte(filas, "Capas NCM (24 casos)")

    if not solo_motor and not solo_ia:
        print(f"\n{'CASO':<22} {'VAR':<8} {'CAPA':<6} {'MTR':<4} {'IA':<6}")
        print("-" * 55)
        for f in filas:
            print(
                f"{f['id']:<22} {f['var']:<8} {f['capa']:<6} "
                f"{'SI' if f['motor'] else 'NO':<4} {f.get('status', '?'):<6}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
