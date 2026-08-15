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
import { textoFiltroConfiable } from "./estado-clasificacion";
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
  "unidad",
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
  /** Unidad estadística del Arancel, como código ("07"). */
  unidad: string | null;
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
  /** Encabezado sin los complementos de destino («… para X»). */
  nucleoHeadingPorPartida: Map<string, string>;
  numPartidas: number;
};

type ArbolPartida = {
  descPorCodigo: Map<string, string>;
  numPorCodigo: Map<string, string>;
  codigoPorNum: Map<string, string>;
};

let indicePromesa: Promise<Indice> | null = null;

/**
 * Encabezado sin sus complementos de destino: en «carretes para cables» el
 * artículo clasificado son los carretes. Cada cláusula se corta en su primer
 * «para», antes de normalizar (el `;` separa cláusulas y la normalización lo
 * borra).
 *
 * Solo alimenta un bonus de ranking, nunca un filtro: el nomenclador usa
 * «para X» para definir el artículo con frecuencia («máquinas para lavar
 * ropa»), así que quitar esas coincidencias perdería partidas legítimas.
 */
function nucleoEncabezado(texto: string): string {
  return (texto ?? "")
    .split(";")
    .map((clausula) => clausula.split(/\s+para\s+/i)[0] ?? "")
    .filter((s) => s.trim())
    .join(" ; ");
}

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
      unidad: (f["unidad"] ?? "").trim() || null,
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
  const nucleoHeadingPorPartida = new Map<string, string>();
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
    nucleoHeadingPorPartida.set(p4, corpusNormalizado(nucleoEncabezado(desc)));
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
    nucleoHeadingPorPartida,
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

/**
 * Subpartidas (6 dígitos) de una partida, para mostrar dentro de qué rama cayó
 * la posición y qué otras ramas hermanas existen.
 *
 * El parquet no siempre trae la fila de nivel subpartida (8205 y 5501 no la
 * tienen, 0302 sí), así que cuando falta se derivan de los códigos de las
 * propias líneas, que siempre están.
 */
export async function subpartidasDePartida(p4: string): Promise<SubpartidaResumen[]> {
  const directas = await subpartidasPrimerNivel(p4);
  if (directas.length) return directas;

  const sims = await candidatosDePartida(p4);
  const porNumero = new Map<string, string[][]>();
  for (const s of sims) {
    const num = (s.codigo ?? "").replace(/\D/g, "").slice(0, 6);
    if (num.length < 6) continue;
    const grupo = porNumero.get(num) ?? [];
    grupo.push(segmentosRamaLegal(s));
    porNumero.set(num, grupo);
  }

  // Lo que comparte toda la partida no distingue nada: el texto propio de la
  // subpartida es lo primero que aparece después de ese tronco común.
  const comunPartida = prefijoComunSegmentos(
    [...porNumero.values()].flat(),
  ).length;

  return [...porNumero.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 12)
    .map(([num, listas]) => {
      const propios = prefijoComunSegmentos(listas).slice(comunPartida);
      const descripcion =
        [...propios].reverse().find((s) => s.trim()) ??
        listas[0]?.[listas[0].length - 1] ??
        "";
      return {
        codigo: `${num.slice(0, 4)}.${num.slice(4, 6)}`,
        // El parquet marca el nivel con guiones al principio («--Anchoas») y
        // cierra con dos puntos: sobra en una lista que ya muestra el código.
        descripcion: descripcion
          .replace(/^[-\s]+/, "")
          .replace(/[.:]$/, "")
          .trim(),
      };
    });
}

export type PartidaCandidata = {
  partida: string;
  descripcion: string;
  /** Primera subdivisión (6 dígitos): se incluye para las top partidas para guiar Fase 1. */
  subpartidas?: SubpartidaResumen[];
};

/** Máx. partidas en las que puede aparecer una clave para tratarla como discriminante. */
const MAX_DF_CLAVE_DISCRIMINANTE = 15;

/**
 * Palabras funcionales que no discriminan partidas en el filtro parquet.
 * Se incluyen voces de 3 letras: el mínimo de longitud es 3, para no perder
 * sustantivos cortos del artículo (pan, sal, gas, gel, oro, res, ave, col, ajo…).
 */
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
  // Voces funcionales de 3 letras (no son nombres de artículo).
  "con", "por", "los", "las", "una", "que", "sin", "del",
  "aun", "tan", "sus", "tus", "mis", "nos", "les",
  "son", "han", "hay", "sea", "ser", "fue", "uno", "dos",
  "esa", "ese", "eso", "van", "cuyo", "cuya",
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

function primerSegmentoFacturado(texto: string): string {
  return (texto ?? "").split(",")[0]?.trim() ?? (texto ?? "").trim();
}

