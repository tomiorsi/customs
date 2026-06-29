#!/usr/bin/env python3
"""
Construye el corpus de NORMAS de fondo (Capa 1: núcleo estable), estructurado
por artículo, listo para colgar del motor (igual que el nomenclador NCM).

Fuentes oficiales:
  1) Código Aduanero (Ley 22.415) - texto actualizado
     InfoLEG, índice + ~29 subarchivos por Sección/Título (HTML).
  2) Acuerdo de Valoración OMC (art. VII GATT), incorporado por Ley 24.425
     InfoLEG, Anexo J (HTML, 24 artículos).
  3) Régimen de Origen MERCOSUR (ROM) - Dec. CMC 05/23, texto ordenado
     POLCOM MERCOSUR. OJO: el sitio está detrás de Cloudflare, no se puede
     bajar con script. Hay que guardarlo a mano UNA vez desde el navegador:
        - Abrir https://polcom.mercosur.int/public/rom/ordenado/origen-2023
        - Guardar como HTML en  data/Normas/rom_origen.html
     El script lo lee de ahí (artículos con encabezado "Artículo N:").

Toda la salida es parquet, en data/Normas/:
  - codigo_aduanero.parquet
  - valoracion_omc.parquet
  - rom_mercosur.parquet   (si está el HTML local)
  - normas.parquet         (las tres unidas)
  - meta.parquet           (resumen del build: filas por norma, fuentes, fecha)

Uso:
    python3 scripts/build_normas.py            # las tres (ROM si hay HTML local)
    python3 scripts/build_normas.py --solo ca  # solo código aduanero
    python3 scripts/build_normas.py --solo valoracion
    python3 scripts/build_normas.py --solo rom
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "Normas"
INDICE_PATH = OUT / "normas_indice.json"

UA = "Mozilla/5.0 (DESPACHANTE-build-normas/1.0)"
REQUEST_TIMEOUT = 60

# --- Código Aduanero ---------------------------------------------------------
CA_BASE = "https://servicios.infoleg.gob.ar/infolegInternet/anexos/15000-19999/16536/"
CA_INDEX = CA_BASE + "texact.htm"

# --- Acuerdo de Valoración OMC -----------------------------------------------
VAL_URL = "https://servicios.infoleg.gob.ar/infolegInternet/anexos/0-4999/799/l24425-12.htm"

# --- ROM MERCOSUR ------------------------------------------------------------
ROM_URL = "https://polcom.mercosur.int/public/rom/ordenado/origen-2023"
ROM_LOCAL = OUT / "rom_origen.html"


# ---------------------------------------------------------------------------
# Barra de progreso única (global a todo el build)
# ---------------------------------------------------------------------------
class Progress:
    def __init__(self, total: int) -> None:
        self.total = max(total, 1)
        self.done = 0
        self.started = time.time()
        self._notas: list[str] = []

    def step(self, etiqueta: str) -> None:
        self.done += 1
        self._render(etiqueta)

    def nota(self, msg: str) -> None:
        """Mensaje para imprimir al final (no rompe la barra)."""
        self._notas.append(msg)

    def _render(self, etiqueta: str) -> None:
        frac = self.done / self.total
        width = 30
        fill = int(width * frac)
        barra = "█" * fill + "·" * (width - fill)
        elapsed = time.time() - self.started
        rate = self.done / elapsed if elapsed > 0 else 0
        eta = (self.total - self.done) / rate if rate > 0 else 0
        sys.stdout.write(
            f"\r[{barra}] {frac*100:5.1f}%  {self.done:>3}/{self.total}  "
            f"ETA {int(eta):>3}s  {etiqueta:<38.38}"
        )
        sys.stdout.flush()

    def finish(self) -> None:
        sys.stdout.write("\n")
        sys.stdout.flush()
        for n in self._notas:
            print(n)


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        return resp.read()


def decode_html(raw: bytes) -> str:
    """InfoLEG es windows-1252; ROM guardado suele ser utf-8. Probamos ambos."""
    for enc in ("utf-8", "cp1252", "latin1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin1", errors="replace")


def es_cloudflare(text: str) -> bool:
    return "Just a moment" in text or "challenge-platform" in text


def to_text(raw_html: str) -> str:
    """HTML -> texto plano: saca <script>/<style>, tags, entidades y espacios."""
    t = re.sub(r"(?is)<script.*?</script>", " ", raw_html)
    t = re.sub(r"(?is)<style.*?</style>", " ", t)
    t = re.sub(r"(?s)<[^>]+>", " ", t)
    t = html.unescape(t)
    t = t.replace("\xa0", " ")
    t = re.sub(r"[ \t\r\n\f\v]+", " ", t)
    return t.strip()


def normalizar(text: str) -> str:
    """Texto para búsqueda: minúsculas, sin acentos, alfanumérico."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^a-z0-9ñ ]+", " ", text.lower())
    return " ".join(text.split())


