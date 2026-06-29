#!/usr/bin/env python3
"""
run.py — Levanta la web del estudio de despachantes en un servidor local.

Uso:
    python3 run.py                # http://localhost:3000
    python3 run.py --port 4000    # otro puerto
    python3 run.py --prod         # build + start (modo producción)
    python3 run.py --no-open      # no abrir el navegador automáticamente

Su única función es iniciar el servidor local de la aplicación Next.js.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

RAIZ = Path(__file__).resolve().parent


def log(msg: str) -> None:
    print(f"  {msg}", flush=True)


def buscar_npm() -> str:
    npm = shutil.which("npm")
    if not npm:
        print(
            "\n  [ERROR] No se encontró 'npm'.\n"
            "  Instalá Node.js (incluye npm) desde https://nodejs.org y reintentá.\n",
            file=sys.stderr,
        )
        sys.exit(1)
    return npm


def instalar_dependencias(npm: str) -> None:
    if (RAIZ / "node_modules").is_dir():
        return
    log("Instalando dependencias por primera vez (npm install)...")
    resultado = subprocess.run([npm, "install"], cwd=RAIZ)
    if resultado.returncode != 0:
        print("\n  [ERROR] Falló 'npm install'.\n", file=sys.stderr)
        sys.exit(resultado.returncode)


def abrir_navegador(url: str) -> None:
    def _abrir() -> None:
        time.sleep(2.5)
        try:
            webbrowser.open(url)
        except Exception:
            pass

    threading.Thread(target=_abrir, daemon=True).start()


def main() -> int:
    parser = argparse.ArgumentParser(description="Levanta la web en un host local.")
    parser.add_argument("--host", default="localhost", help="Host (default: localhost)")
    parser.add_argument("--port", default="3000", help="Puerto (default: 3000)")
    parser.add_argument("--prod", action="store_true", help="Modo producción (build + start)")
    parser.add_argument("--no-open", action="store_true", help="No abrir el navegador")
    args = parser.parse_args()

    npm = buscar_npm()
    instalar_dependencias(npm)

    url = f"http://{args.host}:{args.port}"

    env = os.environ.copy()
    env["PORT"] = str(args.port)

    print("\n" + "=" * 52)
    print("   Estudio de Despachantes · Comercio Exterior")
    print("=" * 52)
    log(f"Servidor local:  {url}")
    log(f"Modo:            {'producción' if args.prod else 'desarrollo'}")
    log("Cortar con:      Ctrl + C")
    print("=" * 52 + "\n")

    if args.prod:
        log("Compilando la aplicación (npm run build)...")
        build = subprocess.run([npm, "run", "build"], cwd=RAIZ, env=env)
        if build.returncode != 0:
            return build.returncode
        comando = [npm, "run", "start", "--", "-H", args.host, "-p", str(args.port)]
    else:
        comando = [npm, "run", "dev", "--", "-H", args.host, "-p", str(args.port)]

    if not args.no_open:
        abrir_navegador(url)

    try:
        return subprocess.run(comando, cwd=RAIZ, env=env).returncode
    except KeyboardInterrupt:
        print("\n  Servidor detenido. ¡Hasta luego!\n")
        return 0


if __name__ == "__main__":
    sys.exit(main())
