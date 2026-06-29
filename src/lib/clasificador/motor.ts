import "server-only";
import path from "node:path";
import { leerFilas } from "@/lib/parquet-store";
import {
  dieAplicable,
  enriquecerArancelImportacion,
  simCodigo,
  tributacionPorSim,
} from "@/lib/tributacion-vuce";
import { ivaEstimado } from "./datos";
import type { CandidatoNcm } from "./tipos";

/**
 * Acceso al nomenclador (ncm.parquet): menú de partidas/posiciones y arancel.
 * La elección final combina este menú (Fase A) con cruce legal RGI+notas (Fase B, ia.ts).
 */

const NCM_PATH = path.join(process.cwd(), "data", "Nomenclatura", "ncm.parquet");

const COLS = [
  "codigo",
  "codigo_num",
  "nivel",
  "descripcion",
  "ruta",
  "ar1",
  "ar2",
  "ar3",
  "ar4",
  "ar5",
] as const;

type Hoja = {
  codigo: string;
  codigoNum: string;
  nivel: string;
  descripcion: string;
  ruta: string;
  p4: string;
  /** ar1 = Derecho de Exportación (DE / "retención"). */
  ar1: number;
  /** ar2 = Reintegro a la exportación (extrazona). */
  ar2: number;
  /** ar3 = Tarifa nominal extrazona en nomenclador ARCA (AEC / referencia). */
  ar3: number;
  /** ar4 = Reintegro a la exportación (intrazona). */
  ar4: number;
  /** Derecho adicional (sectores sensibles). */
  ar5: number;
};

function aNumero(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type Indice = {
  porPartida: Map<string, Hoja[]>;
  partDesc: Map<string, string>;
  arbolPorPartida: Map<string, ArbolPartida>;
  /** Texto legal normalizado de toda la partida (encabezado + todas las SIM). */
  corpusPorPartida: Map<string, string>;
  /** Corpus normalizado solo del encabezado de 4 dígitos (sin SIMs). */
  headingCorpusPorPartida: Map<string, string>;
  numPartidas: number;
};

type ArbolPartida = {
  descPorCodigo: Map<string, string>;
  numPorCodigo: Map<string, string>;
  codigoPorNum: Map<string, string>;
};

let indicePromesa: Promise<Indice> | null = null;

function construirIndice(filas: Awaited<ReturnType<typeof leerFilas>>): Indice {
  const porPartida = new Map<string, Hoja[]>();
  const partDesc = new Map<string, string>();
  const arbolPorPartida = new Map<string, ArbolPartida>();

  for (const f of filas) {
    const codigoNum = (f["codigo_num"] ?? "").trim();
    const codigo = (f["codigo"] ?? "").trim();
    const descripcion = f["descripcion"] ?? "";

    if (f["nivel"] === "partida" && codigoNum.length === 4) {
      partDesc.set(codigoNum, descripcion);
    }

    if (codigoNum.length >= 4 && codigo) {
      const p4 = codigoNum.slice(0, 4);
      const arbol = arbolPorPartida.get(p4) ?? {
        descPorCodigo: new Map(),
        numPorCodigo: new Map(),
        codigoPorNum: new Map(),
      };
      arbol.descPorCodigo.set(codigo, descripcion);
      arbol.numPorCodigo.set(codigo, codigoNum);
      arbol.codigoPorNum.set(codigoNum, codigo);
      arbolPorPartida.set(p4, arbol);
    }

    const ar3raw = f["ar3"];
    if (ar3raw == null || ar3raw === "") continue;
    const ar3 = Number(ar3raw);
    if (!Number.isFinite(ar3)) continue;
    if (codigoNum.startsWith("00")) continue; // fuera capítulo 00 (regímenes especiales)

    const p4 = codigoNum.slice(0, 4);
    const hoja: Hoja = {
      codigo: f["codigo"] ?? "",
      codigoNum,
      nivel: f["nivel"] ?? "",
      descripcion: f["descripcion"] ?? "",
      ruta: f["ruta"] ?? "",
      p4,
      ar3,
      ar1: aNumero(f["ar1"]),
      ar2: aNumero(f["ar2"]),
      ar4: aNumero(f["ar4"]),
      ar5: aNumero(f["ar5"]),
    };
    const arr = porPartida.get(p4);
    if (arr) arr.push(hoja);
    else porPartida.set(p4, [hoja]);
  }

  // Partidas sin fila nivel=partida: encabezado desde subpartida de 6 dígitos.
  for (const f of filas) {
    const codigoNum = (f["codigo_num"] ?? "").trim();
    if (codigoNum.startsWith("000")) continue;
    const p4 = codigoNum.slice(0, 4);
    if (partDesc.has(p4)) continue;
    if (f["nivel"] === "subpartida" && codigoNum.length === 6) {
      const descripcion = (f["descripcion"] ?? "").trim();
      if (descripcion) partDesc.set(p4, descripcion);
    }
  }

  const corpusPorPartida = new Map<string, string>();
  const headingCorpusPorPartida = new Map<string, string>();
  const partidasIndexadas = new Set<string>([
    ...partDesc.keys(),
    ...porPartida.keys(),
  ]);
  for (const p4 of partidasIndexadas) {
    if (p4.startsWith("000")) continue;
    const hojas = porPartida.get(p4) ?? [];
    if (!partDesc.has(p4) && hojas.length) {
      const ruta = hojas.find((h) => h.ruta)?.ruta ?? "";
      const seg = ruta
        .split(" > ")
        .map((s) => s.trim())
        .filter(Boolean);
      if (seg.length >= 2) partDesc.set(p4, seg[1]!);
    }
    const desc = partDesc.get(p4) ?? "";
    if (!desc && !hojas.length) continue;
    const headingCorpus = corpusNormalizado(desc);
    headingCorpusPorPartida.set(p4, headingCorpus);
    corpusPorPartida.set(
      p4,
      corpusNormalizado(
        [desc, ...hojas.map((h) => `${h.descripcion} ${h.ruta}`)].join(" "),
      ),
    );
  }

  return {
    porPartida,
    partDesc,
    arbolPorPartida,
    corpusPorPartida,
    headingCorpusPorPartida,
    numPartidas: corpusPorPartida.size,
  };
}

async function getIndice(): Promise<Indice> {
  if (!indicePromesa) {
    indicePromesa = leerFilas(NCM_PATH, COLS).then(construirIndice);
  }
  return indicePromesa;
}

export async function candidatosDePartida(p4: string): Promise<CandidatoNcm[]> {
  const idx = await getIndice();
  const hojas = (idx.porPartida.get(p4) ?? [])
    .filter((h) => h.nivel === "sim" || h.nivel === "ncm")
    .sort((a, b) => a.codigoNum.localeCompare(b.codigoNum));

  return hojas.map((h) => ({
    codigo: h.codigo,
    descripcion: h.descripcion,
    di: h.ar3,
    ruta: h.ruta,
  }));
}

/** Descripción oficial de una partida (o "" si no existe). */
export async function descripcionPartida(p4: string): Promise<string> {
  const idx = await getIndice();
  return idx.partDesc.get(p4) ?? "";
}

/** Primera subdivisión (6 dígitos) de una partida: útil para que Fase 1 genere preguntas correctas. */
export async function subpartidasPrimerNivel(
  p4: string,
): Promise<{ codigo: string; descripcion: string }[]> {
  const idx = await getIndice();
  const arbol = idx.arbolPorPartida.get(p4);
  if (!arbol) return [];
  const out: { codigo: string; descripcion: string }[] = [];
  for (const [codigo, num] of arbol.numPorCodigo.entries()) {
    if (num.length === 6) {
      out.push({ codigo, descripcion: arbol.descPorCodigo.get(codigo) ?? "" });
    }
  }
  return out.sort((a, b) => a.codigo.localeCompare(b.codigo)).slice(0, 8);
}

export type SubpartidaResumen = { codigo: string; descripcion: string };

export type PartidaCandidata = {
  partida: string;
  descripcion: string;
  /** Primera subdivisión (6 dígitos): se incluye para las top partidas para guiar Fase 1. */
  subpartidas?: SubpartidaResumen[];
};

/** Máx. partidas en las que puede aparecer una clave para tratarla como discriminante. */
const MAX_DF_CLAVE_DISCRIMINANTE = 15;

/** Palabras funcionales (≥4 letras) que no discriminan partidas en el filtro parquet. */
const STOPWORDS_FILTRO_PARQUET = new Set([
  "para", "como", "este", "esta", "estos", "estas", "esos", "esas",
  "otro", "otra", "otros", "otras", "todo", "toda", "todos", "todas",
  "cada", "solo", "sola", "solos", "solas", "muy", "mas", "menos",
  "desde", "hasta", "donde", "cuando", "entre", "sobre", "bajo",
  "ante", "tras", "contra", "hacia", "segun", "aqui", "alli",
  "tambien", "bien", "cual", "cuales", "cuanto", "cuantos",
  "alguno", "alguna", "ningun", "ninguna", "mediante", "durante",
  "dentro", "fuera", "mismo", "misma",
  "pero", "igual", "incluido", "incluida",
]);

/** Tipo genérico de artículo: no discrimina encabezados de partida. */
const GENERICOS_NOMBRE_PARTIDA = new Set([
  "maquina", "equipo", "aparato", "sistema", "dispositivo", "instalacion",
  "utiliza", "articulo", "producto", "consiste", "compuesto", "compuesta",
  "kit", "juego", "set", "surtido", "internos", "componentes",
]);

/** Forma comercial o rol logístico: no nombran el tipo de artículo en el nomenclador. */
const META_ESTADO_IMPORTADOR = new Set([
  "suelto", "sueltas", "componente", "componentes", "repuesto", "repuestos",
  "pieza", "piezas", "accesorio", "accesorios",
  "original", "alternativo", "generico", "generica", "importado", "usado", "nuevo",
  "reemplazo", "oem", "spare",
]);

const PREFIJO_ARTICULO_COMPLETO =
  /^(?:maquina|equipo|aparato|sistema|dispositivo)\b/;

const INDICADORES_FORMA_REPUESTO =
  /\b(?:repuesto|componente|parte|pieza|accesorio)\b/;

function segmentoPrincipal(texto: string): string {
  return (texto ?? "").split(/[\-–•·,;]/)[0]?.trim() ?? (texto ?? "");
}

/** Quita cola «con motor …» al final: propulsión accesoria, no tipo de máquina. */
function textoSinColaPropulsion(texto: string): string {
  return segmentoPrincipal(texto).replace(/\s+con\s+(?:un\s+)?motor\b[\s\S]*$/i, "").trim();
}

/** HECHOS declara máquina/aparato completo (no repuesto ni componente suelto). */
export function esArticuloCompleto(texto: string): boolean {
  const head = corpusNormalizado(textoSinColaPropulsion(texto));
  if (!PREFIJO_ARTICULO_COMPLETO.test(head)) return false;
  const nucleo = head.split(/\s+con\s+/)[0] ?? head;
  return !INDICADORES_FORMA_REPUESTO.test(nucleo);
}

/** Genérico inicial (maquina/equipo/…) cuando califica un tipo concreto. */
function genericoCalificador(texto: string): string | null {
  const head = corpusNormalizado(textoSinColaPropulsion(texto));
  const m = head.match(/^(maquina|equipo|aparato|sistema|dispositivo)\s+\S+/);
  return m?.[1] ?? null;
}

/** Palabras del tipo concreto tras el genérico inicial y sin cola de propulsión. */
export function palabrasTipoArticulo(texto: string): string[] {
  let norm = corpusNormalizado(textoSinColaPropulsion(texto));
  norm = norm.replace(/^(?:maquina|equipo|aparato|sistema|dispositivo)\s+/, "");
  return palabrasClaveHechos(norm);
}

function esPalabraMaterial(w: string): boolean {
  return MATERIA_EN_HECHOS.test(w);
}

/** Primera palabra-tipo no genérica del artículo declarado en HECHOS. */
export function palabraTipoPrincipal(texto: string): string | null {
  const palabras = palabrasTipoArticulo(texto);
  const objeto = palabras.filter(
    (c) => !GENERICOS_NOMBRE_PARTIDA.has(c) && !esPalabraMaterial(c),
  );
  return (
    objeto[0] ??
    palabras.find((c) => !GENERICOS_NOMBRE_PARTIDA.has(c)) ??
    palabras[0] ??
    null
  );
}

/** Unidades técnicas en facturas; evita falsos positivos con medidas numéricas. */
const UNIDADES_HECHOS = new Set([
  "kw", "k w", "hp", "kva", "mm", "cm", "m", "bar", "rpm", "kv", "mw", "w", "v", "a",
  "kg", "ton", "litro", "l", "gal", "psi",
]);

/** Claves numéricas con unidad para cruce con texto legal del nomenclador. */
function clavesConUnidadNumerica(texto: string): string[] {
  const norm = corpusNormalizado(texto ?? "");
  const out: string[] = [];
  for (const m of norm.matchAll(/\b(\d{1,6})\s*([a-z]{1,6})\b/g)) {
    const unidad = m[2]!;
    if (!UNIDADES_HECHOS.has(unidad)) continue;
    const combo = `${m[1]}${unidad.replace(/\s+/g, "")}`;
    if (!out.includes(combo)) out.push(combo);
    if (!out.includes(m[1]!)) out.push(m[1]!);
  }
  return out;
}

function clavesFraseProducto(texto: string): string[] {
  const norm = corpusNormalizado(texto ?? "");
  const out: string[] = [];
  const sec = norm.match(/\bseccion\s+([a-z0-9]{1,4})\b/);
  if (sec) out.push(`seccion ${sec[1]}`);
  return out;
}

function expandClavesRetrieval(claves: string[]): string[] {
  const out = [...claves];
  for (const c of claves) {
    for (const v of variantesLexicaClave(c)) {
      if (!out.includes(v)) out.push(v);
    }
  }
  return out;
}

/** Palabras del producto + respuestas para filtrar parquet (mín. 4 letras; sin stopwords). */
export function palabrasClaveHechos(texto: string): string[] {
  const norm = corpusNormalizado(texto ?? "").replace(/[^a-z0-9\s]/g, " ");
  const out: string[] = [];
  for (const w of norm.split(/\s+/)) {
    if (w.length < 4) continue;
    if (STOPWORDS_FILTRO_PARQUET.has(w)) continue;
    if (!out.includes(w)) out.push(w);
  }
  for (const c of clavesConUnidadNumerica(texto)) {
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

function sustantivosTrasPara(texto: string): string[] {
  const norm = corpusNormalizado(texto ?? "");
  const out: string[] = [];
  const re = /\bpara\s+([a-z]{4,})(?:\s+(?:del|de)\s+([a-z]{4,}))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm)) !== null) {
    for (let i = 1; i <= 2; i++) {
      const w = m[i];
      if (!w || w.length < 4 || STOPWORDS_FILTRO_PARQUET.has(w)) continue;
      if (!out.includes(w)) out.push(w);
    }
  }
  return out;
}

