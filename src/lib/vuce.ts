import "server-only";
import path from "node:path";
import { leerFilas } from "@/lib/parquet-store";

/**
 * Datos OFICIALES de VUCE (Ventanilla Única de Comercio Exterior) ya limpios
 * en data/VUCE/clean/. Reemplazan la "adivinanza" de la IA para detectar qué
 * organismos intervienen en la importación de una posición arancelaria.
 *
 * El matching es por NCM-8: la posición SIM de VUCE tiene 12 caracteres
 * (8 dígitos de NCM + 3 de apertura SIM + 1 dígito verificador). Tomamos los
 * primeros 8 dígitos como clave.
 */

const CLEAN_DIR = path.join(process.cwd(), "data", "VUCE", "clean");
const INTERV_PATH = path.join(CLEAN_DIR, "intervenciones.parquet");
const ANTIDUMPING_PATH = path.join(CLEAN_DIR, "antidumping.parquet");
const TRIBUTACION_WIDE_PATH = path.join(CLEAN_DIR, "tributacion_wide.parquet");

const COLS = [
  "posicion",
  "clase",
  "organismo",
  "regimen",
  "resumen",
  "tipo_destinacion",
  "estado_mercaderia",
  "validada",
  "tramites",
] as const;

const ANTIDUMPING_COLS = [
  "posicion",
  "producto",
  "medida_aplicada",
  "tipo_medida",
  "vencimiento_medida",
  "pais",
  "normativa",
] as const;

const TRIBUTACION_WIDE_COLS = [
  "posicion",
  "iva",
  "iva_adicional",
  "ganancias",
  "iibb",
  "tasa_estadistica",
] as const;

/** Conceptos tributarios extra (los que el nomenclador ARCA no muestra). */
const TRIBUTO_LABEL: Record<string, string> = {
  iva: "IVA",
  iva_adicional: "IVA adicional",
  ganancias: "Ganancias",
  iibb: "IIBB",
  tasa_estadistica: "Tasa estadística",
};

export type TramiteVuce = {
  nombre: string | null;
  nro_trata: string | null;
  link: string | null;
};

export type IntervencionVuce = {
  organismo: string;
  /** "intervencion_previa": control obligatorio; "regimen_opcional": beneficio. */
  clase: "intervencion_previa" | "regimen_opcional";
  regimen: string | null;
  resumen: string | null;
  estadoMercaderia: string | null;
  /** Estados de mercadería para los que aplica (Nueva / Usada / Residuos…). */
  estados: string[];
  /** VUCE validó la intervención (mayor confianza). */
  validada: boolean;
  /**
   * El régimen alcanza a casi todo el nomenclador: no dice nada de ESTA
   * posición, es una condición de importar. Ver `UMBRAL_GENERAL`.
   */
  general: boolean;
  tramites: TramiteVuce[];
};

export type IntervencionesVuce = {
  /** NCM-8 efectivamente consultado (o null si la NCM no es utilizable). */
  ncm8: string | null;
  /** Controles obligatorios de terceros organismos. */
  intervenciones: IntervencionVuce[];
  /** Regímenes/beneficios opcionales aplicables. */
  regimenes: IntervencionVuce[];
};

export type AntidumpingVuce = {
  posicion: string;
  producto: string | null;
  medidaAplicada: string | null;
  tipoMedida: string | null;
  vencimiento: string | null;
  pais: string;
  normativa: string | null;
};

export type AntidumpingResultado = {
  ncm: string | null;
  pais: string | null;
  exacto: boolean;
  medidas: AntidumpingVuce[];
};

export type TributoVuce = {
  concepto: string;
  /** Valores distintos hallados en las aperturas SIM de la NCM (%). */
  valores: number[];
};

export type FichaPosicion = {
  ncm8: string | null;
  intervenciones: IntervencionVuce[];
  regimenes: IntervencionVuce[];
  /** Antidumping vigente para la NCM, en cualquier origen. */
  antidumping: AntidumpingVuce[];
  /** Países con antidumping para esta NCM (resumen). */
  antidumpingPaises: string[];
  /** Tributos extra al derecho (IVA, percepciones, tasa). */
  tributos: TributoVuce[];
};