def _pipe(items: list[str] | None) -> str:
    """Lista → string pipe-separated para parquet."""
    if not items:
        return ""
    return "|".join(str(x).strip() for x in items if str(x).strip())


def cargar_indice_normas() -> dict[tuple[str, str], dict[str, Any]]:
    """Lee data/Normas/normas_indice.json → clave (norma_id, articulo)."""
    if not INDICE_PATH.exists():
        return {}
    data = json.loads(INDICE_PATH.read_text(encoding="utf-8"))
    out: dict[tuple[str, str], dict[str, Any]] = {}
    for entry in data.get("entries", []):
        norma = str(entry.get("norma", "")).strip()
        art = str(entry.get("art", "")).strip()
        if not norma or not art:
            continue
        out[(norma, art)] = entry
    return out


def meta_automatica(row: pd.Series) -> dict[str, Any]:
    """Índice base para artículos sin entrada curada en normas_indice.json."""
    norma_id = str(row.get("norma_id", "")).strip()
    titulo = str(row.get("titulo", "")).strip()
    seccion = str(row.get("seccion", "")).strip()
    titulo_sec = str(row.get("titulo_seccion", "")).strip()
    texto = str(row.get("texto", ""))[:500]

    temas: list[str] = []
    if norma_id == "CA":
        temas = ["codigo_aduanero", "importacion"]
    elif norma_id == "VAL":
        temas = ["valoracion"]
    elif norma_id == "ROM":
        temas = ["origen", "mercosur"]
    if seccion:
        slug = normalizar(seccion).replace(" ", "_")[:36]
        if slug and slug not in temas:
            temas.append(slug)

    keywords: list[str] = []
    for src in (titulo, titulo_sec):
        if src:
            keywords.append(normalizar(src)[:80])
    for w in normalizar(texto).split():
        if len(w) >= 5 and w not in keywords:
            keywords.append(w)
        if len(keywords) >= 14:
            break

    dispara: list[str] = []
    if norma_id == "ROM":
        dispara = ["origen", "pais_mercosur", "certificado_origen"]
    elif norma_id == "VAL":
        dispara = ["valoracion", "factura_comercial", "incoterm"]
    elif norma_id == "CA":
        dispara = ["importacion", "documentacion"]

    return {"temas": temas, "keywords": keywords, "dispara_si": dispara}


def enriquecer_con_indice(df: pd.DataFrame, indice: dict[tuple[str, str], dict[str, Any]]) -> pd.DataFrame:
    """Agrega temas, keywords, dispara_si: curado + automático para TODOS los artículos."""
    temas_col: list[str] = []
    keywords_col: list[str] = []
    dispara_col: list[str] = []
    indice_col: list[str] = []

    for _, row in df.iterrows():
        norma_id = str(row.get("norma_id", ""))
        articulo = str(row.get("articulo", ""))
        meta = indice.get((norma_id, articulo)) or meta_automatica(row)
        temas = meta.get("temas") or []
        keywords = meta.get("keywords") or []
        dispara = meta.get("dispara_si") or []
        temas_col.append(_pipe(temas))
        keywords_col.append(_pipe(keywords))
        dispara_col.append(_pipe(dispara))
        partes = list(temas) + list(keywords) + list(dispara)
        indice_col.append(normalizar(" ".join(str(p) for p in partes)))

    df = df.copy()
    df["temas"] = temas_col
    df["keywords"] = keywords_col
    df["dispara_si"] = dispara_col
    df["texto_indice"] = indice_col
    base_busqueda = df["texto_busqueda"].fillna("").astype(str) if "texto_busqueda" in df.columns else pd.Series([""] * len(df))
    df["texto_busqueda"] = [
        " ".join(p for p in (idx, base) if p).strip()
        for idx, base in zip(indice_col, base_busqueda)
    ]
    return df


def cortar_basura(texto: str, primer_marker: re.Pattern) -> str:
    """Descarta el preámbulo (GA/scripts/menú) hasta el primer artículo real."""
    m = primer_marker.search(texto)
    return texto[m.start():] if m else texto


