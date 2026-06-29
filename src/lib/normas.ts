import "server-only";
import path from "node:path";
import { leerFilas } from "@/lib/parquet-store";

/**
 * Corpus de NORMAS (normas.parquet): texto literal por artículo + índice curado
 * (temas, keywords, dispara_si) desde data/Normas/normas_indice.json vía
 * scripts/build_normas.py. El motor RECUPERA artículos por señales leídas en
 * los documentos; no vuelca el corpus entero en cada llamada.
 */

const NORMAS_PATH = path.join(process.cwd(), "data", "Normas", "normas.parquet");

const COLS = [
  "norma_id",
  "norma",
  "seccion",
  "titulo_seccion",
  "articulo",
  "articulo_num",
  "titulo",
  "texto",
  "texto_busqueda",
  "temas",
  "keywords",
  "dispara_si",
  "texto_indice",
  "fuente_url",
  "vigencia",
] as const;

export type NormaId = "CA" | "VAL" | "ROM";

export const NORMA_LABEL: Record<NormaId, string> = {
  CA: "Código Aduanero",
  VAL: "Acuerdo de Valoración OMC",
  ROM: "Régimen de Origen Mercosur",
};

export type Articulo = {
  normaId: NormaId;
  norma: string;
  seccion: string;
  tituloSeccion: string;
  articulo: string;
  articuloNum: number;
  titulo: string;
  texto: string;
  textoBusqueda: string;
  temas: string[];
  keywords: string[];
  disparaSi: string[];
  fuenteUrl: string;
  vigencia: string;
};

export type RefArticulo = { norma: NormaId; art: number | string };

type Indice = {
  porClave: Map<string, Articulo>;
  lista: Articulo[];
};

let indicePromesa: Promise<Indice> | null = null;

function parsePipe(raw: unknown): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  return s.split("|").map((x) => x.trim()).filter(Boolean);
}

function construir(filas: Awaited<ReturnType<typeof leerFilas>>): Indice {
  const porClave = new Map<string, Articulo>();
  const lista: Articulo[] = [];

  for (const f of filas) {
    const normaId = (f["norma_id"] ?? "") as NormaId;
    const articulo = f["articulo"] ?? "";
    if (!normaId || !articulo) continue;
    const a: Articulo = {
      normaId,
      norma: f["norma"] ?? NORMA_LABEL[normaId] ?? "",
      seccion: f["seccion"] ?? "",
      tituloSeccion: f["titulo_seccion"] ?? "",
      articulo,
      articuloNum: Number(f["articulo_num"] ?? "") || 0,
      titulo: f["titulo"] ?? "",
      texto: f["texto"] ?? "",
      textoBusqueda: f["texto_busqueda"] ?? "",
      temas: parsePipe(f["temas"]),
      keywords: parsePipe(f["keywords"]),
      disparaSi: parsePipe(f["dispara_si"]),
      fuenteUrl: f["fuente_url"] ?? "",
      vigencia: f["vigencia"] ?? "",
    };
    lista.push(a);
    porClave.set(`${normaId}:${articulo}`, a);
    const claveNum = `${normaId}:${a.articuloNum}`;
    if (!porClave.has(claveNum)) porClave.set(claveNum, a);
  }

  return { porClave, lista };
}

async function getIndice(): Promise<Indice> {
  if (!indicePromesa) {
    indicePromesa = leerFilas(NORMAS_PATH, COLS).then(construir);
  }
  return indicePromesa;
}

export function invalidarIndiceNormas(): void {
  indicePromesa = null;
}

export async function normasDisponibles(): Promise<boolean> {
  const { lista } = await getIndice();
  return lista.length > 0;
}

export async function obtenerArticulo(ref: RefArticulo): Promise<Articulo | null> {
  const { porClave } = await getIndice();
  return porClave.get(`${ref.norma}:${String(ref.art).trim()}`) ?? null;
}

export async function obtenerArticulos(refs: RefArticulo[]): Promise<Articulo[]> {
  const { porClave } = await getIndice();
  const out: Articulo[] = [];
  const vistos = new Set<string>();
  for (const ref of refs) {
    const a = porClave.get(`${ref.norma}:${String(ref.art).trim()}`);
    if (a && !vistos.has(`${a.normaId}:${a.articulo}`)) {
      vistos.add(`${a.normaId}:${a.articulo}`);
      out.push(a);
    }
  }
  return out;
}

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ_ ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

