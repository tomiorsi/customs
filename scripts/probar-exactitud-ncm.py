#!/usr/bin/env python3
"""
Benchmark exactitud NCM (no familia): esperado verificado en ncm.parquet.
Por cada variante: ¿el NCM esperado está en el paquete del motor? ¿qué cerró la IA?
"""
import json
import re
import subprocess
import tempfile
from typing import List, Optional

BASE = "http://localhost:3000"
MAX_PASOS = 6

# NCM esperada: verificada contra data/Nomenclatura/ncm.parquet (mar 2026)
CASOS = [
    {
        "id": "secador_alambre",
        "esperado": "8419.39.00.000H",
        "variantes": {
            "completa": (
                "Maquina que se utiliza para el secado del alambre galvanizado despues del "
                "enfriamiento con agua. Ventilador aire forzado en serie con caloventor de gas."
            ),
            "minima": "maquina secado alambre galvanizado caloventor gas",
            "breve": "Secador alambre • aire forzado • caloventor gas",
            "ultra": "secador alambre industrial",
        },
    },
    {
        "id": "oruga_excavadora",
        "esperado": "8431.49.22.900Z",
        "variantes": {
            "completa": (
                "Oruga de goma con inserts metalicos para excavadora hidraulica sobre orugas, "
                "repuesto suelto, banda de rodaje"
            ),
            "minima": "oruga goma excavadora hidraulica repuesto",
            "breve": "Oruga goma • inserts metálicos • excavadora repuesto",
            "ultra": "oruga excavadora repuesto",
        },
    },
    {
        "id": "placa_intercambiador",
        "esperado": "8419.90.31.000X",
        "variantes": {
            "completa": (
                "Placa corrugada de intercambiador de calor de acero inoxidable, repuesto suelto, "
                "elemento aletado para equipo industrial"
            ),
            "minima": "placa corrugada intercambiador calor acero inox repuesto",
            "breve": "Placa corrugada • intercambiador calor • acero inox repuesto",
            "ultra": "placa intercambiador acero",
        },
    },
    {
        "id": "tablero_bomba",
        "esperado": "8537.10.90.300M",
        "variantes": {
            "completa": (
                "Tablero electrico de control y arranque con variador de frecuencia para "
                "bomba centrifuga de agua industrial, mas 100A"
            ),
            "minima": "tablero electrico control variador bomba centrifuga industrial",
            "breve": "Tablero control • variador frecuencia • bomba industrial",
            "ultra": "tablero control bomba",
        },
    },
    {
        "id": "cadena_rodillos",
        "esperado": "7315.81.00.000U",
        "variantes": {
            "completa": (
                "Cadena de transmision de rodillos de acero aleado, eslabones con contrate, "
                "para transportador industrial de granos, repuesto"
            ),
            "minima": "cadena rodillos acero transportador granos repuesto",
            "breve": "Cadena rodillos • acero templado • transportador granos",
            "ultra": "cadena rodillos acero",
        },
    },
    {
        "id": "membrana_ro",
        "esperado": "8421.99.91.000L",
        "variantes": {
            "completa": (
                "Cartucho de membrana de osmosis inversa de poliamida, elemento filtrante "
                "reemplazo para planta potabilizadora"
            ),
            "minima": "cartucho membrana osmosis inversa poliamida repuesto",
            "breve": "Cartucho membrana • ósmosis inversa • poliamida repuesto",
            "ultra": "membrana osmosis inversa",
        },
    },
    {
        "id": "reductor",
        "esperado": "8483.40.10.200U",
        "variantes": {
            "completa": (
                "Reductor de velocidad de engranajes helicoidales de doble reduccion, "
                "carcasa hierro fundido, repuesto para motor 15kW"
            ),
            "minima": "reductor velocidad engranajes helicoidales doble reduccion repuesto",
            "breve": "Reductor helicoidal • doble reducción • carcasa hierro repuesto",
            "ultra": "reductor engranajes",
        },
    },
    {
        "id": "hincadora",
        "esperado": "8430.10.00.100C",
        "variantes": {
            "completa": (
                "Maquina hincadora y perforadora de pilotes con motor diesel, martillo hidraulico, "
                "orugas acero autopropulsada"
            ),
            "minima": "hincadora perforadora pilotes diesel orugas autopropulsada",
            "breve": "Hincadora pilotes • martillo hidráulico • orugas diesel",
            "ultra": "hincadora pilotes",
        },
    },
    {
        "id": "correa_caucho",
        "esperado": "4010.32.00.111H",
        "variantes": {
            "completa": (
                "Correa trapezoidal de transmision de caucho vulcanizado seccion A, "
                "para ventilador motor diesel, repuesto"
            ),
            "minima": "correa trapezoidal caucho seccion A ventilador motor",
            "breve": "Correa trapezoidal • sección A • caucho repuesto ventilador",
            "ultra": "correa trapezoidal caucho",
        },
    },
    {
        "id": "filtro_aceite",
        "esperado": "8421.23.00.000V",
        "variantes": {
            "completa": (
                "Filtro para lubricante de motor diesel de encendido por compresion, "
                "cartucho repuesto"
            ),
            "minima": "filtro aceite motor diesel repuesto",
            "breve": "Filtro aceite • motor diesel • cartucho repuesto",
            "ultra": "filtro aceite motor",
        },
    },
]