def derivar_titulo(cuerpo: str) -> str:
    """Mejor esfuerzo: título del artículo = texto antes de que arranque el cuerpo."""
    m = re.match(r"^[:\.\-\s]*([A-ZÁÉÍÓÚÑ][^.\d]{2,70}?)(?=\s+\d|\s+[A-Z][a-z]|\.)", cuerpo)
    if not m:
        return ""
    cand = " ".join(m.group(1).split())
    return cand if 3 <= len(cand) <= 70 else ""


def partir_articulos(
    texto: str, marker: re.Pattern, con_titulo: bool
) -> list[dict[str, Any]]:
    """Corta el texto en artículos según las posiciones de `marker`."""
    hits = list(marker.finditer(texto))
    filas: list[dict[str, Any]] = []
    for i, m in enumerate(hits):
        fin = hits[i + 1].start() if i + 1 < len(hits) else len(texto)
        num = m.group("num")
        suf = (m.group("suf") or "").strip()
        articulo = f"{num} {suf}".strip()
        cuerpo = texto[m.end():fin].strip()
        titulo = derivar_titulo(cuerpo) if con_titulo else ""
        texto_art = (m.group(0).strip() + " " + cuerpo).strip()
        filas.append({
            "articulo": articulo,
            "articulo_num": int(num),
            "titulo": titulo,
            "texto": texto_art,
            "texto_busqueda": normalizar(texto_art),
        })
    return filas


# ---------------------------------------------------------------------------
# 1) Código Aduanero
# ---------------------------------------------------------------------------
# Solo encabezados reales: ARTICULO en mayúsculas (las citas internas van en minúscula).
CA_HEAD = re.compile(r"ART[IÍ]CULO\s+(?P<num>\d+)\s*(?P<suf>BIS|TER|QU[AÁ]TER)?")


def seccion_de_archivo(nombre: str) -> tuple[str, str]:
    if "Titulo_preliminar" in nombre:
        return ("Disposiciones preliminares", "")
    m = re.search(r"S(\d+)_Titulo([IVX]+)", nombre)
    if m:
        return (f"Sección {m.group(1)}", f"Título {m.group(2)}")
    m = re.search(r"S(\d+)\b", nombre)
    if m:
        return (f"Sección {m.group(1)}", "")
    return ("", "")


def ca_listar_archivos() -> list[str]:
    idx = decode_html(fetch(CA_INDEX))
    hrefs = re.findall(r'href="(Ley22415_[^"]+\.htm)"', idx)
    vistos, archivos = set(), []
    for h in hrefs:
        if h in vistos or "antecedentes" in h.lower():
            continue
        vistos.add(h)
        archivos.append(h)
    return archivos


def build_codigo_aduanero(progress: Progress, archivos: list[str]) -> pd.DataFrame:
    filas: list[dict[str, Any]] = []
    for arch in archivos:
        progress.step(f"Código Aduanero · {arch}")
        seccion, titulo_sec = seccion_de_archivo(arch)
        try:
            raw = decode_html(fetch(CA_BASE + arch))
        except Exception as e:  # noqa: BLE001
            progress.nota(f"  ! error {arch}: {e}")
            continue
        texto = cortar_basura(to_text(raw), CA_HEAD)
        encabezado = ""
        m0 = CA_HEAD.search(texto)
        if m0 and m0.start() > 0:
            encabezado = " ".join(texto[: m0.start()].split())[-120:]
        for fila in partir_articulos(texto, CA_HEAD, con_titulo=False):
            fila.update({
                "norma": "Código Aduanero",
                "norma_id": "CA",
                "seccion": seccion,
                "titulo_seccion": titulo_sec or encabezado,
                "fuente_url": CA_BASE + arch,
                "vigencia": "2026-01-26",  # DNU 41/2026 (sustituye arts. 226 y 323)
            })
            filas.append(fila)
        time.sleep(0.1)

    df = pd.DataFrame(filas).drop_duplicates(subset=["articulo"], keep="first")
    return df.sort_values("articulo_num").reset_index(drop=True)


# ---------------------------------------------------------------------------
# 2) Acuerdo de Valoración OMC
# ---------------------------------------------------------------------------
# Encabezados: 'Artículo N' con A mayúscula (las citas internas son 'artículo').
VAL_HEAD = re.compile(r"Art[ií]culo\s+(?P<num>\d+)\s*:?\s*(?P<suf>)")