/** HECHOS declara repuesto, componente o pieza suelta (forma comercial). */
export function esRepuestoOSuelto(texto: string): boolean {
  const n = corpusNormalizado(texto ?? "");
  return (
    /\b(?:repuesto|repuestos|componente|componentes|pieza|piezas|accesorio|accesorios|reemplazo|oem|spare)\b/.test(
      n,
    ) || /\b(?:suelto|sueltas)\b/.test(n)
  );
}

/** Sustantivos de máquina/aparato padre declarados en el texto (de/para/del). */
function maquinasPadreEnTexto(texto: string): string[] {
  const raw = [...sustantivosPadreEnTexto(texto), ...sustantivosTrasPara(texto)];
  return [...new Set(raw.filter((p) => !GENERICOS_NOMBRE_PARTIDA.has(p) && !META_ESTADO_IMPORTADOR.has(p)))];
}

/** Encabezado de partida que agrupa aparatos/máquinas enteros (terminología del nomenclador, no nombres de producto). */
function esEncabezadoAparatoCompleto(desc: string): boolean {
  if (pesoEncabezadoEstructural(desc) > 0) return false;
  const h = corpusNormalizado(desc ?? "");
  return /\b(?:maquinas|aparatos|vehiculos|artefactos)\b/.test(h);
}

function hitsClavesEnPartida(
  partida: string,
  claves: string[],
  idx: Awaited<ReturnType<typeof getIndice>>,
): number {
  const corpus = `${idx.corpusPorPartida.get(partida) ?? ""} ${idx.headingCorpusPorPartida.get(partida) ?? ""}`;
  const corp = corpusNormalizado(corpus);
  return claves.filter((k) => tokenEnCorpus(k, corp)).length;
}

function hitsMaquinaPadreEnPartida(
  partida: string,
  padres: string[],
  idx: Awaited<ReturnType<typeof getIndice>>,
): number {
  if (!padres.length) return 0;
  const corpus = idx.corpusPorPartida.get(partida) ?? "";
  const heading = idx.headingCorpusPorPartida.get(partida) ?? "";
  return padres.filter((p) => tokenEnCorpus(p, corpus) || tokenEnCorpus(p, heading)).length;
}

