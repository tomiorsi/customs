#!/usr/bin/env python3
"""Batch test del clasificador: compara NCM obtenida vs esperada."""
import json
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from typing import List, Optional

BASE = "http://localhost:3000"
MAX_PASOS = 8

# 8 casos: 4 del usuario + 4 repuestos adicionales (NCM verificados en parquet)
CASOS = [
    {
        "id": "filtro_aceite",
        "esperado": "8421.23.00.000V",
        "variantes": {
            "completa": "Filtro de aceite para motor diesel Cummins de hincadora de pilotes, repuesto suelto, cartucho con carcasa",
            "ruido": "Filtro aceite motor • Cummins 97kW • HOLMEN pile driver • elemento filtrante spin-on • rosca M27 • bypass valve • OEM replacement part • importación repuesto",
            "minima": "filtro aceite motor diesel",
        },
    },
    {
        "id": "hincadora",
        "esperado": "8430.10.00.100C",
        "variantes": {
            "completa": "Hincadora de pilotes solar (Solar Pile Driver) Marca HOLMEN Motor diesel Cummins 97kW Martillo hidraulico Chasis de orugas de acero autopropulsada",
            "ruido": "Hincadora pilotes • solar pile driver HOLMEN • motor Cummins 97kW • martillo YC360 1260J • orugas acero • sistema hidraulico • iluminacion • perforacion Auger Pole • importacion maquinaria obra",
            "minima": "hincadora pilotes solar orugas",
        },
    },
    {
        "id": "junta_tapa_valvulas",
        "esperado": "8484.90.00.000M",
        "variantes": {
            "completa": "Junta de tapa de valvulas para motor diesel Cummins, repuesto suelto, junta metaloplastica",
            "ruido": "Junta tapa valvulas • head gasket • Cummins QSB • motor hincadora • composite metal-elastomer • OEM spare • import repuesto",
            "minima": "junta tapa valvulas motor",
        },
    },
    {
        "id": "aspas_ventilador",
        "esperado": "8414.90.20.110W",
        "variantes": {
            "completa": "Aspas del ventilador del motor diesel Cummins, repuesto suelto, partes de ventilador",
            "ruido": "Aspas ventilador • fan blades • motor Cummins diesel • cooling fan • 6 blades • hincadora repuesto • import pieza suelta",
            "minima": "aspas ventilador motor diesel",
        },
    },
    {
        "id": "correa_ventilador",
        "esperado": "4010.39.00.900E",
        "variantes": {
            "completa": "Correa del ventilador del motor diesel Cummins, correa de transmision trapezoidal, repuesto suelto",
            "ruido": "Correa ventilador • V-belt • Cummins diesel • fan drive belt • hincadora spare • seccion perfil no especificado • import repuesto",
            "minima": "correa ventilador motor diesel",
        },
    },
    {
        "id": "bomba_aceite",
        "esperado": "8413.30.30.000U",
        "variantes": {
            "completa": "Bomba de aceite para motor diesel Cummins, repuesto suelto, bomba lubricante",
            "ruido": "Bomba aceite • oil pump • Cummins QSB • motor hincadora • gear type • OEM replacement • import repuesto",
            "minima": "bomba aceite motor diesel",
        },
    },
    {
        "id": "filtro_combustible",
        "esperado": "8421.23.00.000V",
        "variantes": {
            "completa": "Filtro de combustible para motor diesel Cummins, repuesto suelto, filtro carburante",
            "ruido": "Filtro combustible • fuel filter • diesel Cummins • water separator • spin-on • hincadora repuesto • import",
            "minima": "filtro combustible motor diesel",
        },
    },
    {
        "id": "amortiguador_ciguenal",
        "esperado": "8409.99.99.300V",
        "variantes": {
            "completa": "Amortiguador de vibraciones torsional del cigüeñal, motor diesel de encendido por compresion, repuesto suelto",
            "ruido": "Amortiguador torsional • viscous damper • crankshaft • Cummins diesel • fluid viscous • hincadora motor spare",
            "minima": "amortiguador vibraciones cigüeñal motor diesel",
        },
    },
]


def norm_ncm(c: str) -> str:
    return re.sub(r"[^0-9A-Za-z]", "", (c or "").upper())


