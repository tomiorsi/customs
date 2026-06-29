#!/usr/bin/env python3
"""Stress test: 10 casos difíciles × variantes (completa / mínima / ruido / ultra)."""
import json
import re
import subprocess
import tempfile
from dataclasses import dataclass
from typing import List, Optional

BASE = "http://localhost:3000"
MAX_PASOS = 6

CASOS = [
    {
        "id": "secador_alambre",
        "nota": "Máquina industrial secado; antes caía en 8516 doméstico",
        "variantes": {
            "completa": (
                "Maquina que se utiliza para el secado del alambre galvanizado despues del "
                "enfriamiento con agua. Ventilador de aire forzado en serie con caloventor de gas."
            ),
            "minima": "maquina secado alambre galvanizado caloventor gas",
            "ruido": (
                "Secador linea galvanizado • forced air fan • gas heater module • wire drying tunnel "
                "• post-quench drying • OEM industrial • import maquinaria"
            ),
            "ultra": "secador alambre",
        },
        "familia_ok": ["8419"],
    },
    {
        "id": "oruga_excavadora",
        "nota": "Oruga = banda vs tren rodaje; contexto máquina",
        "variantes": {
            "completa": (
                "Oruga de goma con inserts metalicos para excavadora hidraulica sobre orugas, "
                "repuesto suelto, par de banda de rodaje"
            ),
            "minima": "oruga excavadora hidraulica repuesto",
            "ruido": "Track shoe assy • rubber pad • CAT 320 • undercarriage spare • import repuesto",
            "ultra": "oruga excavadora",
        },
        "familia_ok": ["8431", "4010", "4011"],
    },
    {
        "id": "placa_intercambiador",
        "nota": "Componente suelto vs aparato completo",
        "variantes": {
            "completa": (
                "Placa de intercambiador de calor de acero inoxidable, repuesto suelto, "
                "elemento aletado para equipo de refrigeracion industrial"
            ),
            "minima": "placa intercambiador calor acero inox repuesto",
            "ruido": "Plate heat exchanger SS316 • gasketed plate • HVAC industrial spare • OEM",
            "ultra": "placa intercambiador",
        },
        "familia_ok": ["8419", "8418", "7326", "8488"],
    },
    {
        "id": "tablero_control_bomba",
        "nota": "Tablero vs bomba vs máquina completa",
        "variantes": {
            "completa": (
                "Tablero electrico de control y arranque para bomba centrifuga de agua "
                "industrial, incluye variador de frecuencia, repuesto/modulo suelto"
            ),
            "minima": "tablero control bomba centrifuga variador",
            "ruido": "Control panel VFD • pump starter cabinet • IP54 • 380V 3ph • import repuesto",
            "ultra": "tablero bomba",
        },
        "familia_ok": ["8537", "8413", "9032"],
    },
    {
        "id": "cadena_transmision",
        "nota": "Cadena metal vs plástico no declarado",
        "variantes": {
            "completa": (
                "Cadena de transmision de rodillos de acero aleado para transportador "
                "industrial de granos, repuesto suelto"
            ),
            "minima": "cadena transmision transportador granos",
            "ruido": "Roller chain RS120 • conveyor drive • grain handling • hardened steel • spare",
            "ultra": "cadena transmision",
        },
        "familia_ok": ["7315", "8483", "8428"],
    },
    {
        "id": "membrana_osmosis",
        "nota": "Membrana filtro vs aparato completo",
        "variantes": {
            "completa": (
                "Membrana de osmosis inversa para planta de tratamiento de agua potable, "
                "elemento filtrante reemplazo, poliamida"
            ),
            "minima": "membrana osmosis inversa agua potable",
            "ruido": "RO membrane element • TFC polyamide • 8 inch • water treatment spare • import",
            "ultra": "membrana osmosis",
        },
        "familia_ok": ["8421", "3917", "3926"],
    },
    {
        "id": "reductor_velocidad",
        "nota": "Reductor vs motor vs caja integrada",
        "variantes": {
            "completa": (
                "Reductor de velocidad de engranajes helicoidales con carcasa de hierro fundido, "
                "para motor electrico industrial 15kW, repuesto suelto"
            ),
            "minima": "reductor engranajes motor electrico industrial",
            "ruido": "Gearbox helical • cast iron housing • 15kW drive • speed reducer spare • import",
            "ultra": "reductor",
        },
        "familia_ok": ["8483", "8501", "8479"],
    },
    {
        "id": "hincadora_perforadora",
        "nota": "Dos funciones igual importancia (8430 vs perforación)",
        "variantes": {
            "completa": (
                "Maquina hincadora y perforadora de pilotes con motor diesel, martillo hidraulico, "
                "orugas de acero, autopropulsada"
            ),
            "minima": "hincadora perforadora pilotes diesel orugas",
            "ruido": "Pile driver + auger • diesel Cummins • hydraulic hammer • steel tracks • import",
            "ultra": "hincadora",
        },
        "familia_ok": ["8430"],
    },
    {
        "id": "correa_ventilador",
        "nota": "Material no declarado; antes 3926 plástico",
        "variantes": {
            "completa": (
                "Correa trapezoidal de transmision de caucho vulcanizado para ventilador de "
                "motor diesel industrial, repuesto suelto"
            ),
            "minima": "correa ventilador motor diesel",
            "ruido": "V-belt fan drive • EPDM rubber • diesel engine spare • import repuesto",
            "ultra": "correa",
        },
        "familia_ok": ["4010"],
    },
    {
        "id": "sensor_presion",
        "nota": "Sensor vs transmisor vs parte de máquina",
        "variantes": {
            "completa": (
                "Sensor de presion piezoelectrico para circuito hidraulico de prensa, "
                "repuesto suelto, salida 4-20mA"
            ),
            "minima": "sensor presion hidraulica prensa 4-20mA",
            "ruido": "Pressure transducer • piezo • hydraulic press spare • 0-400 bar • import",
            "ultra": "sensor presion",
        },
        "familia_ok": ["9026", "8533", "8481", "9032"],
    },
]