def build_valoracion(progress: Progress) -> pd.DataFrame:
    progress.step("Acuerdo de Valoración OMC · descargando")
    texto = cortar_basura(to_text(decode_html(fetch(VAL_URL))), VAL_HEAD)
    filas = []
    for fila in partir_articulos(texto, VAL_HEAD, con_titulo=True):
        fila.update({
            "norma": "Acuerdo de Valoración OMC",
            "norma_id": "VAL",
            "seccion": "",
            "titulo_seccion": "Acuerdo art. VII GATT 1994",
            "fuente_url": VAL_URL,
            "vigencia": "1994-04-15",
        })
        filas.append(fila)
    df = pd.DataFrame(filas).drop_duplicates(subset=["articulo"], keep="last")
    return df.sort_values("articulo_num").reset_index(drop=True)


# ---------------------------------------------------------------------------
# 3) ROM MERCOSUR (desde HTML guardado a mano por Cloudflare)
# ---------------------------------------------------------------------------
ROM_HEAD = re.compile(r"Art[ií]culo\s+(?P<num>\d+)\s*:\s*(?P<suf>)")
# Encabezado de apéndice de sección: "Apéndice IV: TÍTULO".
# Las citas internas del articulado usan comillas o "de la Decisión" (sin dos
# puntos), así que anclar en ":" evita falsos positivos.
APENDICE_HEAD = re.compile(r"Ap[ée]ndice\s+(?P<num>[IVXLC]+)\s*:\s*")

_ROMANO = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def romano_a_int(s: str) -> int:
    total = prev = 0
    for ch in reversed(s.upper()):
        v = _ROMANO.get(ch, 0)
        total += -v if v < prev else v
        prev = max(prev, v)
    return total


def titulo_apendice(cuerpo: str) -> str:
    """El título del apéndice va en MAYÚSCULAS hasta el primer ' - '/'. '."""
    cab = re.split(r"\s[-–]\s", cuerpo, maxsplit=1)[0]
    cab = re.split(r"(?<=[A-ZÁÉÍÓÚÑ])\.\s", cab, maxsplit=1)[0]
    return " ".join(cab.split())[:120]


def partir_apendices(texto: str) -> list[dict[str, Any]]:
    """Corta el bloque de apéndices en filas (uno por 'Apéndice N:')."""
    hits = list(APENDICE_HEAD.finditer(texto))
    filas: list[dict[str, Any]] = []
    for i, m in enumerate(hits):
        fin = hits[i + 1].start() if i + 1 < len(hits) else len(texto)
        roman = m.group("num").upper()
        cuerpo = texto[m.end():fin].strip()
        texto_ap = (m.group(0).strip() + " " + cuerpo).strip()
        filas.append({
            "articulo": f"Ap. {roman}",
            "articulo_num": 100 + romano_a_int(roman),
            "titulo": titulo_apendice(cuerpo),
            "texto": texto_ap,
            "texto_busqueda": normalizar(texto_ap),
        })
    return filas


def build_rom(progress: Progress) -> pd.DataFrame | None:
    progress.step("Régimen de Origen MERCOSUR · leyendo")
    if not ROM_LOCAL.exists():
        try:
            raw = decode_html(fetch(ROM_URL))
            if es_cloudflare(raw):
                raise RuntimeError("cloudflare")
            ROM_LOCAL.write_text(raw, encoding="utf-8")
        except Exception:  # noqa: BLE001
            progress.nota(
                "  ! ROM: POLCOM está detrás de Cloudflare; no se puede bajar por script.\n"
                "    Guardalo UNA vez a mano y volvé a correr (--solo rom):\n"
                f"      1) Abrí {ROM_URL}\n"
                f"      2) Guardá la página (solo HTML) en: {ROM_LOCAL}"
            )
            return None
    completo = cortar_basura(to_text(decode_html(ROM_LOCAL.read_bytes())), ROM_HEAD)
    # El articulado va hasta el primer apéndice de sección ("Apéndice I:");
    # de ahí en adelante son los 10 apéndices. Cortar acá evita que el último
    # artículo (Art. 56) se "trague" todos los apéndices.
    mA = APENDICE_HEAD.search(completo)
    texto_art = completo[: mA.start()] if mA else completo
    texto_ap = completo[mA.start():] if mA else ""

    crudas = partir_articulos(texto_art, ROM_HEAD, con_titulo=True)
    apendices = partir_apendices(texto_ap)
    progress.nota(f"  · ROM: {len(crudas)} artículos + {len(apendices)} apéndices")

    filas = []
    for fila in crudas + apendices:
        fila.update({
            "norma": "Régimen de Origen MERCOSUR",
            "norma_id": "ROM",
            "seccion": "",
            "titulo_seccion": "Dec. CMC 05/23 (texto ordenado)",
            "fuente_url": ROM_URL,
            "vigencia": "2024-07-18",
        })
        filas.append(fila)
    df = pd.DataFrame(filas).drop_duplicates(subset=["articulo"], keep="last")
    return df.sort_values("articulo_num").reset_index(drop=True)


