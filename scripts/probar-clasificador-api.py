#!/usr/bin/env python3
"""
Prueba el clasificador vía API local.

Uso:
  python3 scripts/probar-clasificador-api.py "descripción del producto"
  python3 scripts/probar-clasificador-api.py "producto" --auto-primera   # smoke: elige 1ª opción
  python3 scripts/probar-clasificador-api.py "producto" --resp="pregunta|opción"  # repetible
"""
import json
import re
import subprocess
import sys
import tempfile
from typing import List, Optional

BASE = "http://localhost:3000"
MAX = 12
PREGUNTA_NCM_MAQUINA_PADRE = (
    "¿Cuál es la posición NCM de la máquina o aparato al que corresponde este artículo?"
)


def extraer_ncm_de_texto(texto: str) -> Optional[str]:
    m = re.search(r"\b(\d{4}(?:\.\d{2}){0,3}(?:\.\d{3})?[A-Za-z]?)\b", texto or "")
    if not m:
        return None
    if len(re.sub(r"\D", "", m.group(1))) >= 6:
        return m.group(1).strip()
    return None


def contexto_maquina_desde_respuestas(respuestas: List[dict]) -> dict:
    ncm = None
    equipo = None
    for r in respuestas:
        if (r.get("pregunta") or "").strip() != PREGUNTA_NCM_MAQUINA_PADRE:
            continue
        op = (r.get("opcion") or "").strip()
        n = extraer_ncm_de_texto(op)
        if n:
            ncm = n
        elif op:
            equipo = op
    out = {}
    if ncm:
        out["ncmMaquina"] = ncm
    if equipo:
        out["equipoReferencia"] = equipo
    return out


def parse_args():
    argv = sys.argv[1:]
    producto = argv[0] if argv else "zapatillas de cuero"
    auto_primera = "--auto-primera" in argv
    respuestas_fijas: List[dict] = []
    for a in argv:
        if a.startswith("--resp="):
            pair = a.split("=", 1)[1]
            pregunta, opcion = pair.split("|", 1)
            respuestas_fijas.append({"pregunta": pregunta, "opcion": opcion})
    return producto, auto_primera, respuestas_fijas


def api(cookie_jar: str, path: str, body=None) -> dict:
    cmd = ["curl", "-s", "-b", cookie_jar, "-c", cookie_jar]
    if body is not None:
        cmd += ["-X", "POST", "-H", "Content-Type: application/json", "-d", json.dumps(body)]
    else:
        cmd += ["-X", "GET"]
    cmd.append(f"{BASE}{path}")
    return json.loads(subprocess.check_output(cmd, text=True))


def norm_pregunta(p: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (p or "").lower()).strip()


def main() -> int:
    producto, auto_primera, respuestas_fijas = parse_args()
    jar = tempfile.NamedTemporaryFile(delete=False, suffix=".cookies").name
    login = api(jar, "/api/auth/login", {"identifier": "admin", "password": "admin"})
    if "error" in login and "user" not in login:
        print("Login falló:", login)
        return 1

    respuestas: List[dict] = []
    fijas_por_pregunta = {norm_pregunta(r["pregunta"]): r["opcion"] for r in respuestas_fijas}
    for paso in range(1, MAX + 1):
        body = {"producto": producto}
        if respuestas:
            body["respuestas"] = respuestas
        body.update(contexto_maquina_desde_respuestas(respuestas))
        res = api(jar, "/api/clasificar", body).get("resultado", {})
        print(f"\n{'='*60}\nPASO {paso} — {producto}")
        print("decision:", res.get("decision"))
        if res.get("partidasEnJuego"):
            print("partidasEnJuego:", ", ".join(res["partidasEnJuego"]))
        if res.get("posicionesEnMira"):
            print("posicionesEnMira:")
            for pm in res["posicionesEnMira"]:
                print(f"  - {pm.get('ncm')} | {pm.get('motivo') or pm.get('descripcion', '')[:60]}")
        if res.get("partida"):
            print("partida:", res.get("partida"), "-", (res.get("partidaDesc") or "")[:80])
        if res.get("ncm"):
            print("NCM:", res.get("ncm"), "| DI:", res.get("derecho"), "| IVA:", res.get("iva"))
        ctx_ncm = body.get("ncmMaquina")
        if ctx_ncm:
            print("ncmMaquina:", ctx_ncm)
        if res.get("descripcion"):
            print("descripcion:", res.get("descripcion"))
        if res.get("justificacion"):
            print("justificacion:", res.get("justificacion"))
        if res.get("fasePregunta"):
            print("fase:", res.get("fasePregunta"))

        qs = res.get("preguntas") or []
        if not qs:
            if res.get("ncm"):
                print("\n✓ CERRÓ con NCM completa")
                return 0
            if res.get("decision") == "SIN_RESULTADO":
                print("\n✗ SIN RESULTADO")
                return 1
            print("\n? Sin pregunta ni NCM")
            return 2

        q = qs[0]
        print("\nPREGUNTA:", q["pregunta"])
        opciones = q.get("opciones") or []
        for i, op in enumerate(opciones):
            print(f"  [{i + 1}] {op}")

        if not auto_primera and not fijas_por_pregunta:
            print("\n[STOP] Respondé manualmente o usá --auto-primera / --resp=pregunta|opción")
            return 2

        clave = norm_pregunta(q["pregunta"])
        if clave in fijas_por_pregunta:
            opcion = fijas_por_pregunta.pop(clave)
            print("\n>> (resp fija)", opcion)
        elif auto_primera:
            if not opciones:
                print("\n✗ Pregunta sin opciones")
                return 1
            opcion = opciones[0]
            print("\n>> (auto-primera)", opcion)
        else:
            print("\n[STOP] Sin respuesta fija para esta pregunta")
            return 2

        respuestas.append({"pregunta": q["pregunta"], "opcion": opcion})
        ruta = next(
            (r for r in (q.get("rutas") or []) if r.get("opcion") == opcion),
            None,
        )
        if ruta and ruta.get("consecuencia"):
            respuestas[-1]["consecuencia"] = ruta["consecuencia"]

    print("\n✗ Máximo de pasos sin NCM")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
