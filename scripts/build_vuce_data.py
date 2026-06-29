#!/usr/bin/env python3
"""
Descarga datos oficiales de la CICE/VUCE y los guarda en parquet locales.

Fuentes:
  - API pública: https://qa.ci.vuce.gob.ar
  - Medidas antidumping embebidas en MedidasDumping81339.js

Genera en data/VUCE/:
  - antidumping_vigentes.parquet
  - posicion_detalle.parquet
  - tributacion.parquet
  - intervenciones.parquet
  - tramites.parquet
  - cnce_medidas.parquet
  - cnce_historico.parquet
  - checkpoint.json
  - meta.json

Uso:
    python3 scripts/build_vuce_data.py --limit 5
    python3 scripts/build_vuce_data.py
    python3 scripts/build_vuce_data.py --resume
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
NCM = ROOT / "data" / "Nomenclatura" / "ncm.parquet"
OUT = ROOT / "data" / "VUCE"
CHECKPOINT = OUT / "checkpoint.json"
META = OUT / "meta.json"

API_BASE = "https://qa.ci.vuce.gob.ar"
DUMPING_JS = "https://www.vuce.gob.ar/MedidasDumping81339.js"
AUTH_EMAIL = "vuce@vuce.gob.ar"

DEFAULT_DELAY = 0.05
DEFAULT_WORKERS = 6
REQUEST_TIMEOUT = 15
FLUSH_EVERY = 200
CHUNK_SIZE = 80  # posiciones en vuelo (evita colgar 42k futures)

_tls = threading.local()


def get_thread_client(delay: float) -> "VuceClient":
    c = getattr(_tls, "client", None)
    if c is None:
        c = VuceClient(delay=delay)
        _tls.client = c
    return c


def es_sim_posicion(posicion: str) -> bool:
    """Intervenciones/trámites/CNCE exigen posición SIM (sufijo alfabético)."""
    return len(posicion) >= 11 and posicion[-1].isalpha()


def render_bar(done: int, total: int, started: float, processed: int | None = None) -> None:
    elapsed = time.time() - started
    frac = done / total if total else 0
    width = 32
    fill = int(width * frac)
    bar = "█" * fill + "·" * (width - fill)
    basis = processed if processed is not None else done
    rate = basis / elapsed if elapsed > 0 else 0
    eta = (total - done) / rate if rate > 0 else 0
    eta_h = int(eta // 3600)
    eta_m = int((eta % 3600) // 60)
    sys.stdout.write(
        f"\r[{bar}] {frac*100:5.1f}%  {done:>6}/{total}  "
        f"{rate:4.1f} pos/s  ETA {eta_h:d}h{eta_m:02d}m   "
    )
    sys.stdout.flush()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def posicion_api(codigo: str) -> str:
    """Convierte '8504.10.00.110Z' -> '85041000110Z'."""
    return (codigo or "").replace(".", "").strip()


class VuceClient:
    def __init__(self, delay: float = DEFAULT_DELAY) -> None:
        self.delay = delay
        self.token: str | None = None
        self.token_exp: float = 0.0

    def _sleep(self) -> None:
        if self.delay > 0:
            time.sleep(self.delay)

    def auth(self) -> str:
        if self.token and time.time() < self.token_exp - 300:
            return self.token
        payload = json.dumps({"email": AUTH_EMAIL}).encode("utf-8")
        req = urllib.request.Request(
            f"{API_BASE}/auth/generate",
            data=payload,
            method="POST",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Origin": "https://www.vuce.gob.ar",
                "Referer": "https://www.vuce.gob.ar/",
                "User-Agent": "DESPACHANTE-build-vuce/1.0",
            },
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            obj = json.loads(resp.read().decode("utf-8"))
        token = obj.get("data")
        if not token:
            raise RuntimeError(f"No se pudo obtener token VUCE: {obj}")
        self.token = token
        self.token_exp = time.time() + 23 * 3600
        return token

    def get_json(self, path: str, params: dict[str, Any] | None = None) -> Any:
        query = urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v is not None})
        url = f"{API_BASE}{path}" + (f"?{query}" if query else "")
        max_intentos = 6
        for intento in range(max_intentos):
            self.auth()
            req = urllib.request.Request(
                url,
                method="GET",
                headers={
                    "Accept": "application/json",
                    "Origin": "https://www.vuce.gob.ar",
                    "Referer": "https://www.vuce.gob.ar/",
                    "x-api-key": self.token or "",
                    "User-Agent": "DESPACHANTE-build-vuce/1.0",
                },
            )
            self._sleep()
            try:
                with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                body = e.read().decode("utf-8", errors="replace")
                if e.code == 401 and intento == 0:
                    self.token = None
                    continue
                # Rate-limit: esperar (backoff exponencial) y reintentar.
                if e.code == 429 and intento < max_intentos - 1:
                    espera = min(2 ** intento, 20)
                    time.sleep(espera)
                    continue
                raise RuntimeError(f"HTTP {e.code} {path}: {body[:300]}") from e
            except (TimeoutError, urllib.error.URLError) as e:
                if intento < max_intentos - 1:
                    time.sleep(1.5 * (intento + 1))
                    continue
                raise RuntimeError(f"TIMEOUT {path}: {e}") from e
        raise RuntimeError(f"No se pudo consultar {path}")


def load_positions(limit: int | None = None, solo_sim: bool = False) -> pd.DataFrame:
    df = pd.read_parquet(NCM, columns=["codigo", "codigo_num", "nivel", "descripcion"])
    niveles = ["sim"] if solo_sim else ["sim", "ncm"]
    df = df[df["nivel"].isin(niveles)].copy()
    df["posicion"] = df["codigo"].map(posicion_api)
    df = df[df["posicion"].str.len() >= 8]
    df = df.drop_duplicates(subset=["posicion"]).sort_values("posicion")
    if limit:
        df = df.head(limit)
    return df.reset_index(drop=True)


def load_checkpoint(positions: pd.DataFrame) -> set[str]:
    done: set[str] = set()
    if CHECKPOINT.exists():
        try:
            data = json.loads(CHECKPOINT.read_text(encoding="utf-8"))
            done.update(data.get("done", []))
        except json.JSONDecodeError:
            pass
    detalle = OUT / "posicion_detalle.parquet"
    if detalle.exists():
        try:
            df = pd.read_parquet(detalle, columns=["posicion"])
            done.update(df["posicion"].astype(str).tolist())
        except Exception:
            pass
    return done


def save_checkpoint(done: set[str], total: int) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    CHECKPOINT.write_text(
        json.dumps(
            {
                "updated_at": utc_now(),
                "done_count": len(done),
                "total": total,
                "done": sorted(done),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def append_rows(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    OUT.mkdir(parents=True, exist_ok=True)
    df_new = pd.DataFrame(rows)
    # Evita errores pyarrow al mezclar int/str/None entre lotes.
    for col in df_new.columns:
        if col == "raw_json":
            continue
        df_new[col] = df_new[col].map(lambda v: None if v is None else str(v))
    if path.exists():
        df_old = pd.read_parquet(path)
        for col in df_old.columns:
            if col == "raw_json":
                continue
            df_old[col] = df_old[col].map(lambda v: None if v is None else str(v))
        df = pd.concat([df_old, df_new], ignore_index=True)
        dedupe_cols = [c for c in ["posicion", "endpoint", "row_id"] if c in df.columns]
        if dedupe_cols:
            df = df.drop_duplicates(subset=dedupe_cols, keep="last")
    else:
        df = df_new
    df.to_parquet(path, compression="snappy", index=False)


def flatten_posicion_detalle(posicion: str, payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    data = payload.get("data")
    if not data:
        return None
    item = data[0] if isinstance(data, list) and data else data
    if isinstance(item, dict) and "0" in item and isinstance(item.get("2"), dict):
        item = item["2"]
    if not isinstance(item, dict):
        return {"posicion": posicion, "raw_json": json.dumps(payload, ensure_ascii=False)}
    return {
        "posicion": posicion,
        "posicion_fmt": item.get("posicion") or item.get("pos"),
        "descripcion": item.get("descripcion"),
        "unidad": item.get("unidad"),
        "aec": item.get("aec") or item.get("arancel_externo_comun"),
        "die": item.get("derechos_importacion_extrazona"),
        "dii": item.get("derechos_importacion_intrazona"),
        "la": item.get("la"),
        "dumping_flag": item.get("dumping"),
        "actualizado": item.get("actualizado"),
        "raw_json": json.dumps(item, ensure_ascii=False),
    }


def flatten_tributacion(posicion: str, payload: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        return rows
    for i, item in enumerate(data):
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "posicion_query": posicion,
                "posicion": item.get("posicion"),
                "operacion": item.get("operacion"),
                "cluster": item.get("cluster"),
                "subcluster": item.get("subcluster"),
                "descripcion": item.get("descripcion"),
                "valor": item.get("valor"),
                "row_id": f"{posicion}:{i}:{item.get('cluster')}:{item.get('descripcion')}",
            }
        )
    return rows


def flatten_intervenciones(posicion: str, payload: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        return rows
    for item in data:
        if not isinstance(item, dict):
            continue
        org = item.get("organismo") or {}
        reg = item.get("regimen") or {}
        rows.append(
            {
                "posicion": posicion,
                "intervencion_id": item.get("id"),
                "organismo_id": org.get("id"),
                "organismo": org.get("nombre"),
                "regimen_id": reg.get("id"),
                "regimen": reg.get("descripcion"),
                "resumen": reg.get("resumen"),
                "tipo_intervencion": item.get("tipo_intervencion"),
                "tipo_destinacion": item.get("tipo_destinacion"),
                "estado_mercaderia": item.get("estado_mercaderia"),
                "validada": item.get("validada"),
                "activa": item.get("activa"),
                "raw_json": json.dumps(item, ensure_ascii=False),
                "row_id": f"{posicion}:interv:{item.get('id')}",
            }
        )
    return rows


def flatten_tramites(posicion: str, payload: Any) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        return rows
    for item in data:
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "posicion": posicion,
                "tramite_id": item.get("tramite_id"),
                "nro_trata": item.get("nro_trata"),
                "nombre": item.get("nombre"),
                "organismo_id": item.get("organismo"),
                "organismo": item.get("nombre_organismo"),
                "descripcion": item.get("descripcion"),
                "resumen": item.get("resumen"),
                "link_tramite": item.get("link_tramite"),
                "plataforma": item.get("plataforma"),
                "intervencion_id": item.get("intervencion_id"),
                "row_id": f"{posicion}:tramite:{item.get('tramite_id')}:{item.get('intervencion_id')}",
            }
        )
    return rows


def flatten_cnce(posicion: str, payload: Any, endpoint: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        return rows
    for i, item in enumerate(data):
        rows.append(
            {
                "posicion": posicion,
                "endpoint": endpoint,
                "row_id": f"{posicion}:{endpoint}:{i}",
                "raw_json": json.dumps(item, ensure_ascii=False),
            }
        )
    return rows


def download_antidumping_bulk(client: VuceClient) -> pd.DataFrame:
    req = urllib.request.Request(
        DUMPING_JS,
        headers={"User-Agent": "DESPACHANTE-build-vuce/1.0"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        js = resp.read().decode("utf-8", errors="replace")
    m = re.search(r"JSON\.parse\('(\[.*?\])'\)", js, re.S)
    if not m:
        raise RuntimeError("No se encontró JSON de antidumping en MedidasDumping81339.js")
    raw = m.group(1).encode("utf-8").decode("unicode_escape")
    data = json.loads(raw)
    df = pd.DataFrame(data)
    OUT.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OUT / "antidumping_vigentes.parquet", compression="snappy", index=False)
    return df


def process_position(client: VuceClient, posicion: str) -> dict[str, list[dict[str, Any]]]:
    out = {
        "posicion_detalle": [],
        "tributacion": [],
        "intervenciones": [],
        "tramites": [],
        "cnce_medidas": [],
        "cnce_historico": [],
    }
    params_i = {"posicion": posicion, "operacion": "I"}

    def safe(path: str, params: dict[str, Any] | None = None) -> Any:
        """Tolera respuestas inválidas en endpoints que exigen posición SIM."""
        try:
            return client.get_json(path, params)
        except RuntimeError as e:
            msg = str(e)
            if "HTTP 400" in msg and "SIM" in msg:
                return None
            if "HTTP 500" in msg and (
                path.startswith("/comex/")
                or path.startswith("/cnce/")
                or path.startswith("/cice/")
            ):
                return None
            if msg.startswith("TIMEOUT"):
                return None
            raise

    det = safe(f"/cice/posicion/{urllib.parse.quote(posicion)}")
    row = flatten_posicion_detalle(posicion, det)
    if row:
        out["posicion_detalle"].append(row)
    else:
        # Marca la posición como vista aunque la VUCE no devuelva detalle,
        # para no reintentarla en cada --resume.
        out["posicion_detalle"].append({"posicion": posicion, "raw_json": None})

    trib = safe("/tributaciones/obtenerOperacion", params_i)
    out["tributacion"].extend(flatten_tributacion(posicion, trib))

    if es_sim_posicion(posicion):
        inter = safe("/comex/intervenciones/posicion", {**params_i, "tipoRegimen": 1})
        out["intervenciones"].extend(flatten_intervenciones(posicion, inter))

        tram = safe("/comex/tramites", params_i)
        out["tramites"].extend(flatten_tramites(posicion, tram))

        med = safe("/cnce/medidas", params_i)
        out["cnce_medidas"].extend(flatten_cnce(posicion, med, "cnce/medidas"))

        hist = safe("/cnce/getAllMedidasAplicadasHistorico", params_i)
        out["cnce_historico"].extend(flatten_cnce(posicion, hist, "cnce/historico"))

    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Descarga datos VUCE/CICE a parquet")
    parser.add_argument("--limit", type=int, default=None, help="Limitar cantidad de posiciones")
    parser.add_argument("--solo-sim", action="store_true", help="Solo posiciones SIM")
    parser.add_argument("--resume", action="store_true", help="Continuar desde checkpoint")
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY, help="Pausa entre requests")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="Hilos concurrentes")
    parser.add_argument("--skip-antidumping", action="store_true", help="No descargar tabla bulk de dumping")
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)

    print("== VUCE ingest ==")
    if not args.skip_antidumping:
        print("Descargando antidumping vigente (bulk)...")
        df_dump = download_antidumping_bulk(VuceClient(delay=args.delay))
        print(f"  antidumping_vigentes.parquet filas={len(df_dump)}")

    positions = load_positions(limit=args.limit, solo_sim=args.solo_sim)
    done = load_checkpoint(positions) if args.resume else set()
    pending = [p for p in positions["posicion"].tolist() if p not in done]
    total = len(positions)
    print(
        f"Posiciones: {len(pending)} pendientes / {total} totales "
        f"({len(done)} ya hechas) · {args.workers} hilos · timeout {REQUEST_TIMEOUT}s",
        flush=True,
    )
    if not pending:
        print("Nada pendiente. Listo.")
        return

    started = time.time()
    lock = threading.Lock()
    batch: dict[str, list[dict[str, Any]]] = {
        "posicion_detalle": [],
        "tributacion": [],
        "intervenciones": [],
        "tramites": [],
        "cnce_medidas": [],
        "cnce_historico": [],
    }

    def flush() -> None:
        append_rows(OUT / "posicion_detalle.parquet", batch["posicion_detalle"])
        append_rows(OUT / "tributacion.parquet", batch["tributacion"])
        append_rows(OUT / "intervenciones.parquet", batch["intervenciones"])
        append_rows(OUT / "tramites.parquet", batch["tramites"])
        append_rows(OUT / "cnce_medidas.parquet", batch["cnce_medidas"])
        append_rows(OUT / "cnce_historico.parquet", batch["cnce_historico"])
        for key in batch:
            batch[key] = []
        save_checkpoint(done, total)

    processed = 0
    errors = 0
    chunk = max(CHUNK_SIZE, args.workers * 4)

    def run_one(posicion: str) -> dict[str, list[dict[str, Any]]]:
        return process_position(get_thread_client(args.delay), posicion)

    try:
        for offset in range(0, len(pending), chunk):
            slice_ = pending[offset : offset + chunk]
            with ThreadPoolExecutor(max_workers=args.workers) as pool:
                futures = {pool.submit(run_one, p): p for p in slice_}
                for fut in as_completed(futures):
                    posicion = futures[fut]
                    try:
                        rows = fut.result()
                    except Exception as e:
                        errors += 1
                        if errors <= 20:
                            sys.stdout.write(f"\nERROR {posicion}: {e}\n")
                        rows = None
                    with lock:
                        if rows is not None:
                            for key in batch:
                                batch[key].extend(rows[key])
                            done.add(posicion)
                        processed += 1
                        if processed % FLUSH_EVERY == 0:
                            flush()
                        if processed % 10 == 0 or processed == len(pending):
                            render_bar(len(done), total, started, processed)
            with lock:
                flush()
                render_bar(len(done), total, started, processed)
    except KeyboardInterrupt:
        with lock:
            flush()
        print("\nInterrumpido. Progreso guardado (usá --resume para continuar).")
        return
    print(f"\nProcesadas {processed} posiciones, {errors} errores.")

    META.write_text(
        json.dumps(
            {
                "updated_at": utc_now(),
                "api_base": API_BASE,
                "positions_total": total,
                "positions_done": len(done),
                "solo_sim": args.solo_sim,
                "files": [
                    "antidumping_vigentes.parquet",
                    "posicion_detalle.parquet",
                    "tributacion.parquet",
                    "intervenciones.parquet",
                    "tramites.parquet",
                    "cnce_medidas.parquet",
                    "cnce_historico.parquet",
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print("OK - parquets VUCE generados en", OUT)


if __name__ == "__main__":
    main()