COLS = [
    "norma_id", "norma", "seccion", "titulo_seccion",
    "articulo", "articulo_num", "titulo", "texto", "texto_busqueda",
    "temas", "keywords", "dispara_si", "texto_indice",
    "fuente_url", "vigencia",
]

FUENTES = {"CA": CA_INDEX, "VAL": VAL_URL, "ROM": ROM_URL}

# Parquet por norma (para rearmar el combinado desde disco aunque se corra --solo).
ARCHIVOS_NORMA = {
    "CA": "codigo_aduanero.parquet",
    "VAL": "valoracion_omc.parquet",
    "ROM": "rom_mercosur.parquet",
}


def guardar(nombre: str, df: pd.DataFrame, indice: dict[tuple[str, str], dict[str, Any]]) -> None:
    df = enriquecer_con_indice(df, indice)
    df.reindex(columns=COLS).to_parquet(OUT / nombre, compression="snappy", index=False)


def rearmar_combinado_desde_disco(indice: dict[tuple[str, str], dict[str, Any]]) -> None:
    """Re-enriquece parquets por norma y regenera normas.parquet + meta."""
    disco: dict[str, pd.DataFrame] = {}
    for k, nombre in ARCHIVOS_NORMA.items():
        p = OUT / nombre
        if p.exists():
            disco[k] = pd.read_parquet(p)
    if not disco:
        return
    for k, df in disco.items():
        guardar(ARCHIVOS_NORMA[k], df, indice)
        disco[k] = pd.read_parquet(OUT / ARCHIVOS_NORMA[k])
    combinado = pd.concat(
        [disco[k] for k in ("CA", "VAL", "ROM") if k in disco],
        ignore_index=True,
    ).reindex(columns=COLS)
    combinado.to_parquet(OUT / "normas.parquet", compression="snappy", index=False)
    meta = pd.DataFrame([
        {
            "norma_id": k,
            "norma": disco[k]["norma"].iloc[0],
            "articulos": int(len(disco[k])),
            "fuente_url": FUENTES.get(k, ""),
            "actualizado": utc_now(),
        }
        for k in ("CA", "VAL", "ROM") if k in disco
    ])
    meta.to_parquet(OUT / "meta.parquet", compression="snappy", index=False)
    print(f"OK - {len(combinado)} artículos re-enriquecidos en {OUT}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Construye el corpus de normas por artículo")
    ap.add_argument("--solo", choices=["ca", "valoracion", "rom"], help="Procesar una sola norma")
    ap.add_argument(
        "--solo-indice",
        action="store_true",
        help="Solo re-aplica normas_indice.json a parquets existentes (sin re-descargar)",
    )
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    indice = cargar_indice_normas()

    if args.solo_indice:
        rearmar_combinado_desde_disco(indice)
        return
    hacer_ca = args.solo in (None, "ca")
    hacer_val = args.solo in (None, "valoracion")
    hacer_rom = args.solo in (None, "rom")

    # Pre-cálculo del total de pasos para una única barra de progreso.
    ca_archivos: list[str] = []
    total = 0
    if hacer_ca:
        ca_archivos = ca_listar_archivos()
        total += len(ca_archivos)
    if hacer_val:
        total += 1
    if hacer_rom:
        total += 1

    progress = Progress(total)
    partes: dict[str, pd.DataFrame] = {}

    if hacer_ca:
        df = build_codigo_aduanero(progress, ca_archivos)
        guardar("codigo_aduanero.parquet", df, indice)
        partes["CA"] = df
    if hacer_val:
        df = build_valoracion(progress)
        guardar("valoracion_omc.parquet", df, indice)
        partes["VAL"] = df
    if hacer_rom:
        df = build_rom(progress)
        if df is not None:
            guardar("rom_mercosur.parquet", df, indice)
            partes["ROM"] = df

    progress.finish()
    rearmar_combinado_desde_disco(indice)


if __name__ == "__main__":
    main()
