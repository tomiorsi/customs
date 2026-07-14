#!/usr/bin/env python3
"""Genera muestras aleatorias (NCM SIM complejas) con descripción en español desde el nomenclador."""
import argparse
import json
import re
import unicodedata
from pathlib import Path

import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[1]
PARQUET = ROOT / "data" / "Nomenclatura" / "ncm.parquet"
FIXTURES = ROOT / "scripts" / "fixtures"


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower()


def es_residual(desc: str) -> bool:
    """Hoja residual genérica («Los demás»), no tipificaciones nominales largas."""
    d = norm(desc).strip("- ")
    if d in ("los demas", "las demas", "demas"):
        return True
    if d.startswith("los demas") or d.startswith("las demas"):
        return len(d.split()) <= 3
    return False


def es_compleja(row) -> bool:
    cod = (row["codigo"] or "").strip()
    digits = re.sub(r"\D", "", cod)
    if len(digits) < 10:
        return False
    if str(row["codigo_num"])[:4].startswith("000"):
        return False
    if not re.search(r"[A-Z]$", cod):
        return False
    desc = row["descripcion"] or ""
    if es_residual(desc):
        return False
    ruta = row["ruta"] or ""
    niveles = [p.strip() for p in ruta.split(">") if p.strip()]
    if len(niveles) < 4:
        return False
    if any(es_residual(p) for p in niveles[-3:]):
        return False
    return True


def es_encabezado_partida(texto: str) -> bool:
    """Encabezado legal de partida/capítulo (ruido para IA; no descripción facturada)."""
    t = (texto or "").strip()
    if not t:
        return True
    letters = [c for c in t if c.isalpha()]
    if len(letters) < 15:
        return False
    upper = sum(1 for c in letters if c.isupper())
    ratio = upper / len(letters)
    has_digit = any(c.isdigit() for c in t)
    if len(t) >= 80 and ratio > 0.75:
        return True
    # Título de partida/subpartida: mayúsculas sin cifras discriminantes
    if ratio > 0.85 and not has_digit:
        return True
    return False


# Encabezados de categoría genérica: NO son el nombre del artículo, no reponer.
CATEGORIA_GENERICA = (
    "productos", "preparaciones", "obras", "articulos", "manufacturas",
    "maquinas", "aparatos", "instrumentos", "partes", "las demas", "los demas",
    "mezclas", "residuos", "desperdicios", "compuestos",
)


def nombre_articulo_de_encabezado(heading: str) -> str:
    """Nombre corto del artículo desde un encabezado de partida (primer sintagma)."""
    frase = re.split(r"[,;.]", heading or "", maxsplit=1)[0].strip()
    palabras = frase.split()
    if len(palabras) > 6:
        frase = " ".join(palabras[:6])
    frase = frase.lower()
    return frase[:1].upper() + frase[1:] if frase else ""


def encabezado_nombra_articulo(heading: str, texto: str) -> bool:
    """El encabezado nombra un artículo concreto (no categoría genérica) ausente del texto."""
    nombre = norm(nombre_articulo_de_encabezado(heading))
    if not nombre:
        return False
    if any(nombre.startswith(g) for g in CATEGORIA_GENERICA):
        return False
    clave = nombre.split()[0]
    return len(clave) >= 4 and not re.search(rf"\b{re.escape(clave)}", norm(texto))


def producto_desde_fila(row) -> str:
    parts = [p.strip() for p in (row["ruta"] or "").split(">") if p.strip()]
    rama = parts[1:] if len(parts) > 1 else parts
    tail: list[str] = []
    encabezado_omitido = ""
    for i, p in enumerate(rama):
        if es_residual(p):
            continue
        # Solo el primer segmento de la rama es encabezado legal genérico de partida/capítulo.
        if i == 0 and es_encabezado_partida(p):
            encabezado_omitido = p
            continue
        tail.append(p)
    if len(tail) > 4:
        cuerpo = [tail[0], *tail[-3:]]
    else:
        cuerpo = tail
    desc = (row["descripcion"] or "").strip()
    textos: list[str] = []
    for t in cuerpo:
        if t not in textos:
            textos.append(t)
    if desc and not es_residual(desc):
        dn = norm(desc)
        if not any(dn in norm(t) or norm(t) in dn for t in textos):
            textos.append(desc)
    # Si el nombre del artículo solo vivía en el encabezado omitido (y no aparece en
    # el resto), reponerlo: un despachante siempre nombra el producto.
    if encabezado_omitido and encabezado_nombra_articulo(encabezado_omitido, ", ".join(textos)):
        textos.insert(0, nombre_articulo_de_encabezado(encabezado_omitido))
    # Preservar la hoja SIM; truncar solo el prefijo de rama
    if desc and not es_residual(desc) and desc in textos:
        textos.remove(desc)
        prefix = ", ".join(textos)
        max_prefix = max(0, 320 - len(desc) - 2)
        if len(prefix) > max_prefix:
            prefix = prefix[:max_prefix].rsplit(",", 1)[0]
        s = f"{prefix}, {desc}".strip(", ") if prefix else desc
    else:
        s = ", ".join(textos)
    return (s[:320] if len(s) > 320 else s) or desc


