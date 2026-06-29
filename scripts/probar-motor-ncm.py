#!/usr/bin/env python3
"""
Benchmark rápido del motor (sin IA): ¿la partida esperada está entre las 5 del menú?

  python3 scripts/probar-motor-ncm.py           # fallos conocidos + regresión mínima
  python3 scripts/probar-motor-ncm.py --todos   # 40 variantes
  python3 scripts/probar-motor-ncm.py --mitad   # completa + minima por caso
"""
import importlib.util
import sys

# Cargar CASOS y motor_paquete del benchmark completo
_spec = importlib.util.spec_from_file_location("bench", "scripts/probar-exactitud-ncm.py")
bench = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bench)

# Motor sin NCM esperada (última medición estable)
FALLIDOS = {
    "secador_alambre": {"completa", "breve"},
    "oruga_excavadora": {"breve"},
    "placa_intercambiador": {"breve"},
    "tablero_bomba": {"breve"},
    "cadena_rodillos": {"breve"},
    "membrana_ro": {"breve"},
    "reductor": {"breve", "ultra"},
    "hincadora": {"breve"},
    "correa_caucho": {"breve"},
    "filtro_aceite": {"minima", "breve", "ultra"},
}

# Una variante que sí pasaba por caso (regresión)
REGRESION = {
    "secador_alambre": {"minima"},
    "oruga_excavadora": {"minima"},
    "placa_intercambiador": {"completa"},
    "tablero_bomba": {"completa"},
    "cadena_rodillos": {"minima"},
    "membrana_ro": {"minima"},
    "reductor": {"minima"},
    "hincadora": {"minima"},
    "correa_caucho": {"minima"},
    "filtro_aceite": {"completa"},
}


def variantes_a_correr(modo: str):
    for caso in bench.CASOS:
        cid = caso["id"]
        todas = list(caso["variantes"].items())
        if modo == "todos":
            sel = todas
        elif modo == "mitad":
            keys = ["completa", "minima"]
            sel = [(k, v) for k, v in todas if k in keys]
        else:
            want = FALLIDOS.get(cid, set()) | REGRESION.get(cid, set())
            sel = [(k, v) for k, v in todas if k in want]
        for var, texto in sel:
            yield caso, var, texto


def main() -> int:
    modo = "fallos"
    if "--todos" in sys.argv:
        modo = "todos"
    elif "--mitad" in sys.argv:
        modo = "mitad"

    filas = []
    print(f"Modo: {modo}")
    print(f"{'CASO':<22} {'VAR':<8} {'MOTOR':<6} {'PARTIDA':<8} partidas motor")
    print("-" * 100)

    for caso, var, texto in variantes_a_correr(modo):
        esp_p4 = bench.norm_p4(caso["esperado"])
        try:
            mot = bench.motor_paquete(texto)
            ok = bench.motor_partida_ok(caso, mot.get("partidas"))
        except Exception as e:
            mot = {"partidas": []}
            ok = False
            print(f"  ERR {caso['id']}/{var}: {e}", file=sys.stderr)
        tag = "REG" if var in REGRESION.get(caso["id"], set()) else "FAIL"
        filas.append({"id": caso["id"], "var": var, "ok": ok, "tag": tag, "partidas": mot.get("partidas")})
        print(
            f"{caso['id']:<22} {var:<8} {'SI' if ok else 'NO':<6} {esp_p4:<8} "
            f"{','.join(mot.get('partidas') or [])}"
        )

    n = len(filas)
    hits = sum(1 for f in filas if f["ok"])
    reg_ok = sum(1 for f in filas if f["tag"] == "REG" and f["ok"])
    reg_n = sum(1 for f in filas if f["tag"] == "REG")
    fail_ok = sum(1 for f in filas if f["tag"] == "FAIL" and f["ok"])
    fail_n = sum(1 for f in filas if f["tag"] == "FAIL")

    print("-" * 100)
    print(f"Motor partida en top 5: {hits}/{n} | regresión {reg_ok}/{reg_n} | objetivo fallos {fail_ok}/{fail_n}")
    if reg_ok < reg_n:
        print("⚠ Regresión rota:", ", ".join(f"{f['id']}/{f['var']}" for f in filas if f["tag"] == "REG" and not f["ok"]))
    return 0 if reg_ok == reg_n else 1


if __name__ == "__main__":
    raise SystemExit(main())