type Indice = Map<string, IntervencionVuce[]>;
type IndiceAntidumping = Map<string, AntidumpingVuce[]>;
type IndiceTributacion = Map<string, Record<string, Set<number>>>;

let indicePromesa: Promise<Indice> | null = null;
let antidumpingPromesa: Promise<IndiceAntidumping> | null = null;
let tributacionPromesa: Promise<IndiceTributacion> | null = null;

function parseTramites(raw: string | null): TramiteVuce[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((t) => {
        const o = t as Record<string, unknown>;
        return {
          nombre: typeof o.nombre === "string" ? o.nombre : null,
          nro_trata: typeof o.nro_trata === "string" ? o.nro_trata : null,
          link: typeof o.link === "string" ? o.link : null,
        };
      })
      .filter((t) => t.nombre || t.link);
  } catch {
    return [];
  }
}

function ncm8De(posicion: string): string {
  return posicion.replace(/\D/g, "").slice(0, 8);
}

/** Normaliza una NCM ("8504.40.90", "85.04", "8504409000X") a dígitos. */
export function ncmDigitos(ncm: string | null | undefined): string {
  return (ncm ?? "").replace(/\D/g, "");
}

function normalizarTexto(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function paisClave(pais: string | null | undefined): string {
  const normal = normalizarTexto(pais)
    .replace(/^ee\.?\s*uu\.?$/, "estados unidos")
    .replace(/^usa$/, "estados unidos")
    .replace(/^u\.?s\.?a\.?$/, "estados unidos");
  return normal === "ee uu" ? "estados unidos" : normal;
}

/**
 * A partir de qué cobertura un régimen deja de ser información sobre la
 * posición y pasa a ser una condición de importar.
 *
 * Medido sobre el dataset entero, no elegido a ojo: de 113 regímenes hay
 * exactamente dos que llegan al 99,8% de las 4603 NCM-8 (embalajes de madera
 * NIMF-15 y resolución anticipada de origen) y el tercero cae al 23%. Entre
 * 30% y 90% no hay ninguno, así que el corte no depende de dónde se ponga.
 */
const UMBRAL_GENERAL = 0.9;

async function construirIndice(): Promise<Indice> {
  const filas = await leerFilas(INTERV_PATH, COLS);
  const idx: Indice = new Map();
  for (const f of filas) {
    const pos = f["posicion"];
    if (!pos) continue;
    const ncm8 = ncm8De(pos);
    if (ncm8.length < 8) continue;

    const clase =
      f["clase"] === "regimen_opcional"
        ? "regimen_opcional"
        : "intervencion_previa";

    const iv: IntervencionVuce = {
      organismo: f["organismo"] ?? "",
      clase,
      regimen: f["regimen"] ?? null,
      resumen: f["resumen"] ?? null,
      estadoMercaderia: f["estado_mercaderia"] ?? null,
      estados: f["estado_mercaderia"] ? [f["estado_mercaderia"]] : [],
      validada: f["validada"] === "true" || f["validada"] === "True",
      general: false,
      tramites: parseTramites(f["tramites"] ?? null),
    };

    const arr = idx.get(ncm8);
    if (arr) arr.push(iv);
    else idx.set(ncm8, [iv]);
  }
  marcarGenerales(idx);
  return idx;
}

/**
 * Marca los regímenes que aparecen en casi todas las posiciones. Se calcula
 * sobre el índice ya armado, una sola vez, sin nombrar ningún organismo ni
 * ninguna partida: si mañana VUCE agrega o saca uno, el cálculo lo sigue solo.
 */
function marcarGenerales(idx: Indice) {
  const alcance = new Map<string, Set<string>>();
  for (const [ncm8, items] of idx) {
    for (const iv of items) {
      const k = claveDedup(iv);
      let set = alcance.get(k);
      if (!set) alcance.set(k, (set = new Set<string>()));
      set.add(ncm8);
    }
  }
  const total = idx.size;
  if (total === 0) return;
  for (const items of idx.values()) {
    for (const iv of items) {
      const n = alcance.get(claveDedup(iv))?.size ?? 0;
      iv.general = n / total >= UMBRAL_GENERAL;
    }
  }
}

function getIndice(): Promise<Indice> {
  if (!indicePromesa) indicePromesa = construirIndice();
  return indicePromesa;
}

async function construirIndiceAntidumping(): Promise<IndiceAntidumping> {
  const filas = await leerFilas(ANTIDUMPING_PATH, ANTIDUMPING_COLS);
  const idx: IndiceAntidumping = new Map();
  for (const f of filas) {
    const pos = f["posicion"];
    const pais = f["pais"];
    if (!pos || !pais) continue;
    const ncm8 = ncm8De(pos);
    if (ncm8.length < 8) continue;
    const medida: AntidumpingVuce = {
      posicion: pos,
      producto: f["producto"] ?? null,
      medidaAplicada: f["medida_aplicada"] ?? null,
      tipoMedida: f["tipo_medida"] ?? null,
      vencimiento: f["vencimiento_medida"] ?? null,
      pais,
      normativa: f["normativa"] ?? null,
    };
    const key = `${ncm8}::${paisClave(pais)}`;
    const arr = idx.get(key);
    if (arr) arr.push(medida);
    else idx.set(key, [medida]);
  }
  return idx;
}

function getIndiceAntidumping(): Promise<IndiceAntidumping> {
  if (!antidumpingPromesa) antidumpingPromesa = construirIndiceAntidumping();
  return antidumpingPromesa;
}

/** Clave de deduplicación: un organismo + régimen alcanza una vez por NCM-8. */
function claveDedup(iv: IntervencionVuce): string {
  return `${iv.organismo}::${iv.regimen ?? ""}`;
}

const ORDEN_ESTADO = ["Nueva", "Usada", "Residuos", "Otros", "Todos"];

function dedup(items: IntervencionVuce[]): IntervencionVuce[] {
  const vistos = new Map<string, IntervencionVuce>();
  const estadosPorClave = new Map<string, Set<string>>();
  for (const iv of items) {
    const k = claveDedup(iv);
    let setEstados = estadosPorClave.get(k);
    if (!setEstados) {
      setEstados = new Set<string>();
      estadosPorClave.set(k, setEstados);
    }
    for (const e of iv.estados) setEstados.add(e);
    const prev = vistos.get(k);
    // Preferimos la versión validada si hay duplicados.
    if (!prev || (!prev.validada && iv.validada)) vistos.set(k, iv);
  }
  for (const [k, iv] of vistos) {
    const estados = Array.from(estadosPorClave.get(k) ?? []);
    iv.estados = estados.sort(
      (a, b) => ORDEN_ESTADO.indexOf(a) - ORDEN_ESTADO.indexOf(b),
    );
  }
  return Array.from(vistos.values()).sort((a, b) => {
    if (a.validada !== b.validada) return a.validada ? -1 : 1;
    return a.organismo.localeCompare(b.organismo, "es");
  });
}

/**
 * Devuelve las intervenciones oficiales para una NCM.
 * Acepta NCM de 4/6/8 dígitos: con 8 hace match exacto, con menos hace match
 * por prefijo (une todas las aperturas).
 */
export async function intervencionesPorNcm(
  ncm: string | null | undefined,
): Promise<IntervencionesVuce> {
  const digitos = ncmDigitos(ncm);
  if (digitos.length < 4) {
    return { ncm8: null, intervenciones: [], regimenes: [] };
  }

  const idx = await getIndice();
  const clave = digitos.slice(0, 8);

  let crudas: IntervencionVuce[] = [];
  if (digitos.length >= 8) {
    crudas = idx.get(clave) ?? [];
  } else {
    for (const [k, v] of idx) {
      if (k.startsWith(digitos)) crudas.push(...v);
    }
  }

  const previas = dedup(crudas.filter((i) => i.clase === "intervencion_previa"));
  const regimenes = dedup(crudas.filter((i) => i.clase === "regimen_opcional"));

  return {
    ncm8: digitos.length >= 8 ? clave : digitos,
    intervenciones: previas,
    regimenes,
  };
}

/**
 * Busca medidas antidumping vigentes por NCM + país.
 * Con NCM de 8+ dígitos hace match exacto por NCM-8; con 4/6 dígitos devuelve
 * coincidencias por prefijo, útil para el cotizador cuando la clasificación aún
 * es orientativa.
 */
export async function antidumpingPorNcmPais(
  ncm: string | null | undefined,
  pais: string | null | undefined,
): Promise<AntidumpingResultado> {
  const digitos = ncmDigitos(ncm);
  const paisNormal = paisClave(pais);
  if (digitos.length < 4 || !paisNormal) {
    return { ncm: null, pais: pais ?? null, exacto: false, medidas: [] };
  }

  const idx = await getIndiceAntidumping();
  const prefijo = digitos.slice(0, 8);
  const medidas: AntidumpingVuce[] = [];

  if (digitos.length >= 8) {
    medidas.push(...(idx.get(`${prefijo}::${paisNormal}`) ?? []));
  } else {
    for (const [key, rows] of idx) {
      const [ncm8, paisKey] = key.split("::");
      if (paisKey === paisNormal && ncm8.startsWith(digitos)) {
        medidas.push(...rows);
      }
    }
  }

  const dedup = new Map<string, AntidumpingVuce>();
  for (const m of medidas) {
    dedup.set(
      [
        m.posicion,
        m.producto ?? "",
        m.tipoMedida ?? "",
        m.medidaAplicada ?? "",
        m.pais,
      ].join("::"),
      m,
    );
  }

  return {
    ncm: digitos.length >= 8 ? prefijo : digitos,
    pais: pais ?? null,
    exacto: digitos.length >= 8,
    medidas: Array.from(dedup.values()).sort((a, b) =>
      a.posicion.localeCompare(b.posicion, "es"),
    ),
  };
}

async function construirIndiceTributacion(): Promise<IndiceTributacion> {
  const filas = await leerFilas(TRIBUTACION_WIDE_PATH, TRIBUTACION_WIDE_COLS);
  const idx: IndiceTributacion = new Map();
  const conceptos = Object.keys(TRIBUTO_LABEL);
  for (const f of filas) {
    const pos = f["posicion"];
    if (!pos) continue;
    const ncm8 = ncm8De(pos);
    if (ncm8.length < 8) continue;
    let bucket = idx.get(ncm8);
    if (!bucket) {
      bucket = {};
      idx.set(ncm8, bucket);
    }
    for (const c of conceptos) {
      const raw = f[c];
      if (raw == null || raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      (bucket[c] ??= new Set<number>()).add(n);
    }
  }
  return idx;
}

function getIndiceTributacion(): Promise<IndiceTributacion> {
  if (!tributacionPromesa) tributacionPromesa = construirIndiceTributacion();
  return tributacionPromesa;
}

/**
 * Ficha consolidada por NCM para el nomenclador: intervenciones, regímenes,
 * antidumping (todos los orígenes) y tributos extra. Todo por NCM-8.
 */
export async function fichaPosicion(
  ncm: string | null | undefined,
): Promise<FichaPosicion> {
  const digitos = ncmDigitos(ncm);
  if (digitos.length < 4) {
    return {
      ncm8: null,
      intervenciones: [],
      regimenes: [],
      antidumping: [],
      antidumpingPaises: [],
      tributos: [],
    };
  }

  const [interv, anti, tribIdx] = await Promise.all([
    intervencionesPorNcm(ncm),
    getIndiceAntidumping(),
    getIndiceTributacion(),
  ]);

  const prefijo = digitos.slice(0, 8);

  // Antidumping de cualquier país para la NCM (deduplicado por medida real:
  // las aperturas SIM repiten la misma medida muchas veces).
  const medidasMap = new Map<string, AntidumpingVuce>();
  for (const [key, rows] of anti) {
    const ncm8 = key.split("::")[0];
    if (digitos.length >= 8 ? ncm8 === prefijo : ncm8.startsWith(digitos)) {
      for (const m of rows) {
        // No incluimos la normativa en la clave: una misma medida suele estar
        // respaldada por varias resoluciones y, si no, se duplicaría en pantalla.
        const k = [
          m.pais,
          m.producto ?? "",
          m.tipoMedida ?? "",
          m.medidaAplicada ?? "",
        ].join("::");
        if (!medidasMap.has(k)) medidasMap.set(k, m);
      }
    }
  }
  const medidas = Array.from(medidasMap.values());
  const paises = [...new Set(medidas.map((m) => m.pais))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );

  // Tributos: unimos los valores distintos de todas las aperturas que matchean.
  const acumTrib: Record<string, Set<number>> = {};
  for (const [ncm8, bucket] of tribIdx) {
    if (digitos.length >= 8 ? ncm8 === prefijo : ncm8.startsWith(digitos)) {
      for (const [c, set] of Object.entries(bucket)) {
        (acumTrib[c] ??= new Set<number>());
        for (const v of set) acumTrib[c].add(v);
      }
    }
  }
  const tributos: TributoVuce[] = Object.keys(TRIBUTO_LABEL)
    .filter((c) => acumTrib[c] && acumTrib[c].size > 0)
    .map((c) => ({
      concepto: TRIBUTO_LABEL[c],
      valores: Array.from(acumTrib[c]).sort((a, b) => a - b),
    }));

  return {
    ncm8: digitos.length >= 8 ? prefijo : digitos,
    intervenciones: interv.intervenciones,
    regimenes: interv.regimenes,
    antidumping: medidas.sort((a, b) =>
      a.posicion.localeCompare(b.posicion, "es"),
    ),
    antidumpingPaises: paises,
    tributos,
  };
}

function lineaIntervencionVuce(iv: IntervencionVuce): string {
  const partes = [`- ${iv.organismo}`];
  if (iv.regimen) partes.push(`régimen: ${iv.regimen}`);
  if (iv.resumen) partes.push(`resumen: ${iv.resumen}`);
  if (iv.estados.length) partes.push(`estados mercadería: ${iv.estados.join(", ")}`);
  partes.push(iv.validada ? "[validada en VUCE]" : "[a verificar en VUCE]");
  if (iv.tramites.length) {
    const tr = iv.tramites
      .slice(0, 3)
      .map((t) => [t.nombre, t.nro_trata].filter(Boolean).join(" · "))
      .filter(Boolean)
      .join("; ");
    if (tr) partes.push(`trámites: ${tr}`);
  }
  return partes.join(" · ");
}

/**
 * Texto completo de intervenciones VUCE para prompts de IA y UI.
 * Sin recortar organismos: el parquet es la fuente; la IA decide qué aplica
 * según lo leído en los documentos.
 */
export function contextoIntervencionesVuceIA(iv: IntervencionesVuce): string | null {
  const partes: string[] = [];
  if (iv.intervenciones.length) {
    partes.push(
      "Intervenciones previas (intervenciones.parquet):\n" +
        iv.intervenciones.map(lineaIntervencionVuce).join("\n"),
    );
  }
  if (iv.regimenes.length) {
    partes.push(
      "Regímenes opcionales (intervenciones.parquet):\n" +
        iv.regimenes.map(lineaIntervencionVuce).join("\n"),
    );
  }
  return partes.length ? partes.join("\n") : null;
}

export function contextoAntidumpingVuceIA(
  medidas: AntidumpingVuce[],
  pais: string | null | undefined,
): string | null {
  if (medidas.length === 0) return null;
  const lineas = [
    `Antidumping (antidumping.parquet) — origen ${pais ?? "s/d"}:`,
  ];
  for (const m of medidas) {
    const medida = [m.tipoMedida, m.medidaAplicada].filter(Boolean).join(" · ");
    lineas.push(
      `  · ${m.producto ?? "Producto"}${medida ? `: ${medida}` : ""}` +
        (m.normativa ? ` (${m.normativa})` : "") +
        (m.vencimiento ? ` · vence ${m.vencimiento}` : ""),
    );
  }
  return lineas.join("\n");
}

export function contextoTributosVuceIA(tributos: TributoVuce[]): string | null {
  if (tributos.length === 0) return null;
  const lineas = ["Tributación extra (tributacion_wide.parquet):"];
  for (const t of tributos) {
    lineas.push(`  · ${t.concepto}: ${t.valores.map((v) => `${v}%`).join(" / ")}`);
  }
  return lineas.join("\n");
}