export async function listarTemasDisponibles(): Promise<string[]> {
  const { lista } = await getIndice();
  const temas = new Set<string>();
  for (const a of lista) {
    for (const t of a.temas) temas.add(t);
  }
  return [...temas].sort();
}

export async function buscarArticulosPorSenales(
  senales: string[],
  opts: { norma?: NormaId; limite?: number } = {},
): Promise<Articulo[]> {
  const { norma, limite = 10 } = opts;
  const tokens = [...new Set(senales.map((s) => normalizar(s)).filter(Boolean))];
  if (tokens.length === 0) return [];

  const { lista } = await getIndice();
  const conPuntaje = lista
    .filter((a) => (norma ? a.normaId === norma : true))
    .map((a) => {
      let puntaje = 0;
      for (const t of tokens) {
        if (a.disparaSi.some((d) => normalizar(d) === t || t.includes(normalizar(d)))) {
          puntaje += 5;
        }
        if (a.temas.some((tm) => normalizar(tm) === t || normalizar(tm).includes(t))) {
          puntaje += 3;
        }
        for (const kw of a.keywords) {
          const nk = normalizar(kw);
          if (nk.includes(t) || t.includes(nk)) puntaje += 2;
        }
        if (a.textoBusqueda.includes(t)) puntaje += 1;
      }
      return { a, puntaje };
    })
    .filter((x) => x.puntaje > 0)
    .sort((x, y) => y.puntaje - x.puntaje || x.a.articuloNum - y.a.articuloNum);

  const out: Articulo[] = [];
  const vistos = new Set<string>();
  for (const { a } of conPuntaje) {
    const k = `${a.normaId}:${a.articulo}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(a);
    if (out.length >= limite) break;
  }
  return out;
}

export async function buscarArticulos(
  consulta: string,
  opts: { norma?: NormaId; limite?: number } = {},
): Promise<Articulo[]> {
  const terminos = normalizar(consulta).split(" ").filter((t) => t.length >= 3);
  return buscarArticulosPorSenales(terminos, opts);
}

function recortar(texto: string, max: number): string {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, "") + " […]";
}

function cabeceraIndiceArticulo(a: Articulo): string {
  const partes: string[] = [];
  if (a.temas.length) partes.push(`temas: ${a.temas.join(", ")}`);
  if (a.keywords.length) partes.push(`keywords: ${a.keywords.slice(0, 8).join("; ")}`);
  return partes.length ? partes.join(" · ") : "";
}

export async function contextoArticulosIA(
  refs: RefArticulo[],
  opts: {
    maxCharsPorArticulo?: number;
    maxCharsPorApendice?: number;
    incluirIndice?: boolean;
  } = {},
): Promise<string> {
  const {
    maxCharsPorArticulo = 900,
    maxCharsPorApendice = 12000,
    incluirIndice = false,
  } = opts;
  const articulos = await obtenerArticulos(refs);
  if (articulos.length === 0) return "";

  const lineas = articulos.map((a) => {
    const esApendice = a.articuloNum >= 100;
    const ref = esApendice ? a.articulo : `Art. ${a.articulo}`;
    const indice = incluirIndice ? cabeceraIndiceArticulo(a) : "";
    const enc =
      `[${NORMA_LABEL[a.normaId]} · ${ref}` +
      (a.titulo ? ` — ${a.titulo}` : "") +
      (indice ? ` · ${indice}` : "") +
      "]";
    return `${enc} ${recortar(a.texto, esApendice ? maxCharsPorApendice : maxCharsPorArticulo)}`;
  });

  return (
    "MARCO NORMATIVO (artículos recuperados por señales de la operación/documentos; " +
    "fundamentá hallazgos citando el artículo —p.ej. «Art. 26 ROM»—). Si un artículo " +
    "remite a un apéndice NO reproducido acá, esa remisión NO es requisito por sí sola:\n" +
    lineas.join("\n")
  );
}
