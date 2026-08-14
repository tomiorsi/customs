import "server-only";

import { extraerCapaTextoPdf } from "@/lib/capa-texto-pdf";
import type { Arribo, OperacionBuque, ResultadoFuente } from "@/lib/buques/tipos";

/**
 * Consorcio de Gestión del Puerto de Bahía Blanca — "Posición de buques".
 *
 * Es la fuente más rica del país: la sección ANUNCIOS es un lineup real con
 * fecha, producto, toneladas y si el buque viene a cargar o a descargar
 * (o sea, importación). Se publica como PDF nativo, así que se lee con el
 * mismo extractor de capa de texto que usa el pipeline de documentos.
 */

const ID = "bahia-blanca";
const URL_PDF = "https://puertobahiablanca.com/situacion_operativa/posicion.pdf";
const URL_PUBLICA = "https://puertobahiablanca.com/vts-online.html";
const TIMEOUT_MS = 20_000;

const RE_FECHA = /^(\d{2})\/(\d{2})\/(\d{4})$/;
/** "        12.000 ACEITE GIRASOL" → toneladas + producto. */
const RE_TONS = /^\s*([\d.,]+)\s+(.+)$/;
const RE_SOLO_NUM = /^[\s\d.,]+$/;
const RE_ESLORA = /^\d{1,3}(?:[.,]\d+)?$/;
const RE_AGENCIA = /^[A-Z]{2,4}$/;
/** Después de este título el PDF deja de ser tabular y pasa a texto libre. */
const CORTE_SECCION = /BUQUES EN REPARACIONES/i;
/** Encabezados y pies que se repiten en cada página. */
const RUIDO = /^(Pag \d|Página \d|Consorcio de Gesti|RG SGC|email:|VARIOS$)/i;

type Bloque = { eta: string; lineas: string[] };

/** Recorta el texto del PDF a la sección ANUNCIOS y saca el ruido de página. */
function lineasAnuncios(texto: string): string[] {
  const i = texto.indexOf("ANUNCIOS");
  if (i < 0) return [];
  let lineas = texto
    .slice(i)
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""));
  const fin = lineas.findIndex((l) => CORTE_SECCION.test(l));
  if (fin > 0) lineas = lineas.slice(0, fin);
  return lineas.filter((l) => !RUIDO.test(l.trim()));
}

/**
 * Cada registro arranca con su fecha de arribo. Agrupamos por esa ancla en vez
 * de asumir un número fijo de líneas: las columnas opcionales (puerto de
 * origen, destino en los bunkers) hacen variar el largo del bloque.
 */
function bloquesPorFecha(lineas: string[]): Bloque[] {
  const out: Bloque[] = [];
  let actual: Bloque | null = null;

  for (const l of lineas) {
    const m = l.trim().match(RE_FECHA);
    if (m) {
      if (actual) out.push(actual);
      actual = { eta: `${m[3]}-${m[2]}-${m[1]}`, lineas: [] };
      continue;
    }
    if (actual && l.trim()) actual.lineas.push(l);
  }
  if (actual) out.push(actual);
  return out;
}

/**
 * Lee un bloque asignando campos por forma (fecha, número, código de agencia,
 * marca C/D/BUNKER) y no por posición fija. Si el bloque no tiene la marca de
 * operación no es un registro: se descarta antes que adivinar.
 */
function parsearBloque(b: Bloque): Arribo | null {
  const l = [...b.lineas];
  // Los totales de columna quedan pegados al último registro de cada grupo.
  while (l.length && RE_SOLO_NUM.test(l[l.length - 1])) l.pop();
  if (l.length < 4) return null;

  const buque = l[0].trim();
  const bandera = l[1]?.trim() || null;
  if (!buque) return null;

  let i = 2;
  const esloraRaw = l[i]?.trim() ?? "";
  const eslora = RE_ESLORA.test(esloraRaw)
    ? Number(esloraRaw.replace(",", "."))
    : null;
  if (eslora != null) i++;

  const agenciaRaw = l[i]?.trim() ?? "";
  const agencia = RE_AGENCIA.test(agenciaRaw) ? agenciaRaw : null;
  if (agencia) i++;

  const marca = (l[i]?.trim() ?? "").toUpperCase();
  let operacion: OperacionBuque;
  if (marca === "BUNKER") operacion = "bunker";
  else if (marca === "C") operacion = "carga";
  else if (marca === "D") operacion = "descarga";
  else return null;
  i++;

  let toneladas: number | null = null;
  let producto: string | null = null;
  let destino: string | null = null;

  // Los bunkers no llevan columnas de carga ni destino: paran solo a cargar
  // combustible. El resto sí.
  if (operacion !== "bunker") {
    const m = l[i]?.match(RE_TONS);
    if (m) {
      const n = Number(m[1].replace(/\./g, "").replace(",", "."));
      toneladas = Number.isFinite(n) ? n : null;
      producto = m[2].trim();
      i++;
    }
    destino = l[i]?.trim() || null;
    i++;
  }

  const sitio = l[i]?.trim() || null;
  const ultimoPuerto = l[i + 1]?.trim() || null;

  return {
    id: `${ID}-${b.eta}-${buque}`,
    buque,
    viaje: null,
    etiqueta: buque,
    // El "sitio" del anuncio es la terminal asignada (CARGILL, DREYFUS, TBB 9…).
    terminal: sitio,
    puerto: "Bahía Blanca",
    eta: b.eta,
    etaHora: null,
    etd: null,
    cutoff: null,
    forzoso: null,
    // Un anuncio es, por definición, un buque todavía no arribado.
    estado: "esperado",
    operacion,
    linea: null,
    tipoCarga: null,
    producto,
    toneladas,
    bandera,
    eslora,
    agencia,
    destino,
    ultimoPuerto,
    sitio,
    fuenteId: ID,
    marineTrafficId: null,
  };
}

export async function consultarBahiaBlanca(): Promise<ResultadoFuente> {
  const base: Omit<ResultadoFuente, "arribos" | "actualizado" | "error"> = {
    id: ID,
    nombre: "Puerto de Bahía Blanca — Anuncios",
    url: URL_PUBLICA,
    puertos: ["Bahía Blanca"],
    alcance:
      "Lineup oficial del Consorcio: fecha, producto, toneladas, bandera, agencia, destino y último puerto. Distingue carga de descarga (importación).",
  };

  try {
    const res = await fetch(URL_PDF, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`el PDF respondió ${res.status}`);

    const buf = Buffer.from(await res.arrayBuffer());
    // El parte del Consorcio es un PDF nativo: sin OCR se lee en milisegundos.
    const capa = await extraerCapaTextoPdf(buf, { sinOcr: true });
    if (!capa.tieneTexto) throw new Error("el PDF no trajo capa de texto");

    const arribos = bloquesPorFecha(lineasAnuncios(capa.texto))
      .map(parsearBloque)
      .filter((a): a is Arribo => a !== null);

    if (!arribos.length) {
      throw new Error("no se reconoció ningún anuncio en el PDF");
    }

    // El PDF fecha la publicación en su encabezado (DD-MM-AAAA).
    const fechado = capa.texto.match(/\b(\d{2})-(\d{2})-(\d{4})\b/);
    const actualizado = fechado ? `${fechado[1]}/${fechado[2]}/${fechado[3]}` : null;

    return { ...base, arribos, actualizado, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error desconocido";
    return { ...base, arribos: [], actualizado: null, error: msg };
  }
}