# Palabras típicas de entradas en inglés en el parquet (descartar para benchmark ES).
PALABRAS_INGLES = frozenset(
    {
        "the", "with", "for", "and", "other", "not", "including", "whether",
        "than", "from", "which", "their", "these", "those", "only", "each",
    }
)


def es_partida_repuestos(desc: str) -> bool:
    """Encabezado de partida de PARTES (mismo criterio estructural que el motor, sin «partes» en ruta)."""
    d = norm(desc)
    if re.match(r"^partes\b", d):
        return True
    if re.search(r"\bpartes\s+y\s+accesorios\b", d):
        return True
    if re.search(r";\s*partes\b", d):
        return True
    return False


def es_rama_partes(row) -> bool:
    """Deprecado en favor de es_partida_repuestos; conservado para compatibilidad."""
    return False


def producto_repuesto_desde_fila(row) -> str:
    """Descripción facturada + contexto genérico de pieza suelta si no está ya declarado."""
    base = producto_desde_fila(row)
    if re.search(r"\b(?:repuesto|componente|pieza|parte|accesorio)\b", norm(base)):
        return base
    return f"{base}, repuesto suelto"


def es_espanol(texto: str) -> bool:
    """Descarta textos con indicios claros de inglés (el nomenclador AR es en español)."""
    t = norm(texto)
    if not t:
        return False
    for w in PALABRAS_INGLES:
        if re.search(rf"\b{re.escape(w)}\b", t):
            return False
    return True


def ncms_excluidos(paths: list[Path]) -> set[str]:
    out: set[str] = set()
    for p in paths:
        if not p.is_file():
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        for m in data.get("muestras", []):
            if m.get("ncm"):
                out.add(m["ncm"])
    return out


def es_sim_repuesto_partida(row) -> bool:
    """SIM de componente/accesorio, no artículo terminado bajo partida de PARTES."""
    parts = [p.strip() for p in (row["ruta"] or "").split(">") if p.strip()]
    if len(parts) < 3:
        return False
    tail = [norm(p) for p in parts[-4:]]
    if any(p == "partes" or re.match(r"^partes\b", p) for p in tail):
        return True
    if any(re.match(r"^(?:los|las) demas\b", p) for p in tail):
        return True
    return False


def filtrar_sims(sims, solo_partes: bool):
    if not solo_partes:
        return sims
    partidas_df = pq.read_table(
        PARQUET,
        columns=["codigo_num", "nivel", "descripcion"],
    ).to_pandas()
    partidas_rep = {
        str(r["codigo_num"])[:4]
        for _, r in partidas_df[partidas_df["nivel"] == "partida"].iterrows()
        if es_partida_repuestos(r["descripcion"])
    }
    sims = sims[sims["codigo_num"].astype(str).str.slice(0, 4).isin(partidas_rep)].copy()
    sims = sims[sims.apply(es_sim_repuesto_partida, axis=1)].copy()
    return sims


def producto_muestra(row, solo_partes: bool) -> str:
    return producto_repuesto_desde_fila(row) if solo_partes else producto_desde_fila(row)