def norm_ncm(c: str) -> str:
    return re.sub(r"[^0-9A-Za-z]", "", (c or "").upper())


def norm_p4(c: str) -> str:
    return re.sub(r"\D", "", c or "")[:4]


def pref(n: str, k: int) -> str:
    d = norm_ncm(n)
    return d[:k] if len(d) >= k else d


def eval_ncm(esperado: str, obtenido: Optional[str]) -> str:
    if not obtenido:
        return "FAIL"
    e, o = norm_ncm(esperado), norm_ncm(obtenido)
    if e == o:
        return "EXACT"
    if pref(esperado, 10) == pref(obtenido, 10):
        return "SIM10"
    if pref(esperado, 8) == pref(obtenido, 8):
        return "SIM8"
    if pref(esperado, 4) == pref(obtenido, 4):
        return "PART4"
    return "FAIL"


def api(cookie_jar: str, path: str, body=None) -> dict:
    cmd = ["curl", "-s", "-b", cookie_jar, "-c", cookie_jar]
    if body is not None:
        cmd += ["-X", "POST", "-H", "Content-Type: application/json", "-d", json.dumps(body)]
    else:
        cmd += ["-X", "GET"]
    cmd.append(f"{BASE}{path}")
    return json.loads(subprocess.check_output(cmd, text=True))


def motor_paquete(texto: str) -> dict:
    """Partidas del motor (máx. 5); sin ranking de SIMs."""
    cmd = [
        "npx", "tsx", "--require", "./scripts/register-server-only-stub.cjs", "-e",
        f"""
import {{ partidasMotor }} from './src/lib/clasificador/motor.ts';
import {{ nombreBaseProducto, textoParaFiltroParquet, textoParaSimsParquet }} from './src/lib/clasificador/estado-clasificacion.ts';
const p = {json.dumps(texto)};
const nb = nombreBaseProducto(p);
const partidas = await partidasMotor({{
  textoNombreBase: nb,
  textoFiltro: textoParaFiltroParquet(p, []),
  textoSims: textoParaSimsParquet(p, []),
}});
console.log(JSON.stringify({{ nb, partidas }}));
""",
    ]
    out = subprocess.check_output(cmd, text=True, cwd="/Users/facha/Documents/PHYTON/DESPACHANTE")
    return json.loads(out.strip().split("\n")[-1])


def motor_partida_ok(caso: dict, partidas: list) -> bool:
    esp_p4 = caso.get("partida") or norm_p4(caso["esperado"])
    return esp_p4 in (partidas or [])


