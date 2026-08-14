import "server-only";

import { extraerCapaTextoPdf } from "@/lib/capa-texto-pdf";
import {
  evaluarRelevancia,
  familiaDeOrganismo,
  type BoletinDelDia,
  type NormaBoletin,
} from "@/lib/boletin/tipos";

/**
 * Lector de la Primera Sección del Boletín Oficial del día.
 *
 * El BO no expone una API de datos (su buscador devuelve HTML armado), pero
 * publica el PDF de cada sección en un CDN abierto. Como el PDF es nativo, lo
 * leemos con el mismo extractor de texto del pipeline de documentos.
 *
 * Parseamos el SUMARIO y no el cuerpo: el sumario ya trae una línea por norma
 * con organismo, tipo, número y síntesis, que es exactamente el índice que el
 * operador necesita para decidir qué abrir.
 */

const URL_PDF = "https://s3.arsat.com.ar/cdn-bo-001/pdf-del-dia/primera.pdf";
const URL_PUBLICA = "https://www.boletinoficial.gob.ar/seccion/primera";
const TIMEOUT_MS = 30_000;

/** El sumario termina donde vuelve a aparecer el encabezado de página. */
const RE_HEADER = /BOLET[IÍ]N OFICIAL N[º°]\s*[\d.]+\s*-\s*\w+ Secci[oó]n/i;
/** Los puntos guía cierran cada entrada del sumario. */
const RE_LEADER = /\.{4,}/;
const RE_ENTRADA =
  /^(.+?)\.\s+(Decreto|Decisi[oó]n Administrativa|Ley|Resoluci[oó]n General|Resoluci[oó]n Conjunta|Resoluci[oó]n Sintetizada|Resoluci[oó]n|Disposici[oó]n|Acordada|Comunicaci[oó]n|Circular|Laudo)\s+([\d./-]+\/\d{4})\.\s*(.*)$/;

const RE_NUMERO_EDICION = /BOLET[IÍ]N OFICIAL N[º°]\s*([\d.]+)/i;
/** El BO numera sus años de publicación en romanos desde 1893. */
const RE_ANIO_ROMANO = /A[ñn]o\s+([IVXLCDM]{2,10})\b/;
const RE_FECHA_TEXTO =
  /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+(\d{1,2})\s+de\s+([a-zé]+)\s+de\s+(\d{4})/i;

const MESES: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  setiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

/**
 * Títulos que agrupan el sumario. No son normas: si no se descartan, quedan
 * pegados al organismo de la primera norma del grupo.
 */
const ENCABEZADOS = new Set(
  [
    "Avisos Nuevos",
    "Avisos Anteriores",
    "Leyes",
    "Decretos",
    "Decisiones Administrativas",
    "Resoluciones",
    "Resoluciones Generales",
    "Resoluciones Conjuntas",
    "Resoluciones Sintetizadas",
    "Disposiciones",
    "Disposiciones Sintetizadas",
    "Acordadas",
    "Comunicaciones",
    "Concursos Oficiales",
    "Avisos Oficiales",
    "Remates Oficiales",
    "Tratados y Convenios Internacionales",
  ].map((s) => s.toLowerCase()),
);

/** Las 4 horas cubren la edición del día sin castigar al sitio del BO. */
const TTL_MS = 4 * 60 * 60 * 1000;

let cache: { dato: BoletinDelDia; expira: number } | null = null;
let enVuelo: Promise<BoletinDelDia> | null = null;

function lineasSumario(texto: string): string[] {
  const i = texto.indexOf("SUMARIO");
  if (i < 0) return [];
  const out: string[] = [];
  for (const l of texto.slice(i + "SUMARIO".length).split("\n")) {
    if (RE_HEADER.test(l)) break;
    out.push(l);
  }
  return out;
}