def generar(seed: int, n: int, excluir: set[str], solo_partes: bool = False) -> list[dict]:
    df = pq.read_table(
        PARQUET,
        columns=["codigo", "codigo_num", "nivel", "descripcion", "ruta"],
    ).to_pandas()
    sims = df[df["nivel"].isin(["sim", "ncm"])].copy()
    sims = sims[sims.apply(es_compleja, axis=1)].copy()
    sims = filtrar_sims(sims, solo_partes)
    sims = sims[~sims["codigo"].isin(excluir)].copy()
    sims["partida"] = sims["codigo_num"].astype(str).str.slice(0, 4)
    sims["capitulo"] = sims["partida"].str.slice(0, 2)

    elegidas: list[dict] = []
    caps_usados: set[str] = set()
    rng = sims.sample(frac=1, random_state=seed)

    def agregar(row) -> bool:
        producto = producto_muestra(row, solo_partes)
        if len(producto.split()) < 4:
            return False
        if not es_espanol(producto):
            return False
        elegidas.append(
            {
                "ncm": row["codigo"],
                "partida": row["partida"],
                "producto": producto,
                "descripcion_ncm": row["descripcion"],
            }
        )
        return True

    for _, row in rng.iterrows():
        cap = row["capitulo"]
        if cap in caps_usados and len(caps_usados) < min(20, n // 2):
            continue
        if agregar(row):
            caps_usados.add(cap)
        if len(elegidas) >= n:
            break

    if len(elegidas) < n:
        for _, row in rng.iterrows():
            if any(e["ncm"] == row["codigo"] for e in elegidas):
                continue
            if agregar(row) and len(elegidas) >= n:
                break

    return elegidas


def generar_estratificado(seed: int, n: int, excluir: set[str], solo_partes: bool = False) -> list[dict]:
    """Una muestra por capítulo (2 dígitos) hasta completar n; todas desde el parquet."""
    df = pq.read_table(
        PARQUET,
        columns=["codigo", "codigo_num", "nivel", "descripcion", "ruta"],
    ).to_pandas()
    sims = df[df["nivel"].isin(["sim", "ncm"])].copy()
    sims = sims[sims.apply(es_compleja, axis=1)].copy()
    sims = filtrar_sims(sims, solo_partes)
    sims = sims[~sims["codigo"].isin(excluir)].copy()
    sims["partida"] = sims["codigo_num"].astype(str).str.slice(0, 4)
    sims["capitulo"] = sims["partida"].str.slice(0, 2)

    por_cap: dict[str, list] = {}
    rng = sims.sample(frac=1, random_state=seed)
    for _, row in rng.iterrows():
        cap = row["capitulo"]
        producto = producto_muestra(row, solo_partes)
        if len(producto.split()) < 4 or not es_espanol(producto):
            continue
        por_cap.setdefault(cap, []).append(row)

    caps = sorted(por_cap.keys())
    elegidas: list[dict] = []
    vistos_ncm: set[str] = set()
    ronda = 0
    while len(elegidas) < n and caps:
        for cap in caps:
            fila = por_cap.get(cap, [])
            if not fila or len(elegidas) >= n:
                continue
            idx = min(ronda, len(fila) - 1)
            row = fila[idx]
            if row["codigo"] in vistos_ncm:
                continue
            vistos_ncm.add(row["codigo"])
            elegidas.append(
                {
                    "ncm": row["codigo"],
                    "partida": row["partida"],
                    "producto": producto_muestra(row, solo_partes),
                    "descripcion_ncm": row["descripcion"],
                }
            )
        ronda += 1
        if ronda > 20:
            break

    if len(elegidas) < n:
        extra = generar(seed + 1, n - len(elegidas), excluir | vistos_ncm, solo_partes)
        elegidas.extend(extra)

    return elegidas[:n]


def main() -> None:
    parser = argparse.ArgumentParser(description="Genera muestras benchmark motor NCM")
    parser.add_argument("-n", type=int, default=40, help="Cantidad de muestras")
    parser.add_argument("--seed", type=int, default=20260627, help="Semilla aleatoria")
    parser.add_argument(
        "--out",
        type=Path,
        default=FIXTURES / "muestras-motor-40.json",
        help="Archivo JSON de salida",
    )
    parser.add_argument(
        "--excluir",
        type=Path,
        nargs="*",
        default=[],
        help="Fixtures cuyos NCM no deben repetirse",
    )
    parser.add_argument(
        "--estratificado",
        action="store_true",
        help="Distribuir muestras por capítulo (2 dígitos) del nomenclador",
    )
    parser.add_argument(
        "--solo-partes",
        action="store_true",
        help="Solo SIMs bajo encabezado PARTES; agrega contexto genérico «repuesto suelto»",
    )
    args = parser.parse_args()

    excluir = ncms_excluidos(args.excluir)
    if args.estratificado:
        elegidas = generar_estratificado(args.seed, args.n, excluir, args.solo_partes)
    else:
        elegidas = generar(args.seed, args.n, excluir, args.solo_partes)

    if len(elegidas) < args.n:
        print(f"AVISO: solo se obtuvieron {len(elegidas)}/{args.n} muestras")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "seed": args.seed,
        "n": len(elegidas),
        "excluidos": len(excluir),
        "solo_partes": args.solo_partes,
        "muestras": elegidas,
    }
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Escritas {len(elegidas)} muestras en {args.out}")


if __name__ == "__main__":
    main()