def pref8(c: str) -> str:
    d = norm_ncm(c)
    return d[:8] if len(d) >= 8 else d


def api(cookie_jar: str, path: str, body=None) -> dict:
    cmd = ["curl", "-s", "-b", cookie_jar, "-c", cookie_jar]
    if body is not None:
        cmd += ["-X", "POST", "-H", "Content-Type: application/json", "-d", json.dumps(body)]
    else:
        cmd += ["-X", "GET"]
    cmd.append(f"{BASE}{path}")
    return json.loads(subprocess.check_output(cmd, text=True))


def clasificar(producto: str, auto_primera: bool = True) -> dict:
    jar = tempfile.NamedTemporaryFile(delete=False, suffix=".cookies").name
    login = api(jar, "/api/auth/login", {"identifier": "admin", "password": "admin"})
    if "error" in login and "user" not in login:
        return {"error": "login", "detail": login}

    respuestas: List[dict] = []
    for paso in range(1, MAX_PASOS + 1):
        body = {"producto": producto}
        if respuestas:
            body["respuestas"] = respuestas
        res = api(jar, "/api/clasificar", body).get("resultado", {})
        if res.get("ncm"):
            return {
                "ncm": res.get("ncm"),
                "pasos": paso,
                "decision": res.get("decision"),
                "partida": res.get("partida"),
                "preguntas": len(respuestas),
            }
        if res.get("decision") == "SIN_RESULTADO":
            return {"ncm": None, "pasos": paso, "decision": "SIN_RESULTADO", "preguntas": len(respuestas)}

        qs = res.get("preguntas") or []
        if not qs:
            return {"ncm": None, "pasos": paso, "decision": res.get("decision"), "preguntas": len(respuestas)}

        q = qs[0]
        opciones = q.get("opciones") or []
        if not auto_primera or not opciones:
            return {
                "ncm": None,
                "pasos": paso,
                "decision": "NEEDS_AI",
                "pregunta": q.get("pregunta"),
                "opciones": opciones,
                "preguntas": len(respuestas),
            }
        respuestas.append({"pregunta": q["pregunta"], "opcion": opciones[0]})

    return {"ncm": None, "pasos": MAX_PASOS, "decision": "MAX_PASOS", "preguntas": len(respuestas)}


def evaluar(esperado: str, obtenido: Optional[str]) -> str:
    if not obtenido:
        return "FAIL"
    e, o = norm_ncm(esperado), norm_ncm(obtenido)
    if e == o:
        return "EXACT"
    if pref8(esperado) == pref8(obtenido):
        return "PREF8"
    if e[:4] == o[:4]:
        return "PARTIDA"
    return "FAIL"


def main() -> int:
    resultados = []
    print(f"{'CASO':<22} {'VAR':<8} {'RESULT':<7} {'NCM':<22} {'ESP':<22} {'PASOS'}")
    print("-" * 95)

    for caso in CASOS:
        for var, texto in caso["variantes"].items():
            r = clasificar(texto, auto_primera=True)
            ncm = r.get("ncm")
            status = evaluar(caso["esperado"], ncm)
            resultados.append({**caso, "variante": var, "status": status, **r})
            ncm_s = ncm or r.get("decision", "?")
            print(
                f"{caso['id']:<22} {var:<8} {status:<7} {str(ncm_s):<22} "
                f"{caso['esperado']:<22} {r.get('pasos', '?')}"
            )
            if r.get("pregunta") and not ncm:
                print(f"  └─ pregunta: {r['pregunta'][:80]}...")

    exact = sum(1 for r in resultados if r["status"] == "EXACT")
    pref8 = sum(1 for r in resultados if r["status"] == "PREF8")
    partida = sum(1 for r in resultados if r["status"] == "PARTIDA")
    fail = sum(1 for r in resultados if r["status"] == "FAIL")
    total = len(resultados)

    print("-" * 95)
    print(f"EXACT: {exact}/{total} | PREF8: {pref8}/{total} | PARTIDA: {partida}/{total} | FAIL: {fail}/{total}")

    # Resumen por caso
    print("\nPor caso:")
    for caso in CASOS:
        rs = [r for r in resultados if r["id"] == caso["id"]]
        statuses = [r["status"] for r in rs]
        print(f"  {caso['id']}: {statuses} → esperado {caso['esperado']}")

    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