/** Partidas cuyo encabezado es de partes y el corpus menciona la máquina padre declarada. */
async function partidasPartesPorMaquinaPadre(texto: string): Promise<string[]> {
  if (!esRepuestoOSuelto(texto) || esArticuloCompleto(texto)) return [];
  const padres = maquinasPadreEnTexto(texto);
  if (!padres.length) return [];
  const idx = await getIndice();
  const scored: Array<{ partida: string; padreHits: number; estructural: number }> = [];
  for (const [partida, desc] of idx.partDesc) {
    const estructural = pesoEncabezadoEstructural(desc);
    if (estructural === 0) continue;
    const padreHits = hitsMaquinaPadreEnPartida(partida, padres, idx);
    if (padreHits === 0) continue;
    scored.push({ partida, padreHits, estructural });
  }
  scored.sort(
    (a, b) =>
      b.padreHits - a.padreHits || b.estructural - a.estructural || a.partida.localeCompare(b.partida),
  );
  return scored.map((s) => s.partida).slice(0, 4);
}

/** Partidas de PARTES con encaje léxico en corpus (sin «de/para» explícito al padre). */
async function partidasPartesPorHits(texto: string): Promise<string[]> {
  if (!esRepuestoOSuelto(texto) || esArticuloCompleto(texto)) return [];
  const idx = await getIndice();
  const claves = clavesParaPartidas(texto);
  const scored: Array<{ partida: string; hits: number }> = [];
  for (const [partida, desc] of idx.partDesc) {
    if (pesoEncabezadoEstructural(desc) === 0) continue;
    const hits = hitsClavesEnPartida(partida, claves, idx);
    if (hits === 0) continue;
    scored.push({ partida, hits });
  }
  scored.sort((a, b) => b.hits - a.hits || a.partida.localeCompare(b.partida));
  return scored.map((s) => s.partida).slice(0, 4);
}

/** Frases consecutivas de 2-3 claves del texto para retrieval acotado. */
function frasesDiscriminantes(texto: string): string[] {
  const words = palabrasClaveHechos(texto);
  const out: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    out.push(`${words[i]} ${words[i + 1]}`);
    if (i + 2 < words.length) out.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return out;
}

/** Claves del primer segmento (antes de coma): suelen nombrar el tipo de artículo. */
function clavesPrioritarias(texto: string): Set<string> {
  const head = segmentoPrincipal(texto).split(",")[0] ?? segmentoPrincipal(texto);
  return new Set(palabrasClaveHechos(head));
}

function fraseEnCorpus(frase: string, corpus: string): boolean {
  const f = corpusNormalizado(frase);
  if (f.replace(/\s/g, "").length < 8) return false;
  return corpusNormalizado(corpus).includes(f);
}

/** Partidas donde frases consecutivas del texto aparecen en el corpus. */
async function partidasPorFrasesDiscriminantes(texto: string): Promise<string[]> {
  const idx = await getIndice();
  const scored = new Map<string, number>();
  for (const frase of frasesDiscriminantes(texto)) {
    for (const [partida, corpus] of idx.corpusPorPartida) {
      if (fraseEnCorpus(frase, corpus)) {
        scored.set(partida, (scored.get(partida) ?? 0) + frase.split(" ").length);
      }
    }
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([p]) => p)
    .slice(0, 4);
}

/** Candidatas por segmentos separados por coma (cada uno nombra un rasgo del artículo). */
async function partidasPorSegmentos(texto: string): Promise<string[]> {
  const segmentos = segmentoPrincipal(texto)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length >= 10);
  const out: string[] = [];
  for (const seg of segmentos) {
    const cand = await partidasCandidatas(seg, { limite: 5 });
    for (const c of cand) {
      if (!out.includes(c.partida)) out.push(c.partida);
    }
  }
  return out.slice(0, 4);
}

/**
 * Repuesto industrial: cap. 87 fuera sin contexto automotor.
 * Si el paquete ya incluye partidas de PARTES, excluir encabezados de máquina completa.
 */
async function filtrarPartidasRepuestoIndustrial(
  texto: string,
  partidas: string[],
): Promise<string[]> {
  if (!esRepuestoOSuelto(texto) || esArticuloCompleto(texto)) return partidas;
  if (!contextoVehiculoEnTexto(texto)) {
    return partidas.filter((p) => !p.startsWith("87"));
  }
  return partidas;
}

/** Peso del encabezado legal por terminología estructural del nomenclador (partes/juntas/empaquetaduras). */
function pesoEncabezadoEstructural(desc: string): number {
  const h = corpusNormalizado(desc);
  let w = 0;
  if (/\bpartes\b/.test(h)) w++;
  if (/\bjuntas\b/.test(h)) w++;
  if (/\bempaquetaduras\b/.test(h)) w++;
  return w;
}

export function sustantivosPadreEnTexto(texto: string): string[] {
  const norm = corpusNormalizado(texto ?? "");
  const out: string[] = [];
  const re = /\b(?:del|de|para)\s+([a-z]{4,})(?:\s+(?:del|de)\s+([a-z]{4,}))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm)) !== null) {
    for (let i = 1; i <= 2; i++) {
      const w = m[i];
      if (!w || w.length < 4 || STOPWORDS_FILTRO_PARQUET.has(w)) continue;
      if (!out.includes(w)) out.push(w);
    }
  }
  return out;
}

export function corpusNormalizado(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // quitar diacríticos
    .replace(/[^a-z0-9\s]/g, " ")     // reemplazar puntuación con espacio
    .replace(/\s+/g, " ")             // normalizar espacios
    .trim();
}

/**
 * Verifica si `token` aparece como palabra completa en el corpus.
 * Acepta plural simple (+s), plural con vocal (+es) y raíz morfológica acotada.
 * Siempre con límite de palabra; no matchea subcadenas internas.
 */
export function tokenEnCorpus(token: string, corpus: string): boolean {
  const p = ` ${corpus} `;
  if (
    p.includes(` ${token} `) ||
    p.includes(` ${token}s `) ||
    p.includes(` ${token}es `)
  ) return true;
  const lastChar = token[token.length - 1];
  if (token.length >= 6 && "aeiou".includes(lastChar)) {
    const raiz = token.slice(0, -1);
    if (raiz.length >= 5 && new RegExp(` ${raiz}[a-z]+ `).test(p)) return true;
  }
  return false;
}

function claveEnCorpus(clave: string, corpus: string): boolean {
  if (clave.includes(" ")) return corpusNormalizado(corpus).includes(clave);
  return tokenEnCorpus(clave, corpus);
}