/** Reconstruye las entradas que el PDF partió en varias líneas. */
function entradas(lineas: string[]): string[] {
  const out: string[] = [];
  let buf = "";
  for (const raw of lineas) {
    const l = raw.replace(/\s+/g, " ").trim();
    if (!l) continue;
    if (ENCABEZADOS.has(l.toLowerCase())) {
      buf = "";
      continue;
    }
    buf = buf ? `${buf} ${l}` : l;
    if (RE_LEADER.test(buf)) {
      out.push(buf);
      buf = "";
    }
  }
  return out;
}

function parsearEntrada(entrada: string, fecha: string | null): NormaBoletin | null {
  // Fuera los puntos guía y el número de página que cierran la línea.
  const limpio = entrada.replace(/\.{4,}.*$/, "").trim();
  if (!limpio) return null;

  const m = limpio.match(RE_ENTRADA);
  if (!m) return null;

  const [, organismoRaw, tipo, numero, resto] = m;
  // El resto viene como "CODIGO-GDE - síntesis" o solo el código.
  const partes = resto.split(/\s+-\s+/);
  const codigo = (partes.shift() ?? "").replace(/\.$/, "").trim();
  const sumario = partes.join(" - ").replace(/\.$/, "").trim();
  const organismo = organismoRaw.trim();

  const { relevante, motivos } = evaluarRelevancia({ organismo, sumario, codigo });

  return {
    id: `${fecha ?? "s-f"}-${codigo || `${tipo}-${numero}`}`,
    organismo,
    tipo,
    numero,
    codigo,
    sumario,
    relevante,
    motivos,
    familia: familiaDeOrganismo(organismo),
  };
}

function fechaEdicion(texto: string): { iso: string | null; textoFecha: string | null } {
  const m = texto.match(RE_FECHA_TEXTO);
  if (!m) return { iso: null, textoFecha: null };
  const [completo, , dia, mes, anio] = m;
  const mm = MESES[mes.toLowerCase()];
  return {
    iso: mm ? `${anio}-${mm}-${dia.padStart(2, "0")}` : null,
    textoFecha: completo.toLowerCase(),
  };
}

async function leerBoletin(): Promise<BoletinDelDia> {
  const base = { url: URL_PUBLICA, consultado: new Date().toISOString() };

  try {
    const res = await fetch(URL_PDF, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`el PDF respondió ${res.status}`);

    const capa = await extraerCapaTextoPdf(Buffer.from(await res.arrayBuffer()));
    if (!capa.tieneTexto) throw new Error("el PDF no trajo capa de texto");

    const { iso, textoFecha } = fechaEdicion(capa.texto);
    const normas = entradas(lineasSumario(capa.texto))
      .map((e) => parsearEntrada(e, iso))
      .filter((n): n is NormaBoletin => n !== null);

    return {
      ...base,
      fecha: iso,
      fechaTexto: textoFecha,
      numero: capa.texto.match(RE_NUMERO_EDICION)?.[1] ?? null,
      anioRomano: capa.texto.match(RE_ANIO_ROMANO)?.[1] ?? null,
      normas,
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error desconocido";
    return {
      ...base,
      fecha: null,
      fechaTexto: null,
      numero: null,
      anioRomano: null,
      normas: [],
      error: msg,
    };
  }
}

/** Edición del día, cacheada. Con `forzar` se saltea el caché. */
export async function boletinDelDia(forzar = false): Promise<BoletinDelDia> {
  const ahora = Date.now();
  if (!forzar && cache && cache.expira > ahora) return cache.dato;
  if (!forzar && enVuelo) return enVuelo;

  const trabajo = leerBoletin()
    .then((dato) => {
      // Un fallo no se cachea por 4 horas: se reintenta en la próxima visita.
      if (!dato.error) cache = { dato, expira: Date.now() + TTL_MS };
      return dato;
    })
    .finally(() => {
      enVuelo = null;
    });

  enVuelo = trabajo;
  return trabajo;
}

export type { BoletinDelDia, NormaBoletin };