def clasificar(texto: str, auto_primera: bool = True) -> dict:
    jar = tempfile.NamedTemporaryFile(delete=False, suffix=".cookies").name
    login = api(jar, "/api/auth/login", {"identifier": "admin", "password": "admin"})
    if "error" in login and "user" not in login:
        return {"error": "login"}

    respuestas: List[dict] = []
    ultima_pregunta = None
    for paso in range(1, MAX_PASOS + 1):
        body = {"producto": texto}
        if respuestas:
            body["respuestas"] = respuestas
        res = api(jar, "/api/clasificar", body).get("resultado", {})
        if res.get("ncm"):
            return {
                "ncm": res.get("ncm"),
                "partida": res.get("partida"),
                "decision": res.get("decision"),
                "pasos": paso,
                "preguntas": len(respuestas),
                "ultima_pregunta": ultima_pregunta,
            }
        if res.get("decision") == "SIN_RESULTADO":
            return {
                "ncm": None,
                "decision": "SIN_RESULTADO",
                "pasos": paso,
                "justificacion": (res.get("justificacion") or "")[:200],
            }
        qs = res.get("preguntas") or []
        if not qs:
            return {"ncm": None, "decision": res.get("decision"), "pasos": paso}
        q = qs[0]
        ultima_pregunta = q.get("pregunta")
        opciones = q.get("opciones") or []
        if not auto_primera or not opciones:
            return {
                "ncm": None,
                "decision": "PREGUNTA",
                "pregunta": ultima_pregunta,
                "opciones": opciones[:4],
                "pasos": paso,
            }
        respuestas.append({"pregunta": q["pregunta"], "opcion": opciones[0]})
    return {"ncm": None, "decision": "MAX_PASOS"}


def main() -> int:
    filas = []
    print(f"{'CASO':<20} {'VAR':<8} {'RES':<6} {'MOTOR':<6} {'OBTENIDO':<22} {'ESPERADO':<22} DIAG")
    print("-" * 115)

    for caso in CASOS:
        esp = caso["esperado"]
        esp_n = norm_ncm(esp)
        for var, texto in caso["variantes"].items():
            try:
                mot = motor_paquete(texto)
                en_motor = motor_partida_ok(caso, mot.get("partidas"))
                motor_flag = "SI" if en_motor else "NO"
            except Exception as e:
                mot = {"nb": "?", "partidas": []}
                en_motor = False
                motor_flag = "ERR"

            r = clasificar(texto, auto_primera=True)
            ncm = r.get("ncm")
            status = eval_ncm(esp, ncm)
            if r.get("decision") == "SIN_RESULTADO":
                status = "SIN"
            elif r.get("decision") == "PREGUNTA":
                status = "PREG"

            if status == "EXACT":
                diag = "ok"
            elif not en_motor:
                diag = "motor sin partida esp."
            elif r.get("decision") == "SIN_RESULTADO":
                diag = "motor ok? IA sin cierre"
            elif status in ("SIM10", "SIM8", "PART4"):
                diag = f"IA hermana ({status})"
            else:
                diag = "IA otra partida"

            filas.append({
                **caso, "variante": var, "status": status, "motor": en_motor,
                "nb": mot.get("nb"), "partidas_motor": mot.get("partidas"), **r,
            })
            obt = ncm or r.get("decision", "?")
            print(
                f"{caso['id']:<20} {var:<8} {status:<6} {motor_flag:<6} "
                f"{str(obt)[:22]:<22} {esp:<22} {diag}"
            )

    exact = sum(1 for f in filas if f["status"] == "EXACT")
    sim10 = sum(1 for f in filas if f["status"] == "SIM10")
    sim8 = sum(1 for f in filas if f["status"] == "SIM8")
    part4 = sum(1 for f in filas if f["status"] == "PART4")
    fail = sum(1 for f in filas if f["status"] in ("FAIL", "SIN", "PREG"))
    motor_miss = sum(1 for f in filas if not f.get("motor"))

    print("-" * 115)
    print(
        f"EXACT: {exact}/40 | SIM10: {sim10} | SIM8: {sim8} | PART4: {part4} | "
        f"FAIL/SIN/PREG: {fail} | Motor sin partida esperada: {motor_miss}/40"
    )

    print("\n## Diagnóstico: por qué no llega a la subpartida exacta\n")
    for f in filas:
        if f["status"] == "EXACT":
            continue
        print(f"### {f['id']} / {f['variante']} → esperado {f['esperado']}")
        print(f"  nombreBase motor: {f.get('nb', '?')}")
        print(f"  partidas paquete: {', '.join(f.get('partidas_motor') or [])}")
        print(f"  partida esperada en motor: {'SI' if f.get('motor') else 'NO'}")
        print(f"  Cerró: {f.get('ncm') or f.get('decision')} ({f['status']})")
        if f.get("pregunta"):
            print(f"  Quedó en pregunta: {f['pregunta'][:90]}")
        print()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