function truncar(s: string, max: number): string {
  const t = (s ?? "").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** Palabras clave para filtrar partidas, sin términos genéricos de tipo de artículo. */
/** Variantes morfológicas (-ador/-adora → -ado/-ada) para cruce con terminología del nomenclador. */
function variantesLexicaClave(w: string): string[] {
  const out = [w];
  if (w.endsWith("ador") && w.length > 6) out.push(`${w.slice(0, -2)}o`);
  if (w.endsWith("adora") && w.length > 7) out.push(`${w.slice(0, -3)}da`);
  return out;
}

function clavesParaPartidas(texto: string): string[] {
  const completo = esArticuloCompleto(texto);
  const calificador = genericoCalificador(texto);
  const fuente = completo ? textoSinColaPropulsion(texto) : texto;
  let raw = palabrasClaveHechos(fuente);

  const base = raw.filter(
    (c) => !GENERICOS_NOMBRE_PARTIDA.has(c) && !META_ESTADO_IMPORTADOR.has(c),
  );
  let claves = base.length
    ? base
    : raw.filter((c) => !META_ESTADO_IMPORTADOR.has(c));

  if (completo && calificador) {
    claves = [calificador, ...claves.filter((c) => c !== calificador)];
  }

  const tipoPalabras = palabrasTipoArticulo(texto).filter(
    (c) => !META_ESTADO_IMPORTADOR.has(c),
  );
  claves = [...new Set([...tipoPalabras, ...claves])];

  return expandClavesRetrieval([...claves, ...clavesFraseProducto(texto)]);
}

/** Partidas del nomenclador ordenadas por cantidad de palabras clave coincidentes. */
export async function partidasCandidatas(
  texto: string,
  opts?: {
    excluidas?: string[];
    limite?: number;
  },
): Promise<PartidaCandidata[]> {
  const idx = await getIndice();
  const excl = new Set(opts?.excluidas ?? []);
  const claves = clavesParaPartidas(texto);
  if (!claves.length) return [];

  const completo = esArticuloCompleto(texto);
  const repuesto = esRepuestoOSuelto(texto) && !completo;
  const contextoVehiculo = contextoVehiculoEnTexto(texto);
  const tipoPrincipal = palabraTipoPrincipal(texto);
  const tipoDf = tipoPrincipal
    ? (await partidasQueContienenClave(tipoPrincipal)).length
    : 0;

  const scored: Array<{
    c: PartidaCandidata;
    score: number;
    headingScore: number;
  }> = [];

  const pesoClave = new Map<string, number>();
  const prioritarias = clavesPrioritarias(texto);
  const frases = frasesDiscriminantes(texto);
  const dfCache = new Map<string, number>();
  const dfClave = async (k: string) => {
    if (!dfCache.has(k)) dfCache.set(k, (await partidasQueContienenClave(k)).length);
    return dfCache.get(k)!;
  };
  for (const k of claves) {
    const df = await dfClave(k);
    let w = 0;
    if (df === 0) {
      w = 0;
    } else if (df <= MAX_DF_CLAVE_DISCRIMINANTE) {
      w = MAX_DF_CLAVE_DISCRIMINANTE - df + 1;
    } else {
      w = 1 / df;
    }
    if (prioritarias.has(k)) w *= 2;
    pesoClave.set(k, w);
  }

  for (const [partida, corpus] of idx.corpusPorPartida) {
    if (excl.has(partida)) continue;
    if (repuesto && !contextoVehiculo && partida.startsWith("87")) continue;
    const headingCorpus = idx.headingCorpusPorPartida.get(partida) ?? "";
    let score = 0;
    let headingScore = 0;
    for (const k of claves) {
      const w = pesoClave.get(k) ?? 0;
      if (w <= 0) continue;
      if (claveEnCorpus(k, corpus)) score += w;
      if (claveEnCorpus(k, headingCorpus)) headingScore += w * 2;
    }
    for (const frase of frases) {
      if (fraseEnCorpus(frase, corpus)) {
        score += 6 + frase.split(" ").length * 2;
      }
      if (fraseEnCorpus(frase, headingCorpus)) {
        headingScore += 10 + frase.split(" ").length * 3;
      }
    }
    if (score > 0) {
      scored.push({
        c: { partida, descripcion: idx.partDesc.get(partida) ?? "" },
        score,
        headingScore,
      });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (tipoPrincipal) {
      const headA = idx.headingCorpusPorPartida.get(a.c.partida) ?? "";
      const headB = idx.headingCorpusPorPartida.get(b.c.partida) ?? "";
      const tipoEnA = tokenEnEncabezadoStrict(tipoPrincipal, headA) ? 1 : 0;
      const tipoEnB = tokenEnEncabezadoStrict(tipoPrincipal, headB) ? 1 : 0;
      if (tipoEnB !== tipoEnA) return tipoEnB - tipoEnA;
    }
    if (b.headingScore !== a.headingScore) return b.headingScore - a.headingScore;
    if (completo && tipoDf === 0) {
      const cap84A = a.c.partida.startsWith("84") ? 1 : 0;
      const cap84B = b.c.partida.startsWith("84") ? 1 : 0;
      if (cap84B !== cap84A) return cap84B - cap84A;
    }
    return a.c.partida.localeCompare(b.c.partida);
  });
  const out = scored.map((s) => s.c);
  const limite = opts?.limite;
  return limite != null && limite > 0 ? out.slice(0, limite) : out;
}

/**
 * Partidas cuyo encabezado (4 dígitos) menciona keywords del nombre o contexto «del/de/para».
 */
export async function partidasConHeadingMatch(nombreBase: string): Promise<PartidaCandidata[]> {
  const idx = await getIndice();
  const claves = clavesParaPartidas(nombreBase).slice(0, 6);
  const clavesPadre = sustantivosPadreEnTexto(nombreBase);
  const todas = [...new Set([...claves, ...clavesPadre])];
  if (!todas.length) return [];
  const minHits = todas.length >= 4 ? 2 : 1;
  const result: PartidaCandidata[] = [];
  const seen = new Set<string>();
  for (const [partida, desc] of idx.partDesc) {
    if (seen.has(partida)) continue;
    const headingCorpus = idx.headingCorpusPorPartida.get(partida) ?? "";
    const hits = todas.filter(
      (clave) =>
        !esHomofoniaEncabezado(clave, headingCorpus) &&
        (tokenEnEncabezadoStrict(clave, headingCorpus) || tokenEnCorpus(clave, headingCorpus)),
    ).length;
    if (hits >= minHits) {
      seen.add(partida);
      result.push({ partida, descripcion: desc });
    }
  }
  return result;
}

/** Término mencionado como accesorio (con/sin/incluso) y no como objeto del encabezado. */
function tipoSecundarioEnEncabezado(tipo: string, heading: string): boolean {
  const h = corpusNormalizado(heading);
  for (const v of variantesLexicaClave(tipo)) {
    if (new RegExp(`\\b(?:con|sin|incluso)\\s+${v}\\b`).test(h)) return true;
  }
  return false;
}

/** Partidas cuyo encabezado menciona el tipo principal del artículo. */
async function partidasConTipoEnHeading(texto: string): Promise<string[]> {
  const tipo = await palabraTipoDiscriminante(texto);
  if (!tipo) return [];
  const df = (await partidasQueContienenClave(tipo)).length;
  if (df === 0 || df > MAX_DF_CLAVE_DISCRIMINANTE) return [];
  const idx = await getIndice();
  const claves = clavesParaPartidas(texto);
  const variantes = variantesLexicaClave(tipo);
  const scored: Array<{ partida: string; hits: number; secundario: number }> = [];
  for (const [partida, desc] of idx.partDesc) {
    const heading = idx.headingCorpusPorPartida.get(partida) ?? corpusNormalizado(desc);
    if (variantes.some((v) => esHomofoniaEncabezado(v, heading))) continue;
    if (!variantes.some((v) => tokenEnEncabezadoStrict(v, heading) || tokenEnCorpus(v, heading))) {
      continue;
    }
    const hits = claves.filter(
      (c) =>
        !esHomofoniaEncabezado(c, heading) &&
        (tokenEnEncabezadoStrict(c, heading) || tokenEnCorpus(c, heading)),
    ).length;
    scored.push({
      partida,
      hits,
      secundario: tipoSecundarioEnEncabezado(tipo, heading) ? 1 : 0,
    });
  }
  scored.sort(
    (a, b) => a.secundario - b.secundario || b.hits - a.hits || a.partida.localeCompare(b.partida),
  );
  let out = scored.map((s) => s.partida).slice(0, 3);
  if (!out.length) {
    const cand = await partidasCandidatas(tipo, { limite: 6 });
    out = [];
    for (const c of cand) {
      const h = idx.headingCorpusPorPartida.get(c.partida) ?? "";
      if (tipoSecundarioEnEncabezado(tipo, h)) continue;
      if (!out.includes(c.partida)) out.push(c.partida);
      if (out.length >= 3) break;
    }
  }
  return out;
}

async function partidasQueContienenClave(clave: string): Promise<string[]> {
  const idx = await getIndice();
  const out: string[] = [];
  for (const [partida, corpus] of idx.corpusPorPartida) {
    if (tokenEnCorpus(clave, corpus)) out.push(partida);
  }
  return out;
}

/** Texto unificado para detectar tipo (viñetas suelen ser continuación, no otro artículo). */
function textoParaTipoDiscriminante(texto: string): string {
  return (texto ?? "").replace(/\s*[•–]\s*/g, " ").trim();
}

/** Coincidencia estricta en encabezado de partida (sin raíz morfológica amplia). */
function tokenEnEncabezadoStrict(token: string, heading: string): boolean {
  const p = ` ${corpusNormalizado(heading)} `;
  return (
    p.includes(` ${token} `) ||
    p.includes(` ${token}s `) ||
    p.includes(` ${token}es `)
  );
}

/** Variante morfológica válida en encabezado, no homofonía falsa. */
function esVarianteMorfoEncabezado(clave: string, palabra: string): boolean {
  if (tokenEnEncabezadoStrict(clave, palabra)) return true;
  if (tokenEnCorpus(clave, ` ${palabra} `)) {
    const raiz = clave.length >= 5 ? clave.slice(0, -1) : clave;
    if (palabra.startsWith(raiz)) {
      const suf = palabra.slice(raiz.length);
      if (/^(?:ar|er|ir|ado|ada|ados|adas|ante|antes|adora|adores)?$/.test(suf)) return true;
    }
  }
  return false;
}

/** Homofonía morfológica en encabezado sin subcadena válida. */
function esHomofoniaEncabezado(clave: string, heading: string): boolean {
  if (tokenEnEncabezadoStrict(clave, heading)) return false;
  const words = corpusNormalizado(heading).split(/\s+/);
  for (const w of words) {
    if (w.length < 4 || clave.length < 4) continue;
    if (w.includes(clave) || clave.includes(w)) continue;
    if (esVarianteMorfoEncabezado(clave, w)) continue;
    const prefLen = Math.min(clave.length, w.length, 5);
    if (clave.slice(0, prefLen) !== w.slice(0, prefLen)) continue;
    if (Math.abs(clave.length - w.length) <= 2) return true;
  }
  return false;
}

/** Tipo principal: clave poco frecuente entre palabras del texto. */
async function palabraTipoDiscriminante(texto: string): Promise<string | null> {
  const fuente = textoParaTipoDiscriminante(texto);
  const palabras = palabrasTipoArticulo(fuente).filter(
    (c) => !GENERICOS_NOMBRE_PARTIDA.has(c) && !META_ESTADO_IMPORTADOR.has(c),
  );
  const validos: Array<{ palabra: string; df: number; idx: number }> = [];
  for (let i = 0; i < palabras.length; i++) {
    const w = palabras[i]!;
    if (META_ESTADO_IMPORTADOR.has(w)) continue;
    const df = (await partidasQueContienenClave(w)).length;
    if (df < 4 || df > MAX_DF_CLAVE_DISCRIMINANTE) continue;
    validos.push({ palabra: w, df, idx: i });
  }
  validos.sort(
    (a, b) => a.df - b.df || b.idx - a.idx || a.palabra.localeCompare(b.palabra),
  );
  return validos[0]?.palabra ?? palabraTipoPrincipal(fuente);
}

/** Claves de HECHOS poco frecuentes en el nomenclador (alta especificidad). */
async function partidasPorClavesDiscriminantes(texto: string): Promise<string[]> {
  const claves = clavesParaPartidas(texto);
  const idx = await getIndice();
  const scored = new Map<string, number>();
  for (const c of claves) {
    const partidas = await partidasQueContienenClave(c);
    const df = partidas.length;
    if (df === 0 || df > MAX_DF_CLAVE_DISCRIMINANTE) continue;
    const peso = MAX_DF_CLAVE_DISCRIMINANTE - df + 1;
    for (const p of partidas) {
      const heading = idx.headingCorpusPorPartida.get(p) ?? "";
      if (esHomofoniaEncabezado(c, heading)) continue;
      let w = peso;
      if (tokenEnEncabezadoStrict(c, heading)) w *= 2;
      else if (tokenEnCorpus(c, heading)) w = Math.round(w * 1.5);
      scored.set(p, (scored.get(p) ?? 0) + w);
    }
  }
  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([p]) => p);
}

