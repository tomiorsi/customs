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


def instalar_dependencias_python() -> None:
    req = RAIZ / "requirements.txt"
    if not req.is_file():
        return

    venv_python = RAIZ / ".venv" / "bin" / "python3"
    if not venv_python.is_file():
        log("Creando entorno Python del proyecto (.venv)...")
        r = subprocess.run([sys.executable, "-m", "venv", str(RAIZ / ".venv")], cwd=RAIZ)
        if r.returncode != 0:
            print("\n  [ERROR] No se pudo crear .venv (¿python3-venv instalado?).\n", file=sys.stderr)
            sys.exit(r.returncode)

    pip_marker = RAIZ / ".venv" / ".pip-upgraded"
    if not pip_marker.is_file():
        log("Actualizando pip del entorno del proyecto...")
        r = subprocess.run(
            [str(venv_python), "-m", "pip", "install", "--upgrade", "pip"],
            cwd=RAIZ,
        )
        if r.returncode == 0:
            pip_marker.write_text("ok\n", encoding="utf-8")
        else:
            print(
                "\n  [WARN] No se pudo actualizar pip en .venv. Continúo con la versión actual.\n",
                file=sys.stderr,
            )

    pip = RAIZ / ".venv" / "bin" / "pip"
    marker = RAIZ / ".venv" / ".requirements-installed"
    if not marker.is_file():
        log("Instalando dependencias Python (requirements.txt)...")
        log("  (PyMuPDF + EasyOCR; puede tardar varios minutos la primera vez)")
        r = subprocess.run([str(pip), "install", "-r", str(req)], cwd=RAIZ)
        if r.returncode != 0:
            print("\n  [ERROR] Falló 'pip install -r requirements.txt'.\n", file=sys.stderr)
            sys.exit(r.returncode)
        marker.write_text("ok\n", encoding="utf-8")

    setup = RAIZ / "scripts" / "setup_python_deps.py"
    if setup.is_file():
        subprocess.run([str(venv_python), str(setup)], cwd=RAIZ, check=False)


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
    instalar_dependencias_python()

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