def api(cookie_jar: str, path: str, body=None) -> dict:
    cmd = ["curl", "-s", "-b", cookie_jar, "-c", cookie_jar]
    if body is not None:
        cmd += ["-X", "POST", "-H", "Content-Type: application/json", "-d", json.dumps(body)]
    else:
        cmd += ["-X", "GET"]
    cmd.append(f"{BASE}{path}")
    return json.loads(subprocess.check_output(cmd, text=True))


def norm_p4(ncm: Optional[str]) -> str:
    if not ncm:
        return ""
    return re.sub(r"\D", "", ncm)[:4]


def clasificar(texto: str) -> dict:
    jar = tempfile.NamedTemporaryFile(delete=False, suffix=".cookies").name
    login = api(jar, "/api/auth/login", {"identifier": "admin", "password": "admin"})
    if "error" in login and "user" not in login:
        return {"error": "login"}

    respuestas: List[dict] = []
    ultimo = {}
    for paso in range(1, MAX_PASOS + 1):
        body = {"producto": texto}
        if respuestas:
            body["respuestas"] = respuestas
        res = api(jar, "/api/clasificar", body).get("resultado", {})
        ultimo = res
        if res.get("ncm"):
            return {
                "ncm": res.get("ncm"),
                "partida": res.get("partida"),
                "decision": res.get("decision"),
                "pasos": paso,
                "preguntas": len(respuestas),
                "justificacion": (res.get("justificacion") or "")[:180],
            }
        if res.get("decision") == "SIN_RESULTADO":
            return {
                "ncm": None,
                "decision": "SIN_RESULTADO",
                "pasos": paso,
                "preguntas": len(respuestas),
                "justificacion": (res.get("justificacion") or "")[:180],
            }
        qs = res.get("preguntas") or []
        if not qs:
            return {"ncm": None, "decision": res.get("decision"), "pasos": paso, "preguntas": len(respuestas)}
        q = qs[0]
        opciones = q.get("opciones") or []
        if not opciones:
            return {
                "ncm": None,
                "decision": "NEEDS_AI",
                "pregunta": q.get("pregunta"),
                "pasos": paso,
            }
        # auto-primera para ver adónde cierra el camino por defecto
        respuestas.append({"pregunta": q["pregunta"], "opcion": opciones[0]})

    return {"ncm": None, "decision": "MAX_PASOS", "ultimo": ultimo}


def eval_familia(partida: Optional[str], familias: List[str]) -> str:
    if not partida:
        return "FAIL"
    p4 = re.sub(r"\D", "", str(partida))[:4]
    if any(p4 == f for f in familias):
        return "OK"
    if any(p4.startswith(f[:2]) for f in familias if len(f) == 2):
        return "CAP"
    return "FAIL"


def main() -> int:
    filas = []
    print(f"{'CASO':<22} {'VAR':<8} {'RES':<5} {'PART':<6} {'NCM':<22} {'PASOS':<5} NOTA")
    print("-" * 110)

    for caso in CASOS:
        for var, texto in caso["variantes"].items():
            r = clasificar(texto)
            partida = r.get("partida") or norm_p4(r.get("ncm"))
            ncm = r.get("ncm") or r.get("decision", "?")
            if r.get("decision") == "NEEDS_AI" and r.get("pregunta"):
                ncm = f"PREG: {r['pregunta'][:40]}..."
            status = eval_familia(partida if partida and partida.isdigit() else norm_p4(r.get("ncm")), caso["familia_ok"])
            filas.append({**caso, "variante": var, "status": status, **r, "partida_out": partida})
            ncm_s = str(ncm)[:22]
            print(
                f"{caso['id']:<22} {var:<8} {status:<5} {str(partida or '?'):<6} "
                f"{ncm_s:<22} {r.get('pasos', '?'):<5} {caso['nota'][:35]}"
            )

    ok = sum(1 for f in filas if f["status"] == "OK")
    cap = sum(1 for f in filas if f["status"] == "CAP")
    fail = sum(1 for f in filas if f["status"] == "FAIL")
    preg = sum(1 for f in filas if f.get("ncm") and "PREG" in str(f.get("ncm", "")))
    sin = sum(1 for f in filas if f.get("decision") == "SIN_RESULTADO")

    print("-" * 110)
    print(f"OK partida esperada: {ok}/{len(filas)} | CAP capítulo cercano: {cap} | FAIL: {fail} | SIN_RESULTADO: {sin}")

    print("\n## Fallos y sospechosos (FAIL o partida doméstica/residual rara)\n")
    for f in filas:
        if f["status"] == "FAIL" or f.get("decision") == "SIN_RESULTADO":
            print(f"### {f['id']} / {f['variante']}")
            print(f"  Texto: {f['variantes'][f['variante']][:100]}...")
            print(f"  → {f.get('partida_out')} | {f.get('ncm')} | {f.get('decision')}")
            if f.get("justificacion"):
                print(f"  Just: {f['justificacion']}...")
            print()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