// ─── Pipeline simplificado ───────────────────────────────────────────────────

export type BloqueCandidatos = {
  partida: string;
  partidaDesc: string;
  sims: CandidatoNcm[];
};

/** Capítulos del nomenclador donde la partida identifica principalmente una materia. */
const CAPITULOS_MATERIA = new Set([
  "39", "40", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59",
  "70", "73", "76",
]);

const MATERIA_EN_HECHOS =
  /\b(?:plastico|plastica|caucho|goma|metal|metalic|acero|hierro|textil|algodon|nylon|poliuretano|pvc|polietileno|bronce|aluminio|madera|cuero|lona|sintetic)\b/;

export function materiaDeclaradaEnHechos(hechos: string): boolean {
  if (MATERIA_EN_HECHOS.test(corpusNormalizado(hechos ?? ""))) return true;
  return palabrasClaveHechos(hechos ?? "").some((w) => MATERIA_EN_HECHOS.test(w));
}

export function hayCompetenciaMaterialEntreBloques(bloques: BloqueCandidatos[]): boolean {
  const caps = new Set(
    bloques.map((b) => b.partida.slice(0, 2)).filter((c) => CAPITULOS_MATERIA.has(c)),
  );
  return caps.size >= 2;
}

/** Partidas de capítulos de materia cuando HECHOS ya declara materia (sin mapa tipo→capítulo). */
async function partidasPorMaterialDeclarado(
  textoNombreBase: string,
  texto: string,
): Promise<string[]> {
  if (!materiaDeclaradaEnHechos(texto)) return [];
  const candidatas = await partidasCandidatas(textoNombreBase);
  return candidatas
    .filter((c) => CAPITULOS_MATERIA.has(c.partida.slice(0, 2)))
    .map((c) => c.partida)
    .slice(0, 4);
}

/** True si el cierre elige una partida de materia sin que HECHOS la declare y hay alternativas. */
export function cierreAsumeMaterialSinHechos(
  hechos: string,
  ncm: string,
  bloques: BloqueCandidatos[],
): boolean {
  if (!hayCompetenciaMaterialEntreBloques(bloques)) return false;
  if (materiaDeclaradaEnHechos(hechos)) return false;
  const cap = (ncm ?? "").replace(/\D/g, "").slice(0, 2);
  return CAPITULOS_MATERIA.has(cap);
}

function simDeNcm(
  ncm: string,
  bloques: BloqueCandidatos[],
): { sim: CandidatoNcm; bloque: BloqueCandidatos } | null {
  const d = (ncm ?? "").replace(/\D/g, "");
  for (const b of bloques) {
    for (const s of b.sims) {
      if (s.codigo.replace(/\D/g, "") === d) return { sim: s, bloque: b };
    }
  }
  return null;
}

function hitsHechosEnBloque(bloque: BloqueCandidatos, hechos: string): number {
  const claves = palabrasClaveHechos(hechos);
  let corp = corpusNormalizado(bloque.partidaDesc);
  for (const s of bloque.sims) {
    corp += ` ${s.descripcion ?? ""} ${s.ruta ?? ""}`;
  }
  return claves.filter((k) => tokenEnCorpus(k, corp)).length;
}

/** Repuesto que cierra en encabezado de aparato completo sin encaje léxico con HECHOS. */
export function cierreRepuestoEnPartidaAparatoCompleto(
  hechos: string,
  ncm: string,
  bloques: BloqueCandidatos[],
): boolean {
  if (!esRepuestoOSuelto(hechos) || esArticuloCompleto(hechos)) return false;
  const found = simDeNcm(ncm, bloques);
  if (!found) return false;
  if (/\bpartes\b/.test(corpusNormalizado(found.bloque.partidaDesc))) return false;
  if (!esEncabezadoAparatoCompleto(found.bloque.partidaDesc)) return false;
  return hitsHechosEnBloque(found.bloque, hechos) < 2;
}

export function cierreInvalidoPorHechos(
  hechos: string,
  ncm: string,
  bloques: BloqueCandidatos[],
): boolean {
  return cierreAsumeMaterialSinHechos(hechos, ncm, bloques);
}

/** Menú final al motor: la IA elige partida y subpartida dentro de este tope. */
export const MAX_PARTIDAS_PAQUETE = 5;

/** Contexto automotor en HECHOS (palabras del texto, sin traducción). */
function contextoVehiculoEnTexto(texto: string): boolean {
  const norm = corpusNormalizado(texto ?? "");
  return /\b(?:vehiculo|automovil|automotor|camion|omnibus|egr)\b/.test(norm);
}

export type ArgsPartidasPaquete = {
  textoNombreBase: string;
  textoFiltro: string;
  textoSims: string;
};

/** Si el corte top-5 dejó fuera partidas fuertes del merge, recupera una. */
function promoverReservaMerge(merged: PartidaCandidata[], out: string[]): string[] {
  const resultado = [...out];
  for (const c of merged.slice(MAX_PARTIDAS_PAQUETE, MAX_PARTIDAS_PAQUETE + 8)) {
    if (resultado.includes(c.partida)) continue;
    if (resultado.length < MAX_PARTIDAS_PAQUETE) {
      resultado.push(c.partida);
    } else {
      resultado[MAX_PARTIDAS_PAQUETE - 1] = c.partida;
    }
    break;
  }
  return resultado;
}

/** Combina ranking léxico principal con refuerzos de rutas estructurales. */
function combinarPartidasConBonus(
  principal: PartidaCandidata[],
  refuerzos: Array<{ partidas: string[]; peso: number }>,
  limite: number,
): PartidaCandidata[] {
  const idx = new Map(principal.map((c) => [c.partida, c]));
  const score = new Map<string, number>();
  for (let i = 0; i < principal.length; i++) {
    score.set(principal[i]!.partida, principal.length - i);
  }
  for (const { partidas, peso } of refuerzos) {
    for (let i = 0; i < partidas.length; i++) {
      const p = partidas[i]!;
      score.set(p, (score.get(p) ?? 0) + peso / (i + 1));
    }
  }
  const extra: PartidaCandidata[] = [];
  for (const [partida, s] of score) {
    if (idx.has(partida)) continue;
    if (s < 1) continue;
    extra.push({ partida, descripcion: "" });
  }
  return [...principal, ...extra]
    .sort(
      (a, b) =>
        (score.get(b.partida) ?? 0) - (score.get(a.partida) ?? 0) ||
        a.partida.localeCompare(b.partida),
    )
    .slice(0, limite);
}

/**
 * Resuelve las partidas del menú (máx. 5). Solo retrieval: la IA elige partida y subpartida.
 */