/** Meta comercial al final («, accesorio», «, repuesto suelto») sin redefinir el núcleo. */
function metaRepuestoSoloEnCola(texto: string): boolean {
  const segmentos = (texto ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (segmentos.length < 2) return false;
  const ultimo = corpusNormalizado(segmentos.at(-1) ?? "");
  return (
    META_ESTADO_IMPORTADOR.has(ultimo) ||
    /^(?:repuesto|repuestos|accesorio|accesorios|reemplazo|oem|spare|suelto|sueltas)$/.test(
      ultimo,
    )
  );
}

function segmentoPrincipal(texto: string): string {
  return (texto ?? "").split(/[\-–•·,;]/)[0]?.trim() ?? (texto ?? "");
}

/** Quita cola «con motor …» al final: propulsión accesoria, no tipo de máquina. */
function textoSinColaPropulsion(texto: string): string {
  return segmentoPrincipal(texto).replace(/\s+con\s+(?:un\s+)?motor\b[\s\S]*$/i, "").trim();
}

/** HECHOS declara artículo terminado (no repuesto ni componente suelto). */
export function esArticuloCompleto(texto: string): boolean {
  const primer = primerSegmentoFacturado(texto);
  const head = corpusNormalizado(textoSinColaPropulsion(primer));

  if (/^partes\b/.test(head)) return false;

  if (PREFIJO_ARTICULO_COMPLETO.test(head)) {
    const nucleo = head.split(/\s+con\s+/)[0] ?? head;
    return !INDICADORES_FORMA_REPUESTO.test(nucleo);
  }

  if (INDICADORES_FORMA_REPUESTO.test(head.split(/\s+/).slice(0, 4).join(" "))) {
    return false;
  }

  const tipoWords = palabrasClaveHechos(primer).filter(
    (c) => !META_ESTADO_IMPORTADOR.has(c) && !GENERICOS_NOMBRE_PARTIDA.has(c),
  );
  if (tipoWords.length >= 1 && head.split(/\s+/).filter(Boolean).length >= 2) {
    return true;
  }

  return contextoVehiculoEnTexto(primer);
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
  "kg", "ton", "litro", "l", "gal", "psi", "g",
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

/** Palabras del producto + respuestas para filtrar parquet (mín. 3 letras; sin stopwords). */
export function palabrasClaveHechos(texto: string): string[] {
  const norm = corpusNormalizado(texto ?? "").replace(/[^a-z0-9\s]/g, " ");
  const out: string[] = [];
  for (const w of norm.split(/\s+/)) {
    if (w.length < 3) continue;
    if (STOPWORDS_FILTRO_PARQUET.has(w)) continue;
    if (!out.includes(w)) out.push(w);
  }
  for (const c of clavesConUnidadNumerica(texto)) {
    if (!out.includes(c)) out.push(c);
  }
  if (/\bg\s*\/\s*m2?\b/.test(norm) && !out.includes("gm2")) out.push("gm2");
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

/** HECHOS declara repuesto, componente o pieza suelta (forma comercial en el núcleo facturado). */
export function esRepuestoOSuelto(texto: string): boolean {
  if (esArticuloCompleto(texto)) return false;

  const primer = corpusNormalizado(primerSegmentoFacturado(texto));
  if (declaraCategoriaPartes(texto)) return true;

  const indicadorEnNucleo =
    /\b(?:repuesto|repuestos|componente|componentes|pieza|piezas|accesorio|accesorios)\b/.test(
      primer,
    );
  if (indicadorEnNucleo) return true;
  if (/\b(?:suelto|sueltas)\b/.test(primer)) return true;

  const n = corpusNormalizado(texto ?? "");
  if (/\b(?:repuesto|repuestos|componente|componentes|pieza|piezas|reemplazo|oem|spare)\b/.test(n)) {
    return !metaRepuestoSoloEnCola(texto);
  }
  if (/\b(?:accesorio|accesorios)\b/.test(n)) {
    return !metaRepuestoSoloEnCola(texto);
  }
  if (/\b(?:suelto|sueltas)\b/.test(n)) return !metaRepuestoSoloEnCola(texto);
  return false;
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
  const headSource = declaraCategoriaPartes(texto)
    ? textoNucleoSinPrefijoPartes(texto).split(",")[0] ?? textoNucleoSinPrefijoPartes(texto)
    : segmentoPrincipal(texto).split(",")[0] ?? segmentoPrincipal(texto);
  return new Set(palabrasClaveHechos(headSource));
}

function fraseEnCorpus(frase: string, corpus: string): boolean {
  const f = corpusNormalizado(frase);
  if (f.replace(/\s/g, "").length < 8) return false;
  // Igual que en claveEnCorpus: el corpus ya viene normalizado del índice.
  return corpus.includes(f);
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
  const segmentos = (texto ?? "")
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
  if (!esRepuestoOSuelto(texto)) return partidas;
  const primer = primerSegmentoFacturado(texto);
  if (contextoVehiculoEnTexto(primer) || contextoVehiculoEnTexto(texto)) {
    return partidas;
  }
  return partidas.filter((p) => !p.startsWith("87"));
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

/** Primer segmento facturado declara categoría PARTES del nomenclador (no «partes del cuerpo», etc.). */
function declaraCategoriaPartes(texto: string): boolean {
  const primer = (texto ?? "").split(",")[0]?.trim() ?? "";
  return /^partes\b/i.test(primer);
}

/** Tras prefijo «Partes,» el núcleo discriminante suele estar en los segmentos siguientes. */
function textoNucleoSinPrefijoPartes(texto: string): string {
  if (!declaraCategoriaPartes(texto)) return texto;
  const resto = (texto ?? "")
    .split(",")
    .slice(1)
    .map((s) => s.trim())
    .filter(Boolean);
  return resto.length ? resto.join(", ") : texto;
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
 * Formas de número de una palabra en castellano, en los dos sentidos: el
 * importador puede escribir en singular y el nomenclador nombrar el artículo
 * en plural, o al revés. Incluye el plural en -ces («barniz» → «barnices»,
 * «lápiz» → «lápices»), que no se forma agregando -s ni -es.
 */
function variantesDeNumero(token: string): string[] {
  const out = [token, `${token}s`, `${token}es`];
  if (token.endsWith("z")) out.push(`${token.slice(0, -1)}ces`);
  if (token.endsWith("ces") && token.length >= 5) out.push(`${token.slice(0, -3)}z`);
  if (token.endsWith("es") && token.length >= 5) out.push(token.slice(0, -2));
  if (token.endsWith("s") && token.length >= 4) out.push(token.slice(0, -1));
  return out;
}

/**
 * Verifica si `token` aparece como palabra completa en el corpus, en cualquiera
 * de sus formas de número, más una raíz morfológica acotada.
 * Siempre con límite de palabra; no matchea subcadenas internas.
 */
export function tokenEnCorpus(token: string, corpus: string): boolean {
  const p = ` ${corpus} `;
  if (variantesDeNumero(token).some((v) => p.includes(` ${v} `))) return true;
  const lastChar = token[token.length - 1];
  if (token.length >= 6 && "aeiou".includes(lastChar)) {
    const raiz = token.slice(0, -1);
    if (raiz.length >= 5 && new RegExp(` ${raiz}[a-z]+ `).test(p)) return true;
  }
  return false;
}

function claveEnCorpus(clave: string, corpus: string): boolean {
  // El corpus del índice ya se guarda normalizado: volver a normalizarlo acá
  // costaba mucho más que la propia búsqueda, sobre textos de hasta 273k.
  if (clave.includes(" ")) return corpus.includes(clave);
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
  const nucleoPartes = declaraCategoriaPartes(texto) ? textoNucleoSinPrefijoPartes(texto) : texto;
  const completo = esArticuloCompleto(texto);
  const calificador = genericoCalificador(texto);
  const fuente = completo ? textoSinColaPropulsion(texto) : nucleoPartes;
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
  const categoriaPartes = repuesto && declaraCategoriaPartes(texto);
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

  const alcances = new Map<string, AlcanceClave>();
  for (const k of claves) {
    if ((pesoClave.get(k) ?? 0) > 0) alcances.set(k, await alcanceDeClave(k));
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
      const alcance = alcances.get(k)!;
      if (alcance.corpus.has(partida)) score += w;
      if (alcance.heading.has(partida)) headingScore += w * 2;
      // Nombrar al artículo pesa más que ser su destino: «cables de filamentos»
      // gana sobre «carretes para cables» cuando se busca un cable.
      if (alcance.nucleo.has(partida)) headingScore += w;
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
      const partidaDesc = idx.partDesc.get(partida) ?? "";
      if (categoriaPartes) {
        const estructural = pesoEncabezadoEstructural(partidaDesc);
        if (estructural > 0) {
          score += 12 + estructural * 4;
          headingScore += 15;
        } else {
          score *= 0.25;
          headingScore *= 0.25;
        }
      }
      scored.push({
        c: { partida, descripcion: partidaDesc },
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

/** Partidas cuyo encabezado (4 dígitos) coincide con el primer segmento facturado del texto. */
async function partidasPorEncabezadoEnTexto(texto: string): Promise<string[]> {
  const idx = await getIndice();
  const primer = (texto ?? "").split(",")[0]?.trim() ?? "";
  const claves = palabrasClaveHechos(primer).filter((k) => k.length >= 4);
  if (!claves.length) return [];
  const minHits = claves.length >= 3 ? 2 : 1;
  const scored: Array<{ partida: string; hits: number }> = [];
  for (const [partida, desc] of idx.partDesc) {
    const heading = idx.headingCorpusPorPartida.get(partida) ?? corpusNormalizado(desc);
    const hits = claves.filter(
      (k) =>
        !esHomofoniaEncabezado(k, heading) &&
        (tokenEnEncabezadoStrict(k, heading) || tokenEnCorpus(k, heading)),
    ).length;
    if (hits >= minHits) scored.push({ partida, hits });
  }
  scored.sort((a, b) => b.hits - a.hits || a.partida.localeCompare(b.partida));
  return scored.map((s) => s.partida).slice(0, 4);
}

const partidasPorClave = new Map<string, string[]>();

async function partidasQueContienenClave(clave: string): Promise<string[]> {
  const memo = partidasPorClave.get(clave);
  if (memo) return memo;
  const idx = await getIndice();
  const out: string[] = [];
  for (const [partida, corpus] of idx.corpusPorPartida) {
    if (tokenEnCorpus(clave, corpus)) out.push(partida);
  }
  partidasPorClave.set(clave, out);
  return out;
}

/** Partidas que contienen una clave, separadas por dónde aparece. */
type AlcanceClave = {
  corpus: Set<string>;
  heading: Set<string>;
  nucleo: Set<string>;
};

/**
 * Dónde aparece cada clave, calculado una sola vez.
 *
 * Recorrer las ~1200 partidas contra corpus de hasta 273k caracteres es lo más
 * caro del retrieval, y hoy se repite unas nueve veces por clasificación: el
 * paquete evalúa varias veces la misma clave y después la Fase 0 rehace todo
 * sobre el texto expandido. El índice se construye una sola vez, así que el
 * resultado por clave es siempre el mismo.
 */
const alcancePorClave = new Map<string, AlcanceClave>();

async function alcanceDeClave(clave: string): Promise<AlcanceClave> {
  const memo = alcancePorClave.get(clave);
  if (memo) return memo;
  const idx = await getIndice();
  const alcance: AlcanceClave = {
    corpus: new Set<string>(),
    heading: new Set<string>(),
    nucleo: new Set<string>(),
  };
  for (const [partida, corpus] of idx.corpusPorPartida) {
    if (claveEnCorpus(clave, corpus)) alcance.corpus.add(partida);
    const heading = idx.headingCorpusPorPartida.get(partida) ?? "";
    if (claveEnCorpus(clave, heading)) alcance.heading.add(partida);
    const nucleo = idx.nucleoHeadingPorPartida.get(partida) ?? heading;
    if (claveEnCorpus(clave, nucleo)) alcance.nucleo.add(partida);
  }
  alcancePorClave.set(clave, alcance);
  return alcance;
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

/**
 * Capítulos donde la partida identifica principalmente una materia (no un tipo de artículo).
 * Cuando compiten dos de estos y HECHOS no declara el material, se pregunta en vez de asumir.
 */
const CAPITULOS_MATERIA = new Set([
  "39", "40",                                     // plásticos, caucho
  "41", "43",                                     // cuero, peletería
  "44", "45", "46",                               // madera, corcho, cestería
  "47", "48",                                     // pasta, papel/cartón
  "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", // textiles
  "68", "69", "70",                               // piedra, cerámica, vidrio
  "72", "73", "74", "75", "76", "78", "79", "80", "81", // metales comunes
]);

const MATERIA_EN_HECHOS =
  /\b(?:plastico|plastica|caucho|goma|metal|metalic|acero|hierro|fundicion|textil|algodon|nylon|poliuretano|pvc|polietileno|bronce|laton|aluminio|cobre|zinc|cinc|estano|plomo|niquel|titanio|madera|contrachapad|corcho|mimbre|bambu|ratan|cuero|piel|lona|sintetic|papel|carton|celulosa|vidrio|ceramic|porcelana|gres|loza|piedra|marmol|granito|yeso|hormigon|lino|lana|seda|yute|viscosa|poliester|polipropileno|acrilic|elastomer|elastomero|fibra|fieltro|hilado|filamento)\b/;

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

/** ¿El NCM elegido tipifica el tipo de artículo declarado en HECHOS (no solo su capítulo de materia)? */
function tipificacionArticuloEncajaConHechos(
  sim: { descripcion?: string; ruta?: string },
  bloque: BloqueCandidatos,
  hechos: string,
  bloques: BloqueCandidatos[],
): boolean {
  const tip = encabezadoTipificacionGrupo([sim]);
  if (tipificacionEncajaConHechos(tip, hechos)) return true;
  if (hojaEspecificaEncajaConHechos(sim, hechos)) return true;
  for (const s of bloque.sims) {
    for (const seg of segmentosRamaLegal(s)) {
      if (encabezadoLegalGenerico(seg) || seg.length < 18) continue;
      if (lexemaCompartidoEntreTextos(seg, hechos)) {
        const hits = hitsHechosEnBloque(bloque, hechos);
        if (hits >= 2) return true;
      }
    }
  }
  const hits = hitsHechosEnBloque(bloque, hechos);
  if (hits < 2) return false;
  let maxOtro = 0;
  for (const b of bloques) {
    if (b.partida === bloque.partida) continue;
    if (!CAPITULOS_MATERIA.has(b.partida.slice(0, 2))) continue;
    maxOtro = Math.max(maxOtro, hitsHechosEnBloque(b, hechos));
  }
  return hits >= maxOtro + 2;
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
  if (!CAPITULOS_MATERIA.has(cap)) return false;
  const found = simDeNcm(ncm, bloques);
  if (found && tipificacionArticuloEncajaConHechos(found.sim, found.bloque, hechos, bloques)) {
    return false;
  }
  return true;
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

/** Contexto de vehículo o velocípedo en HECHOS (palabras del texto, sin traducción). */
function contextoVehiculoEnTexto(texto: string): boolean {
  const norm = corpusNormalizado(texto ?? "");
  const terminos = [
    "vehiculo", "automovil", "automotor", "camion", "omnibus", "autobus",
    "bicicleta", "velocipedo", "motocicleta", "ciclomotor", "triciclo",
    "locomotora", "vagon",
  ];
  for (const t of terminos) {
    if (tokenEnCorpus(t, norm)) return true;
  }
  return false;
}

export type ArgsPartidasPaquete = {
  textoNombreBase: string;
  textoFiltro: string;
  textoSims: string;
};

/** Si el corte top-5 dejó fuera partidas fuertes del merge, recupera una. */
function promoverReservaMerge(merged: PartidaCandidata[], out: string[]): string[] {
  const resultado = [...out];
  for (const c of merged.slice(MAX_PARTIDAS_PAQUETE, MAX_PARTIDAS_PAQUETE + 12)) {
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
async function promoverPrincipalPorPrimerSegmento(
  principal: PartidaCandidata[],
  texto: string,
): Promise<PartidaCandidata[]> {
  const primer = (texto ?? "").split(",")[0]?.trim() ?? "";
  if (primer.length < 8) return principal;
  const norm = corpusNormalizado(primer);
  // Rasgos técnicos de subpartida (peso, uso, envase), no nombre de familia del artículo.
  if (/^(?:de|para|en|con|sin|aptas?\s+para|los\s+demas|las\s+demas)\b/.test(norm)) {
    return principal;
  }
  const porPrimer = await partidasCandidatas(primer, { limite: 5 });
  const out = [...principal];
  for (let i = porPrimer.length - 1; i >= 0; i--) {
    const c = porPrimer[i]!;
    const idx = out.findIndex((p) => p.partida === c.partida);
    if (idx >= 0) out.splice(idx, 1);
    out.unshift(c);
  }
  return out;
}

/** Si el merge desplazó partidas del ranking léxico principal, recupera las faltantes. */
async function garantizarPartidasLexicasEnPaquete(
  textos: string[],
  out: string[],
): Promise<string[]> {
  const fuentes = [...new Set(textos.map((t) => t.trim()).filter(Boolean))];
  if (!fuentes.length) return out.slice(0, MAX_PARTIDAS_PAQUETE);

  const topsPorFuente: string[][] = [];
  for (const texto of fuentes) {
    topsPorFuente.push(
      (await partidasCandidatas(texto, { limite: MAX_PARTIDAS_PAQUETE })).map((c) => c.partida),
    );
  }

  const rankPrioridad = (p: string): number => {
    let best = 9999;
    for (const top of topsPorFuente) {
      const i = top.indexOf(p);
      if (i >= 0 && i < best) best = i;
    }
    return best;
  };

  const prioritarios: string[] = [];
  const vistosPri = new Set<string>();
  for (const top of topsPorFuente) {
    for (const p of top) {
      if (vistosPri.has(p)) continue;
      vistosPri.add(p);
      prioritarios.push(p);
    }
  }

  const faltantes = prioritarios.filter((p) => !out.includes(p));
  if (!faltantes.length) return out.slice(0, MAX_PARTIDAS_PAQUETE);
  let resultado = [...out];
  for (const p of faltantes) {
    if (resultado.includes(p)) continue;
    if (resultado.length < MAX_PARTIDAS_PAQUETE) {
      resultado.push(p);
      continue;
    }
    let reemplazar = 0;
    let peor = -1;
    for (let i = 0; i < resultado.length; i++) {
      const r = rankPrioridad(resultado[i]!);
      if (r > peor) {
        peor = r;
        reemplazar = i;
      }
    }
    resultado[reemplazar] = p;
  }
  return resultado.slice(0, MAX_PARTIDAS_PAQUETE);
}

export async function resolverPartidasPaquete(args: ArgsPartidasPaquete): Promise<string[]> {
  const { textoNombreBase, textoFiltro, textoSims } = args;

  const repuesto = esRepuestoOSuelto(textoSims) && !esArticuloCompleto(textoSims);

  const principal = await partidasCandidatas(textoSims, { limite: 20 });
  const alternativas = await Promise.all(
    [
      ...new Set(
        [textoFiltro, textoNombreBase].filter(
          (t) => t.trim() && t !== textoSims && textoFiltroConfiable(t, textoSims),
        ),
      ),
    ].map((t) => partidasCandidatas(t, { limite: 12 })),
  );
  for (const alt of alternativas) {
    for (const c of alt) {
      if (!principal.some((p) => p.partida === c.partida)) principal.push(c);
    }
  }
  const principalOrdenado = await promoverPrincipalPorPrimerSegmento(principal, textoSims);

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
  const porEncabezadoTexto = await partidasPorEncabezadoEnTexto(textoSims);
  const porTipoHeading = await partidasConTipoEnHeading(textoSims);

  const refuerzos: Array<{ partidas: string[]; peso: number }> = [
    { partidas: porEncabezadoTexto, peso: 5 },
    { partidas: porTipoHeading, peso: 4 },
    { partidas: porDiscriminantes, peso: 3 },
    { partidas: porSegmentos, peso: 3 },
    { partidas: porFrases, peso: 2.5 },
    { partidas: porHeadingTexto, peso: 2 },
    { partidas: porMaterial, peso: 1.5 },
  ];
  const tipoEnNombre = palabraTipoPrincipal(textoNombreBase);
  if (repuesto && !tipoEnNombre) refuerzos.push({ partidas: porPartesPadre, peso: 3 });

  const merged = combinarPartidasConBonus(principalOrdenado, refuerzos, 15);
  let out = merged.map((c) => c.partida).slice(0, MAX_PARTIDAS_PAQUETE);
  out = promoverReservaMerge(merged, out);
  out = await garantizarPartidasLexicasEnPaquete(
    [
      ...new Set(
        [textoSims, textoFiltro, textoNombreBase].filter(
          (t) => t.trim() && (t === textoSims || textoFiltroConfiable(t, textoSims)),
        ),
      ),
    ],
    out,
  );

  return (await filtrarPartidasRepuestoIndustrial(textoSims, out)).slice(0, MAX_PARTIDAS_PAQUETE);
}

/** Benchmark y diagnóstico: solo partidas, sin ranking de SIMs. */
export async function partidasMotor(args: ArgsPartidasPaquete): Promise<string[]> {
  return resolverPartidasPaquete(args);
}

/** Tope del paquete cuando se suman candidatas de la expansión léxica (Fase 0). */
const MAX_PARTIDAS_PAQUETE_EXPANDIDO = 7;

/**
 * Une las partidas del retrieval normal con las del retrieval sobre el texto
 * expandido (términos legales de la Fase 0). Preserva las base (no las desplaza)
 * y agrega las que la expansión aporta, hasta el tope expandido.
 */
export async function resolverPartidasConExpansion(
  args: ArgsPartidasPaquete,
  terminosExpansion: string[],
): Promise<string[]> {
  const base = await resolverPartidasPaquete(args);
  const extra = (terminosExpansion ?? []).join(" ").trim();
  if (!extra) return base;
  const conExtra = (t: string) => (t.trim() ? `${t} ${extra}` : extra);
  const exp = await resolverPartidasPaquete({
    textoNombreBase: conExtra(args.textoNombreBase),
    textoFiltro: conExtra(args.textoFiltro),
    textoSims: conExtra(args.textoSims),
  });
  const union = [...base];
  for (const p of exp) {
    if (union.length >= MAX_PARTIDAS_PAQUETE_EXPANDIDO) break;
    if (!union.includes(p)) union.push(p);
  }
  return union;
}

/**
 * Paquete para IA: las partidas del motor con todas sus SIMs.
 * `terminosExpansion` (Fase 0) amplía el recall sin desplazar las candidatas base.
 */
export async function paquetePartidasParaIa(
  args: ArgsPartidasPaquete,
  terminosExpansion?: string[],
): Promise<BloqueCandidatos[]> {
  const partidas4 = terminosExpansion?.length
    ? await resolverPartidasConExpansion(args, terminosExpansion)
    : await resolverPartidasPaquete(args);
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

/** Residual genérico del nomenclador («Los demás», «Las demás»), no tipificaciones nominales largas. */
function esResidualGenerico(texto: string): boolean {
  const d = corpusNormalizado(texto).replace(/^-+/g, "").replace(/:+$/, "").trim();
  if (d === "los demas" || d === "las demas" || d === "demas") return true;
  if (d.startsWith("los demas") || d.startsWith("las demas")) {
    return d.split(/\s+/).filter(Boolean).length <= 3;
  }
  return false;
}

/** Línea residual del nomenclador («Las demás», «Los demás»). */
export function esLineaResidual(descripcion: string): boolean {
  return esResidualGenerico(descripcion);
}

/** Encabezado de rama residual genérica (no tipificación nominal «Los demás bojes…»). */
export function encabezadoLegalGenerico(texto: string): boolean {
  return esResidualGenerico(texto);
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

/** Hermanas directas: mismo encabezado legal inmediato (misma rama, hoja distinta). */
function agruparSimsPorRamaInmediata<T extends { codigo: string; descripcion?: string; ruta?: string }>(
  sims: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const s of sims) {
    const segs = segmentosRamaLegal(s);
    const parent = segs.length > 1 ? segs.slice(0, -1).join(" > ") : segs.join(" > ");
    const arr = groups.get(parent) ?? [];
    arr.push(s);
    groups.set(parent, arr);
  }
  return groups;
}

function puntajeTipificacionesNominalesPartida(
  bloque: BloqueCandidatos | undefined,
  hechos: string,
): number {
  if (!bloque) return 0;
  const vistos = new Set<string>();
  let mejor = 0;
  for (const s of bloque.sims) {
    for (const seg of segmentosRamaLegal(s)) {
      if (encabezadoLegalGenerico(seg)) continue;
      const key = corpusNormalizado(seg);
      if (vistos.has(key)) continue;
      vistos.add(key);
      let score = 0;
      for (const t of key.split(/\s+/)) {
        if (t.length < 5) continue;
        if (lexemaCompartidoConHechos(t, hechos)) score++;
      }
      if (score > mejor) mejor = score;
    }
  }
  return mejor;
}

/**
 * Si la partida elegida pierde ante otra candidata en encaje de tipificaciones nominales
 * del listado con HECHOS, devuelve la partida corregida (RGI 1 / familia del artículo).
 */
export function partidaCorregidaPorTipificacionNominal(
  bloques: BloqueCandidatos[],
  hechos: string,
  partidaElegida: string,
): string | null {
  const p4 = partidaElegida.replace(/\D/g, "").slice(0, 4);
  const rank = rankingPartidasPorSegmentosHechos(bloques, hechos);
  if (rank.length >= 2) {
    const [lider, segundo] = rank;
    const elegida = rank.find((r) => r.partida === p4);
    if (
      lider &&
      elegida &&
      elegida.partida === lider.partida &&
      lider.score >= (segundo?.score ?? 0) + MARGEN_PARTIDA_RANKING_CLARO
    ) {
      return null;
    }
  }

  const bloqueEleg = bloques.find((b) => b.partida === p4);
  const scoreEleg = puntajeTipificacionesNominalesPartida(bloqueEleg, hechos);

  let mejor: { partida: string; score: number } | null = null;
  for (const b of bloques) {
    const score = puntajeTipificacionesNominalesPartida(b, hechos);
    if (!mejor || score > mejor.score) mejor = { partida: b.partida, score };
  }
  if (!mejor || mejor.partida === p4) return null;
  if (mejor.score < 4) return null;
  if (mejor.score >= scoreEleg + 3) return mejor.partida;
  return null;
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

/**
 * Si el NCM elegido está en una rama cuya tipificación no encaja con HECHOS pero otra rama
 * nominal de la misma partida sí encaja, devuelve el NCM de esa rama (RGI 3 a)).
 */
export function ncmPreferidaPorRamaTipificadaHechos(
  hechos: string,
  bloques: BloqueCandidatos[],
  ncmElegido: string,
): string | null {
  const elegidoD = (ncmElegido ?? "").replace(/\D/g, "");
  if (elegidoD.length < 6) return null;
  const p4 = elegidoD.slice(0, 4);
  const bloque = bloques.find((b) => b.partida === p4);
  if (!bloque) return null;

  let grupoElegido: Array<{ codigo: string; descripcion?: string; ruta?: string }> | null = null;
  let simElegido: { codigo: string; descripcion?: string; ruta?: string } | null = null;
  for (const sims of agruparSimsPorSubpartida(bloque.sims).values()) {
    const hit = sims.find((s) => s.codigo.replace(/\D/g, "") === elegidoD);
    if (!hit) continue;
    grupoElegido = sims;
    simElegido = hit;
    break;
  }
  if (!grupoElegido || !simElegido) return null;

  const tipElegido = encabezadoTipificacionGrupo(grupoElegido);
  const elegidoEncaja =
    (!tipificacionGrupoEsGenerica(grupoElegido) &&
      tipificacionEncajaConHechos(tipElegido, hechos)) ||
    hojaEspecificaEncajaConHechos(simElegido, hechos);
  if (elegidoEncaja) return null;

  let mejor: { ncm: string; hits: number } | null = null;
  const familiasVistas = new Set<string>();

  for (const sims of agruparSimsPorSubpartida(bloque.sims).values()) {
    if (sims.some((s) => s.codigo.replace(/\D/g, "") === elegidoD)) continue;
    if (tipificacionGrupoEsGenerica(sims)) continue;
    const tip = encabezadoTipificacionGrupo(sims);
    if (!tipificacionEncajaConHechos(tip, hechos)) continue;
    const fam = corpusNormalizado(primerSegmentoTipificacion(sims));
    if (familiasVistas.has(fam)) continue;
    familiasVistas.add(fam);
    const ncm = elegirEntreGruposTipificados([sims], hechos);
    const hits = sims.reduce((acc, s) => {
      const rama = segmentosRamaLegal(s);
      let local = 0;
      for (const r of rama) {
        if (encabezadoLegalGenerico(r)) continue;
        if (lexemaCompartidoEntreTextos(r, hechos)) local++;
        for (const cal of segmentosCalificadoresHechos(hechos).slice(1)) {
          local += similitudSegmentoConTexto(cal, r);
        }
      }
      return acc + local;
    }, 0);
    if (!mejor || hits > mejor.hits) mejor = { ncm, hits };
  }

  if (!mejor || mejor.ncm.replace(/\D/g, "") === elegidoD) return null;
  return mejor.ncm;
}

/** Completa NCM truncado de la IA cuando hay una sola SIM en el paquete con ese prefijo. */
export function resolverNcmEnPaquete(
  ncm: string,
  bloques: BloqueCandidatos[],
): string | null {
  const d = (ncm ?? "").replace(/\D/g, "");
  if (d.length < 6) return null;
  const sims = bloques.flatMap((b) => b.sims);
  const exact = sims.find((s) => s.codigo.replace(/\D/g, "") === d);
  if (exact) return exact.codigo;
  const pref = sims.filter((s) => s.codigo.replace(/\D/g, "").startsWith(d));
  if (pref.length === 1) return pref[0]!.codigo;
  return null;
}

function normalizarSegmentoHechos(seg: string): string {
  return seg.replace(/:+\s*$/, "").trim();
}

function similitudSegmentoConTexto(seg: string, texto: string): number {
  const a = corpusNormalizado(normalizarSegmentoHechos(seg));
  const b = corpusNormalizado(texto);
  if (!a || !b) return 0;
  if (a === b) return 4;
  const palabrasA = a.split(/\s+/).filter(Boolean);
  if (palabrasA.length >= 2 && (b.includes(a) || a.includes(b))) return 3;
  if (a.length >= 10 && (b.includes(a) || a.includes(b))) return 3;
  if (palabrasA.length === 1 && a.length <= 5) {
    return tokenEnCorpus(a, b) ? 2 : 0;
  }
  if (lexemaCompartidoEntreTextos(normalizarSegmentoHechos(seg), texto)) return 1;
  return 0;
}

/** Segmentos facturados del primer renglón de HECHOS (separados por coma). */
function esContinuacionSegmentoHechos(seg: string): boolean {
  const s = seg.trim();
  if (/^\d/.test(s)) return true;
  if (/^u\s+\d/.test(s)) return true;
  if (/^[a-z]{1,4}\s+\d/.test(s)) return true;
  return false;
}

function unirSegmentosHechosContinuacion(segmentos: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < segmentos.length) {
    let cur = segmentos[i]!.trim();
    i++;
    while (i < segmentos.length && esContinuacionSegmentoHechos(segmentos[i]!)) {
      cur = `${cur}, ${segmentos[i]!.trim()}`;
      i++;
    }
    if (cur) out.push(cur);
  }
  return out;
}

export function segmentosDesdeHechos(hechos: string): string[] {
  const m = hechos.match(/^HECHOS:\n- ([^\n]+)/);
  if (!m?.[1]) return [];
  const raw = m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return unirSegmentosHechosContinuacion(raw);
}

function puntajePartidaConSegmentosHechos(
  bloque: BloqueCandidatos,
  segmentos: string[],
): number {
  const segs = segmentos.map(normalizarSegmentoHechos).filter(Boolean);
  let mejorSim = 0;
  for (const s of bloque.sims) {
    const rama = segmentosRamaLegal(s);
    let simScore = 0;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      const peso = segs.length - i;
      for (const r of rama) {
        if (encabezadoLegalGenerico(r)) continue;
        simScore += similitudSegmentoConTexto(seg, r) * peso;
      }
    }
    if (simScore > mejorSim) mejorSim = simScore;
  }
  const primero = segs[0];
  if (primero) {
    mejorSim += similitudSegmentoConTexto(primero, bloque.partidaDesc) * segs.length * 2;
  }
  return mejorSim;
}

/** ¿Cuántos segmentos de HECHOS encadenan en orden sobre la rama legal de una SIM? */
function segmentosConsumenNivelRama(
  segs: string[],
  desde: number,
  nivelRama: string,
): { consumidos: number; score: number; offset: number } {
  let mejor = { consumidos: 0, score: 0, offset: desde };
  for (let start = desde; start < segs.length; start++) {
    for (let n = 1; n <= segs.length - start; n++) {
      const unidos = segs.slice(start, start + n).join(", ");
      const simil = similitudSegmentoConTexto(unidos, nivelRama);
      if (simil > mejor.score) {
        mejor = { consumidos: n, score: simil, offset: start };
      }
    }
  }
  return mejor;
}

function esSegmentoResidualNominal(seg: string): boolean {
  const n = corpusNormalizado(normalizarSegmentoHechos(seg));
  return /^los demas\b|^las demas\b/.test(n);
}

function puntajeCadenaSegmentosEnSim(
  sim: { descripcion?: string; ruta?: string },
  segmentos: string[],
): number {
  const rama = segmentosRamaLegal(sim);
  const segs = segmentos.map(normalizarSegmentoHechos).filter(Boolean);
  if (!segs.length || !rama.length) return 0;
  let total = 0;
  let si = 0;
  for (const r of rama) {
    if (encabezadoLegalGenerico(r)) continue;
    const { consumidos, score, offset } = segmentosConsumenNivelRama(segs, si, r);
    if (consumidos === 0 || score === 0) continue;
    total += score;
    si = offset + consumidos;
  }
  // Tipificación nominal fuera de orden («Los demás…») vs rama legal hermana
  for (const r of rama) {
    if (encabezadoLegalGenerico(r)) continue;
    for (const seg of segs) {
      if (!esSegmentoResidualNominal(seg)) continue;
      const simil = similitudSegmentoConTexto(seg, r);
      if (simil >= 3) total = Math.max(total, simil + 6);
    }
  }
  return total;
}

/** Márgenes del ranking léxico de partidas (retrieval; no sustituyen el cruce legal). */
const MARGEN_PARTIDA_RANKING_CLARO = 12;
const MARGEN_PARTIDA_SOBRE_ELEGIDA = 15;
const MARGEN_CADENA_SOBRE_SEGUNDO = 2;
const MARGEN_CADENA_MINIMO = 6;

function puntajeCadenaPartida(bloque: BloqueCandidatos, segmentos: string[]): number {
  let mejor = 0;
  for (const s of bloque.sims) {
    const c = puntajeCadenaSegmentosEnSim(s, segmentos);
    if (c > mejor) mejor = c;
  }
  return mejor;
}

/** Partida cuya mejor SIM reproduce la cadena de segmentos de HECHOS en orden. */
export function partidaPreferidaPorCadenaHechos(
  bloques: BloqueCandidatos[],
  hechos: string,
): string | null {
  const segmentos = segmentosDesdeHechos(hechos);
  if (segmentos.length < 2) return null;
  let mejorPartida: string | null = null;
  let mejorScore = 0;
  let segundoScore = 0;
  for (const b of bloques) {
    const score = puntajeCadenaPartida(b, segmentos);
    if (score > mejorScore) {
      segundoScore = mejorScore;
      mejorScore = score;
      mejorPartida = b.partida;
    } else if (score > segundoScore) {
      segundoScore = score;
    }
  }
  if (!mejorPartida || mejorScore < MARGEN_CADENA_MINIMO) return null;
  if (mejorScore >= segundoScore + MARGEN_CADENA_SOBRE_SEGUNDO) return mejorPartida;
  return null;
}

/** Partida líder del ranking por segmentos con ventaja clara sobre la segunda. */
export function partidaPreferidaPorRankingClaro(
  bloques: BloqueCandidatos[],
  hechos: string,
): string | null {
  const rank = rankingPartidasPorSegmentosHechos(bloques, hechos);
  if (rank.length < 2) return null;
  const [a, b] = rank;
  if (!a || a.score <= 0) return null;
  if (a.score >= b!.score + MARGEN_PARTIDA_RANKING_CLARO) return a.partida;
  return null;
}

/** Segmentos facturados + calificadores preposicionales del primer renglón («de …», «para …»). */
function segmentosCalificadoresHechos(hechos: string): string[] {
  const segs = segmentosDesdeHechos(hechos).map(normalizarSegmentoHechos).filter(Boolean);
  if (segs.length >= 2) return segs;
  const linea = segs[0] ?? "";
  if (!linea) return segs;
  const califs: string[] = [];
  const norm = corpusNormalizado(linea);
  for (const m of norm.matchAll(/\b(?:de|del|para)\s+([a-z]{4,}(?:\s+[a-z]{4,}){0,2})/g)) {
    const frase = m[1]!.trim();
    if (frase && !STOPWORDS_FILTRO_PARQUET.has(frase.split(/\s+/)[0]!)) califs.push(frase);
  }
  if (!califs.length) return segs;
  return [linea, ...califs.filter((c) => !linea.includes(c))];
}

/**
 * Si el NCM elegido ignora un calificador de HECHOS que encaja mejor con otra hermana
 * de la misma partida (RGI 3 a)), devuelve el NCM de esa hermana.
 */
export function ncmPreferidaPorCalificadorFinal(
  hechos: string,
  bloques: BloqueCandidatos[],
  ncmElegido: string,
): string | null {
  const segmentos = segmentosCalificadoresHechos(hechos).map(normalizarSegmentoHechos).filter(Boolean);
  if (segmentos.length < 2) return null;

  const p4 = ncmElegido.replace(/\D/g, "").slice(0, 4);
  const bloque = bloques.find((b) => b.partida === p4);
  if (!bloque) return null;

  const calificadores = segmentos.slice(1);
  const ultimo = calificadores.at(-1);
  if (!ultimo || ultimo.length < 4) return null;

  let mejor: { ncm: string; score: number } | null = null;
  let scoreElegido = -1;
  const elegidoD = ncmElegido.replace(/\D/g, "");

  for (const s of bloque.sims) {
    const rama = segmentosRamaLegal(s).join(" ");
    let score = 0;
    for (let i = 0; i < calificadores.length; i++) {
      const peso = calificadores.length - i;
      if (similitudSegmentoConTexto(calificadores[i]!, rama) > 0) score += peso;
    }
    const d = s.codigo.replace(/\D/g, "");
    if (d === elegidoD) scoreElegido = score;
    if (!mejor || score > mejor.score) mejor = { ncm: s.codigo, score };
  }

  if (!mejor || mejor.ncm.toUpperCase() === ncmElegido.trim().toUpperCase()) return null;
  if (mejor.score <= scoreElegido) return null;

  const ramaMejor = segmentosRamaLegal(
    bloque.sims.find((s) => s.codigo === mejor!.ncm) ?? bloque.sims[0]!,
  ).join(" ");
  const ramaElegido = segmentosRamaLegal(
    bloque.sims.find((s) => s.codigo.replace(/\D/g, "") === elegidoD) ?? bloque.sims[0]!,
  ).join(" ");

  const ultimoEnMejor = similitudSegmentoConTexto(ultimo, ramaMejor) > 0;
  const ultimoEnElegido = similitudSegmentoConTexto(ultimo, ramaElegido) > 0;
  if (ultimoEnMejor && !ultimoEnElegido) return mejor.ncm;
  return null;
}

/** Mejor SIM de la partida por alineación en cadena de segmentos de HECHOS. */
export function ncmPorCadenaHechosEnPartida(
  bloque: BloqueCandidatos,
  hechos: string,
): { ncm: string; score: number } | null {
  const segmentos = segmentosDesdeHechos(hechos).map(normalizarSegmentoHechos).filter(Boolean);
  if (segmentos.length < 2) return null;
  let mejor: { ncm: string; score: number } | null = null;
  for (const s of bloque.sims) {
    const score = puntajeCadenaSegmentosEnSim(s, segmentos);
    if (!mejor || score > mejor.score) mejor = { ncm: s.codigo, score };
  }
  if (!mejor || mejor.score < MARGEN_CADENA_MINIMO) return null;
  return mejor;
}

/**
 * Si el NCM elegido pierde ante otra SIM de la misma partida en cadena de segmentos,
 * devuelve la NCM con mejor encaje (RGI 3 a) a nivel subpartida).
 */
export function ncmPreferidaPorCadenaSegmentosHechos(
  hechos: string,
  bloques: BloqueCandidatos[],
  ncmElegido: string,
): string | null {
  const p4 = ncmElegido.replace(/\D/g, "").slice(0, 4);
  const bloque = bloques.find((b) => b.partida === p4);
  if (!bloque) return null;
  const mejor = ncmPorCadenaHechosEnPartida(bloque, hechos);
  if (!mejor) return null;
  const dEleg = ncmElegido.replace(/\D/g, "");
  if (mejor.ncm.replace(/\D/g, "") === dEleg) return null;
  const scoreElegido = puntajeCadenaSegmentosEnSim(
    bloque.sims.find((s) => s.codigo.replace(/\D/g, "") === dEleg) ?? bloque.sims[0]!,
    segmentosDesdeHechos(hechos).map(normalizarSegmentoHechos).filter(Boolean),
  );
  if (mejor.score >= scoreElegido + 4) return mejor.ncm;
  return null;
}

/**
 * Si la IA cerró en la residual local de un grupo subpartida pero queda una hermana
 * específica compatible con HECHOS (RGI 3 a)), devuelve esa NCM.
 */
export function ncmPreferidaSobreResidualHermana(
  hechos: string,
  bloques: BloqueCandidatos[],
  ncmElegido: string,
): string | null {
  const elegidoD = (ncmElegido ?? "").replace(/\D/g, "");
  if (elegidoD.length < 8) return null;
  const p4 = elegidoD.slice(0, 4);
  const bloque = bloques.find((b) => b.partida === p4);
  if (!bloque) return null;

  for (const sims of agruparSimsPorSubpartida(bloque.sims).values()) {
    const elegidoSim = sims.find((s) => s.codigo.replace(/\D/g, "") === elegidoD);
    if (!elegidoSim) continue;

    const leafEleg = segmentosRamaLegal(elegidoSim).at(-1) ?? "";
    if (!esLineaResidual(leafEleg)) return null;

    const tip = encabezadoTipificacionGrupo(sims);
    if (!tipificacionEncajaConHechos(tip, hechos)) return null;

    const viable = sims.filter((s) => !esLineaResidual(segmentosRamaLegal(s).at(-1) ?? ""));
    if (!viable.length) return null;

    const declaradas = viable.filter((s) => hojaEspecificaEncajaConHechos(s, hechos));
    if (declaradas.length === 1) return declaradas[0]!.codigo;
    if (declaradas.length > 1) return null;
    if (viable.length === 1) return viable[0]!.codigo;
  }
  return null;
}

/**
 * Hermanas con la misma cadena parcial en HECHOS pero tipificación distinta no declarada:
 * pedir el dato factual que falta (no adivinar).
 */
function hermanaGanadoraClaraEnGrupo(
  sims: Array<{ codigo: string; descripcion?: string; ruta?: string }>,
  hechos: string,
): boolean {
  const corp = corpusNormalizado(hechos);
  const declaradas = sims.filter((s) => {
    if (hojaEspecificaEncajaConHechos(s, hechos)) return true;
    for (const seg of segmentosRamaLegal(s)) {
      if (encabezadoLegalGenerico(seg)) continue;
      if (similitudSegmentoConTexto(seg, corp) >= 2) return true;
    }
    return false;
  });
  if (declaradas.length === 1) return true;

  const segmentos = segmentosDesdeHechos(hechos).map(normalizarSegmentoHechos).filter(Boolean);
  let mejorScore = -1;
  let lideres = 0;
  for (const s of sims) {
    const score = puntajeCadenaSegmentosEnSim(s, segmentos);
    if (score > mejorScore) {
      mejorScore = score;
      lideres = 1;
    } else if (score === mejorScore && score > 0) {
      lideres++;
    }
  }
  return lideres === 1 && mejorScore >= MARGEN_CADENA_MINIMO;
}

export function faltaDiscriminanteEntreHermanas(
  bloque: BloqueCandidatos,
  hechos: string,
): { faltaDato: string; opciones: string[] } | null {
  const segmentos = segmentosDesdeHechos(hechos).map(normalizarSegmentoHechos).filter(Boolean);
  if (segmentos.length < 2) return null;

  const scored = bloque.sims
    .map((s) => ({ sim: s, score: puntajeCadenaSegmentosEnSim(s, segmentos) }))
    .filter((x) => x.score >= MARGEN_CADENA_MINIMO);
  if (scored.length < 2) return null;

  const max = Math.max(...scored.map((x) => x.score));
  const top = scored.filter((x) => x.score === max);
  if (top.length < 2) return null;

  const ramas = top.map((t) =>
    segmentosRamaLegal(t.sim).filter((r) => !encabezadoLegalGenerico(r)),
  );
  const maxLen = Math.max(...ramas.map((r) => r.length));

  for (let level = 0; level < maxLen; level++) {
    const labels: string[] = [];
    const seen = new Set<string>();
    for (const r of ramas) {
      const seg = r[level]?.trim();
      if (!seg) continue;
      const key = corpusNormalizado(seg);
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push(seg);
    }
    if (labels.length < 2) continue;

    const declarado = labels.some((lab) =>
      segmentos.some((s) => similitudSegmentoConTexto(s, lab) > 0),
    );
    if (!declarado) {
      return {
        faltaDato: "¿Cuál de estas descripciones corresponde al artículo?",
        opciones: labels.slice(0, 4),
      };
    }
  }

  for (const sims of agruparSimsPorRamaInmediata(bloque.sims).values()) {
    const tip = encabezadoTipificacionGrupo(sims);
    if (!tipificacionEncajaConHechos(tip, hechos)) continue;
    if (hermanaGanadoraClaraEnGrupo(sims, hechos)) continue;

    const labels: string[] = [];
    const seen = new Set<string>();
    for (const s of sims) {
      const leaf = segmentosRamaLegal(s).at(-1)?.trim() ?? "";
      if (!leaf || esLineaResidual(leaf)) continue;
      if (hojaEspecificaEncajaConHechos(s, hechos)) continue;
      const corp = corpusNormalizado(hechos);
      let declarada = false;
      for (const seg of segmentosRamaLegal(s)) {
        if (encabezadoLegalGenerico(seg)) continue;
        if (similitudSegmentoConTexto(seg, corp) >= 2) {
          declarada = true;
          break;
        }
      }
      if (declarada) continue;
      const key = corpusNormalizado(leaf);
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push(leaf);
    }
    if (labels.length >= 2) {
      return {
        faltaDato: "¿Cuál de estas descripciones corresponde al artículo?",
        opciones: labels.slice(0, 4),
      };
    }
  }
  return null;
}

/** Ranking léxico de partidas candidatas según segmentos facturados en HECHOS. */
export function rankingPartidasPorSegmentosHechos(
  bloques: BloqueCandidatos[],
  hechos: string,
): Array<{ partida: string; score: number }> {
  const segmentos = segmentosDesdeHechos(hechos);
  if (!segmentos.length) return [];
  return bloques
    .map((b) => ({
      partida: b.partida,
      score: puntajePartidaConSegmentosHechos(b, segmentos),
    }))
    .sort((a, b) => b.score - a.score || a.partida.localeCompare(b.partida));
}

/**
 * Si la partida elegida por la IA desvía con claridad del ranking por segmentos de HECHOS,
 * devuelve la partida corregida (solo retrieval; no reemplaza el razonamiento legal fino).
 */
export function partidaCorregidaPorSegmentosHechos(
  bloques: BloqueCandidatos[],
  hechos: string,
  partidaElegida: string,
): string | null {
  const rank = rankingPartidasPorSegmentosHechos(bloques, hechos);
  if (rank.length < 2) return null;
  const best = rank[0]!;
  const p4 = partidaElegida.replace(/\D/g, "").slice(0, 4);
  if (best.partida === p4 || best.score <= 0) return null;
  const chosen = rank.find((r) => r.partida === p4);
  if (!chosen) return null;
  const second = rank[1]!;
  if (best.score >= chosen.score + MARGEN_PARTIDA_SOBRE_ELEGIDA && best.score >= second.score * 1.15) {
    return best.partida;
  }
  return null;
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
  /** Percepciones de AFIP e IIBB, cuando VUCE las publica. */
  ganancias: number | null;
  iibb: number | null;
  /** Unidad estadística (código del Arancel). */
  unidad: string | null;
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
    ganancias: imp.ganancias,
    iibb: imp.iibb,
    unidad: mejor.unidad,
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