export async function resolverPartidasPaquete(args: ArgsPartidasPaquete): Promise<string[]> {
  const { textoNombreBase, textoFiltro, textoSims } = args;

  const repuesto = esRepuestoOSuelto(textoSims) && !esArticuloCompleto(textoSims);

  const principal = await partidasCandidatas(textoSims, { limite: 20 });
  const alternativas = await Promise.all(
    [...new Set([textoFiltro, textoNombreBase].filter((t) => t.trim() && t !== textoSims))].map(
      (t) => partidasCandidatas(t, { limite: 12 }),
    ),
  );
  for (const alt of alternativas) {
    for (const c of alt) {
      if (!principal.some((p) => p.partida === c.partida)) principal.push(c);
    }
  }

  const porDiscriminantes = await partidasPorClavesDiscriminantes(textoSims);
  const porMaterial = await partidasPorMaterialDeclarado(textoNombreBase, textoSims);
  const porPartesPadre = [
    ...new Set([
      ...(await partidasPartesPorMaquinaPadre(textoSims)),
      ...(await partidasPartesPorHits(textoSims)),
    ]),
  ].slice(0, 4);
  const porFrases = await partidasPorFrasesDiscriminantes(textoSims);
  const porSegmentos = await partidasPorSegmentos(textoSims);
  const porHeadingTexto = (await partidasConHeadingMatch(textoSims)).map((c) => c.partida).slice(0, 4);
  const porTipoHeading = await partidasConTipoEnHeading(textoSims);

  const refuerzos: Array<{ partidas: string[]; peso: number }> = [
    { partidas: porTipoHeading, peso: 4 },
    { partidas: porDiscriminantes, peso: 3 },
    { partidas: porSegmentos, peso: 3 },
    { partidas: porFrases, peso: 2.5 },
    { partidas: porHeadingTexto, peso: 2 },
    { partidas: porMaterial, peso: 1.5 },
  ];
  if (repuesto) refuerzos.push({ partidas: porPartesPadre, peso: 3 });

  const merged = combinarPartidasConBonus(principal, refuerzos, 15);
  let out = merged.map((c) => c.partida).slice(0, MAX_PARTIDAS_PAQUETE);
  out = promoverReservaMerge(merged, out);

  return (await filtrarPartidasRepuestoIndustrial(textoSims, out)).slice(0, MAX_PARTIDAS_PAQUETE);
}

/** Benchmark y diagnóstico: solo partidas, sin ranking de SIMs. */
export async function partidasMotor(args: ArgsPartidasPaquete): Promise<string[]> {
  return resolverPartidasPaquete(args);
}

/**
 * Paquete para IA: las ~5 partidas del motor con todas sus SIMs.
 * Sin ranking ni tope: la IA elige partida y NCM con marco legal.
 */
export async function paquetePartidasParaIa(args: ArgsPartidasPaquete): Promise<BloqueCandidatos[]> {
  const partidas4 = await resolverPartidasPaquete(args);
  if (!partidas4.length) return [];

  const bloques: BloqueCandidatos[] = [];
  for (const p4 of partidas4) {
    const partidaDesc = (await descripcionPartida(p4)) || "";
    const sims = await candidatosDePartida(p4);
    if (!sims.length) continue;
    bloques.push({ partida: p4, partidaDesc, sims });
  }
  return bloques;
}

// ─────────────────────────────────────────────────────────────────────────────

const MAX_MENU_PARTIDAS = 40;

/** Menú acotado al tope máximo (las partidas ya vienen ordenadas por hits). */
export async function acotarMenuPartidas(
  candidatas: PartidaCandidata[],
  excluidas: string[] = [],
  maxPartidas = MAX_MENU_PARTIDAS,
): Promise<PartidaCandidata[]> {
  const excl = new Set(excluidas);
  const filtradas = excl.size ? candidatas.filter((c) => !excl.has(c.partida)) : candidatas;
  const tope = maxPartidas > 0 ? maxPartidas : MAX_MENU_PARTIDAS;
  return filtradas.slice(0, tope);
}

/**
 * Niveles iniciales de `ruta` en el parquet: 0 = sección, 1 = encabezado de partida (4 dígitos).
 * Compartidos por todas las SIM de la partida; no forman parte del texto legal discriminante.
 */
export const NIVELES_ENCABEZADO_PARQUET = 2;

/** Segmentos finales en UI: subpartida inmediata + hoja SIM (sin truncar la rama legal del cruce). */
const NIVELES_RESUMIDO_UI = 2;

function partesRuta(c: { ruta?: string }): string[] {
  return (c.ruta ?? "")
    .split(" > ")
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Segmentos legales de una SIM: rama de partida (sin sección/capítulo) + hoja si no está en la ruta. */
export function segmentosRamaLegal(c: { descripcion?: string; ruta?: string }): string[] {
  const parts = partesRuta(c);
  const rama =
    parts.length > NIVELES_ENCABEZADO_PARQUET
      ? parts.slice(NIVELES_ENCABEZADO_PARQUET)
      : parts;
  const desc = (c.descripcion ?? "").trim();
  if (!desc) return rama;
  const j = corpusNormalizado(rama.join(" > "));
  const d = corpusNormalizado(desc);
  if (j.includes(d) || j.endsWith(d)) return rama;
  return [...rama, desc];
}

/** Texto legal completo de una SIM (sin truncar niveles). */
export function textoLegalCompleto(c: { descripcion?: string; ruta?: string }): string {
  const segs = segmentosRamaLegal(c);
  return segs.length ? segs.join(" > ") : (c.descripcion ?? "").trim();
}

function prefijoComunSegmentos(listas: string[][]): string[] {
  if (!listas.length) return [];
  const first = listas[0]!;
  const pref: string[] = [];
  for (let i = 0; i < first.length; i++) {
    const seg = first[i]!;
    if (listas.every((l) => l[i] === seg)) pref.push(seg);
    else break;
  }
  return pref;
}

/**
 * Listado para cruce IA: prefijo legal compartido una vez por grupo de hermanas;
 * cada SIM muestra solo lo que la distingue (sin repetir la rama entera).
 */
export function formatearGrupoSimsListado(
  sims: Array<{ codigo: string; descripcion?: string; ruta?: string }>,
): string {
  if (!sims.length) return "";
  if (sims.length === 1) {
    const s = sims[0]!;
    return `  - ${s.codigo} | ${textoLegalCompleto(s)}`;
  }

  const segmentos = sims.map((s) => segmentosRamaLegal(s));
  const prefijo = prefijoComunSegmentos(segmentos);

  if (prefijo.length >= (segmentos[0]?.length ?? 0)) {
    const común = textoLegalCompleto(sims[0]!);
    const lineas = sims.map((s) => `  - ${s.codigo}`).join("\n");
    return `  Rama común: ${común}\n${lineas}`;
  }

  const lineas = sims.map((s, i) => {
    const resto = segmentos[i]!.slice(prefijo.length);
    const sufijo = resto.length ? resto.join(" > ") : textoLegalCompleto(s);
    return `  - ${s.codigo} | ${sufijo}`;
  });

  if (!prefijo.length) return lineas.join("\n");
  return `  Rama común: ${prefijo.join(" > ")}\n${lineas.join("\n")}`;
}

/**
 * Texto legal resumido para UI y listados compactos (fase 1).
 * Misma rama legal completa; muestra solo los dos últimos segmentos (subpartida + hoja SIM).
 */
export function textoLegalResumido(c: { descripcion?: string; ruta?: string }): string {
  const segs = segmentosRamaLegal(c);
  if (!segs.length) return (c.descripcion ?? "").trim();
  const tail = segs.length > NIVELES_RESUMIDO_UI ? segs.slice(-NIVELES_RESUMIDO_UI) : segs;
  return tail.join(" > ");
}

/** Línea residual del nomenclador («Las demás», «Los demás»). */
export function esLineaResidual(descripcion: string): boolean {
  const d = corpusNormalizado(descripcion).replace(/^-+/g, "").trim();
  return d.startsWith("las demas") || d.startsWith("los demas");
}

/** Encabezado de rama compuesto solo por residuales genéricas («Los demás aparatos…», etc.). */
export function encabezadoLegalGenerico(texto: string): boolean {
  const d = corpusNormalizado(texto).replace(/:+$/, "").trim();
  return d.startsWith("los demas") || d.startsWith("las demas");
}

export function prefijoSubpartidaCodigo(codigo: string): string {
  const parts = (codigo ?? "").trim().split(".");
  return parts.length >= 3 ? parts.slice(0, 3).join(".") : (codigo ?? "").trim();
}

export function agruparSimsPorSubpartida<T extends { codigo: string }>(
  sims: T[],
): Map<string, T[]> {
  const porSub = new Map<string, T[]>();
  for (const s of sims) {
    const k = prefijoSubpartidaCodigo(s.codigo);
    const arr = porSub.get(k) ?? [];
    arr.push(s);
    porSub.set(k, arr);
  }
  return porSub;
}

export function encabezadoTipificacionGrupo(
  sims: Array<{ descripcion?: string; ruta?: string }>,
): string {
  if (!sims.length) return "";
  const segs = segmentosRamaLegal(sims[0]!);
  if (segs.length <= 1) return segs.join(" > ");
  return segs.slice(0, -1).join(" > ");
}

export function tipificacionGrupoEsGenerica(
  sims: Array<{ codigo: string; descripcion?: string; ruta?: string }>,
): boolean {
  const segs = segmentosRamaLegal(sims[0]!);
  const tip = segs.length > 1 ? segs.slice(0, -1) : segs;
  return tip.every(encabezadoLegalGenerico);
}

function lexemaCompartidoConHechos(palabra: string, hechos: string): boolean {
  if (palabra.length < 4) return false;
  return tokenEnCorpus(palabra, corpusNormalizado(hechos));
}

function lexemaCompartidoEntreTextos(a: string, b: string): boolean {
  const corpA = corpusNormalizado(a);
  const corpB = corpusNormalizado(b);
  for (const t of corpA.split(/\s+/)) {
    if (t.length < 4) continue;
    if (tokenEnCorpus(t, corpB)) return true;
  }
  for (const t of corpB.split(/\s+/)) {
    if (t.length < 4) continue;
    if (tokenEnCorpus(t, corpA)) return true;
  }
  return false;
}

/** ¿La tipificación legal (encabezados intermedios) conecta con lo escrito en HECHOS? */
export function tipificacionEncajaConHechos(tipificacion: string, hechos: string): boolean {
  if (!tipificacion.trim()) return false;
  for (const seg of tipificacion.split(" > ")) {
    if (encabezadoLegalGenerico(seg)) continue;
    if (lexemaCompartidoEntreTextos(seg, hechos)) return true;
  }
  return false;
}

function hojaEspecificaEncajaConHechos(
  sim: { descripcion?: string; ruta?: string },
  hechos: string,
): boolean {
  const leaf = segmentosRamaLegal(sim).at(-1) ?? "";
  if (esLineaResidual(leaf)) return false;
  let score = 0;
  for (const t of corpusNormalizado(leaf).split(/\s+/)) {
    if (t.length < 5 || encabezadoLegalGenerico(t)) continue;
    if (lexemaCompartidoConHechos(t, hechos)) score++;
  }
  return score >= 2;
}

function primerSegmentoTipificacion(
  sims: Array<{ codigo: string; descripcion?: string; ruta?: string }>,
): string {
  const segs = segmentosRamaLegal(sims[0]!);
  const tip = segs.length > 1 ? segs.slice(0, -1) : segs;
  const first = tip.find((s) => !encabezadoLegalGenerico(s));
  return first ?? "";
}

function elegirEntreGruposTipificados(
  grupos: Array<Array<{ codigo: string; descripcion?: string; ruta?: string }>>,
  hechos: string,
): string {
  const ordenados = [...grupos].sort((a, b) =>
    prefijoSubpartidaCodigo(a[0]!.codigo).localeCompare(prefijoSubpartidaCodigo(b[0]!.codigo)),
  );
  for (const sims of ordenados) {
    const especifica = sims.find((s) => hojaEspecificaEncajaConHechos(s, hechos));
    if (especifica) return especifica.codigo;
  }
  const ultimo = ordenados[ordenados.length - 1]!;
  return simPreferidaEnGrupo(ultimo, hechos);
}

function simPreferidaEnGrupo(
  sims: Array<{ codigo: string; descripcion?: string; ruta?: string }>,
  hechos: string,
): string {
  if (sims.length === 1) return sims[0]!.codigo;
  let mejor: { codigo: string; score: number } | null = null;
  for (const s of sims) {
    const leaf = segmentosRamaLegal(s).at(-1) ?? "";
    if (esLineaResidual(leaf)) continue;
    let score = 0;
    for (const t of corpusNormalizado(leaf).split(/\s+/)) {
      if (t.length >= 4 && lexemaCompartidoConHechos(t, hechos)) score++;
    }
    if (!mejor || score > mejor.score) mejor = { codigo: s.codigo, score };
  }
  if (mejor && mejor.score > 0) return mejor.codigo;
  const residual = sims.find((s) => esLineaResidual(segmentosRamaLegal(s).at(-1) ?? ""));
  return residual?.codigo ?? sims[0]!.codigo;
}

/**
 * Si el NCM elegido cae en una cadena genérica de residuales pero hay una rama tipificada
 * del listado cuya tipificación encaja con HECHOS, devuelve el NCM de esa rama (RGI 3 a)).
 */
export function ncmPreferidaPorTipificacion(
  hechos: string,
  bloques: BloqueCandidatos[],
  ncmElegido: string,
): string | null {
  const elegido = (ncmElegido ?? "").trim().toUpperCase();
  if (!elegido) return null;

  let partidaElegida: string | null = null;
  for (const b of bloques) {
    for (const sims of agruparSimsPorSubpartida(b.sims).values()) {
      if (!sims.some((s) => s.codigo.toUpperCase() === elegido)) continue;
      if (!tipificacionGrupoEsGenerica(sims)) return null;
      partidaElegida = b.partida;
      break;
    }
    if (partidaElegida) break;
  }
  if (!partidaElegida) return null;

  let mejor: { ncm: string; profundidad: number } | null = null;
  const familias = new Map<
    string,
    Array<Array<{ codigo: string; descripcion?: string; ruta?: string }>>
  >();

  for (const b of bloques) {
    if (b.partida !== partidaElegida) continue;
    for (const sims of agruparSimsPorSubpartida(b.sims).values()) {
      if (tipificacionGrupoEsGenerica(sims)) continue;
      const tip = encabezadoTipificacionGrupo(sims);
      if (!tipificacionEncajaConHechos(tip, hechos)) continue;
      const fam = corpusNormalizado(primerSegmentoTipificacion(sims));
      const arr = familias.get(fam) ?? [];
      arr.push(sims);
      familias.set(fam, arr);
    }
  }

  for (const grupos of familias.values()) {
    const ncm = elegirEntreGruposTipificados(grupos, hechos);
    const profundidad = grupos.length;
    if (!mejor || profundidad > mejor.profundidad) mejor = { ncm, profundidad };
  }

  if (!mejor || mejor.ncm.toUpperCase() === elegido) return null;
  return mejor.ncm;
}

export function etiquetaPartidaCandidata(c: PartidaCandidata): string {
  return `${c.partida} — ${truncar(c.descripcion, 95)}`;
}

/** Línea del nomenclador que mejor coincide con una NCM (exacta o por prefijo). */
export async function lineaNcmEnParquet(
  ncm: string,
): Promise<CandidatoNcm | null> {
  const digitos = (ncm ?? "").replace(/\D/g, "");
  if (digitos.length < 6) return null;
  const candidatos = await candidatosDePartida(digitos.slice(0, 4));
  const exacto = candidatos.find(
    (c) => (c.codigo ?? "").replace(/\D/g, "") === digitos,
  );
  if (exacto) return exacto;
  let mejor: CandidatoNcm | null = null;
  let mejorLargo = -1;
  for (const c of candidatos) {
    const d = (c.codigo ?? "").replace(/\D/g, "");
    const n = Math.min(d.length, digitos.length);
    let i = 0;
    while (i < n && d[i] === digitos[i]) i++;
    if (i >= 6 && i > mejorLargo) {
      mejor = c;
      mejorLargo = i;
    }
  }
  return mejor;
}

function padreInmediatoNum(codigo: string, arbol: ArbolPartida): string | null {
  const cn = arbol.numPorCodigo.get(codigo);
  if (!cn) return null;
  let padre: string | null = null;
  for (const num of arbol.codigoPorNum.keys()) {
    if (num.length < cn.length && cn.startsWith(num)) {
      if (!padre || num.length > padre.length) padre = num;
    }
  }
  return padre;
}

async function arbolDePartida(partida4: string): Promise<ArbolPartida | null> {
  const idx = await getIndice();
  return idx.arbolPorPartida.get(partida4.replace(/\D/g, "").slice(0, 4)) ?? null;
}

/**
 * Hermanos del mismo nodo (mismo padre en codigo_num) con 2+ hojas en el conjunto.
 * Elige el grupo más profundo — disputa real del nomenclador, no todo el menú filtrado.
 */
export async function hermanosDisputadosEnCandidatos(
  candidatos: CandidatoNcm[],
  partida4: string,
): Promise<CandidatoNcm[] | null> {
  const arbol = await arbolDePartida(partida4);
  if (!arbol || candidatos.length < 2) return null;

  const porPadre = new Map<string, CandidatoNcm[]>();
  for (const c of candidatos) {
    const k = padreInmediatoNum(c.codigo, arbol) ?? "";
    const arr = porPadre.get(k) ?? [];
    arr.push(c);
    porPadre.set(k, arr);
  }

  let mejor: CandidatoNcm[] | null = null;
  let mejorProfundidad = -1;
  for (const [padre, grupo] of porPadre) {
    if (grupo.length < 2) continue;
    const prof = padre.length;
    if (prof > mejorProfundidad) {
      mejorProfundidad = prof;
      mejor = grupo;
    }
  }
  return mejor;
}

/** Hermanos del mismo padre inmediato que `codigo` dentro de `candidatos`. */
export async function hermanosDeCodigoEnPartida(
  codigo: string,
  partida4: string,
  candidatos?: CandidatoNcm[],
): Promise<CandidatoNcm[]> {
  const cand = candidatos ?? (await candidatosDePartida(partida4));
  const arbol = await arbolDePartida(partida4);
  if (!arbol) return [];
  const padre = padreInmediatoNum(codigo, arbol);
  if (!padre) return [];
  const grupo = cand.filter((c) => padreInmediatoNum(c.codigo, arbol) === padre);
  return grupo.length >= 2 ? grupo : [];
}

/** Etiqueta de subpartida (XXXX.YY) desde un código NCM/SIM. */
export function etiquetaSubpartida(codigo: string): string {
  const parts = (codigo ?? "").trim().split(".");
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]}.${parts[1]}`;
}

/** Agrupa candidatos SIM por subpartida (segundo nivel del nomenclador). */
export function agruparCandidatosPorSubpartida(
  candidatos: CandidatoNcm[],
): Map<string, CandidatoNcm[]> {
  const por = new Map<string, CandidatoNcm[]>();
  for (const c of candidatos) {
    const k = etiquetaSubpartida(c.codigo);
    const arr = por.get(k) ?? [];
    arr.push(c);
    por.set(k, arr);
  }
  return por;
}

export type SubpartidaCandidata = {
  subpartida: string;
  descripcion: string;
};

const MAX_RIVALES_SUBPARTIDA = 6;

/** Subpartidas rivales del árbol (rama distinta a la hipótesis). Fase B aplica marco legal. */
export async function subpartidasRivalesEnPartida(
  partida4: string,
  opts?: { excluir?: string; limite?: number },
): Promise<SubpartidaCandidata[]> {
  const candidatos = await candidatosDePartida(partida4);
  const porSub = agruparCandidatosPorSubpartida(candidatos);
  const out: SubpartidaCandidata[] = [];

  for (const [subpartida, grupo] of porSub) {
    if (opts?.excluir && subpartida === opts.excluir) continue;
    const validas = grupo.filter((c) => !esLineaResidual(c.descripcion ?? ""));
    if (!validas.length) continue;
    const desc = validas.find((c) => c.descripcion?.trim())?.descripcion?.trim() ?? "";
    out.push({ subpartida, descripcion: desc.slice(0, 120) });
  }

  out.sort((a, b) => a.subpartida.localeCompare(b.subpartida));
  const limite = opts?.limite ?? MAX_RIVALES_SUBPARTIDA;
  return limite > 0 ? out.slice(0, limite) : out;
}

/**
 * Hermanos en disputa del nomenclador dentro de un grupo (misma subpartida).
 * Si hay 2+ hermanos → todos. Si no → todas las líneas no residuales del grupo.
 */
export async function lineasDisputaParaCruce(
  candidatos: CandidatoNcm[],
  _texto: string,
  partida4: string,
): Promise<CandidatoNcm[]> {
  const ok = candidatos.filter((c) => !esLineaResidual(c.descripcion ?? ""));
  if (!ok.length) return [];

  const disputa = await hermanosDisputadosEnCandidatos(ok, partida4);
  if (disputa && disputa.length >= 2) {
    return [...disputa]
      .filter((c) => !esLineaResidual(c.descripcion ?? ""))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  }

  return ok.sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/** Largo del prefijo común entre dos cadenas de dígitos. */
function prefijoComun(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

async function diDeHoja(h: Hoja): Promise<number> {
  const trib = await tributacionPorSim(simCodigo(h.codigo));
  return dieAplicable(trib, h.ar3);
}

/**
 * Aranceles oficiales para una NCM ya definida.
 * Importación: DIE aplicable desde VUCE (Anexo III BK, etc.); respaldo ar3.
 */
export async function arancelPorNcm(
  ncm: string | null | undefined,
): Promise<{
  ncm8: string;
  codigo: string;
  /** Derecho de Importación extrazona aplicable (%). */
  di: number;
  /** Tarifa nominal del nomenclador (ar3), referencia AEC. */
  diNominal: number;
  aec: number | null;
  dii: number | null;
  te: number | null;
  bk: boolean;
  dieRegimen: string | null;
  dieDesdeVuce: boolean;
  /** Derecho de Exportación (DE) %. */
  de: number;
  /** Reintegro a la exportación (extrazona) %. */
  reintegro: number;
  /** Reintegro a la exportación intrazona %. */
  reintegroIntra: number;
  /** Derecho adicional (sectores sensibles) %. */
  adicional: number;
  iva: number;
  ivaAdicional: number | null;
  ivaEstimado: boolean;
} | null> {
  const digitos = (ncm ?? "").replace(/\D/g, "");
  if (digitos.length < 6) return null;
  const idx = await getIndice();
  const hojas = idx.porPartida.get(digitos.slice(0, 4)) ?? [];

  let mejor: Hoja | null = null;
  let mejorLargo = -1;
  for (const h of hojas) {
    if (h.nivel !== "sim" && h.nivel !== "ncm") continue;
    const comun = prefijoComun(h.codigoNum, digitos);
    if (comun >= 6 && comun > mejorLargo) {
      mejor = h;
      mejorLargo = comun;
    }
  }
  if (!mejor) return null;

  const imp = await enriquecerArancelImportacion(
    mejor.codigo,
    mejor.ar3,
    ivaEstimado(mejor.codigoNum),
  );

  return {
    ncm8: mejor.codigoNum.slice(0, 8),
    codigo: mejor.codigo,
    di: imp.di,
    diNominal: imp.diNominal,
    aec: imp.aec,
    dii: imp.dii,
    te: imp.te,
    bk: imp.bk,
    dieRegimen: imp.dieRegimen,
    dieDesdeVuce: imp.dieDesdeVuce,
    de: mejor.ar1,
    reintegro: mejor.ar2,
    reintegroIntra: mejor.ar4,
    adicional: mejor.ar5,
    iva: imp.iva ?? ivaEstimado(mejor.codigoNum),
    ivaAdicional: imp.ivaAdicional,
    ivaEstimado: imp.iva == null,
  };
}

/**
 * Derecho de Importación (DIE, ar3) oficial para una NCM. Compatibilidad con el
 * cálculo de liquidación; delega en arancelPorNcm.
 */
export async function derechoPorNcm(
  ncm: string | null | undefined,
): Promise<{ ncm8: string; di: number; codigo: string } | null> {
  const a = await arancelPorNcm(ncm);
  if (!a) return null;
  return { ncm8: a.ncm8, di: a.di, codigo: a.codigo };
}

/**
 * Posición arancelaria específica (NCM-8 mínimo) que figura en el nomenclador.
 * Rechaza subpartidas de 6 dígitos aunque existan en el índice por prefijo.
 */
export async function ncmEsPosicionEspecifica(
  ncm: string | null | undefined,
): Promise<{
  ok: boolean;
  digitos: string;
  codigo: string | null;
  motivo?: string;
}> {
  const digitos = (ncm ?? "").replace(/\D/g, "");
  if (digitos.length < 8) {
    return {
      ok: false,
      digitos,
      codigo: null,
      motivo:
        "La NCM debe tener al menos 8 dígitos. Una subpartida de 6 dígitos es demasiado general.",
    };
  }
  const pref8 = digitos.slice(0, 8);
  const idx = await getIndice();
  const hojas = idx.porPartida.get(pref8.slice(0, 4)) ?? [];
  const match = hojas.find(
    (h) =>
      (h.nivel === "sim" || h.nivel === "ncm") &&
      h.codigoNum.length >= 8 &&
      h.codigoNum.startsWith(pref8),
  );
  if (!match) {
    return {
      ok: false,
      digitos: pref8,
      codigo: null,
      motivo:
        "Esa posición no figura en el nomenclador. Usá el buscador para afinar la subpartida.",
    };
  }
  return { ok: true, digitos: pref8, codigo: match.codigo };
}
