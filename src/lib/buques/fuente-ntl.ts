import "server-only";

import {
  separarViaje,
  type Arribo,
  type EstadoBuque,
  type ResultadoFuente,
} from "@/lib/buques/tipos";

/**
 * NTL publica el cronograma de arribos de cuatro terminales de contenedores.
 * No es un feed propio: NTL scrapea las páginas públicas de cada terminal y
 * republica el resultado, con un timestamp de actualización por terminal.
 *
 * Endpoint ASP.NET (.asmx) que devuelve JSON en `{"d": [...]}`. Sin auth.
 */

const ID = "ntl";
const BASE = "http://ntlweb.com/WebServices/ServicioControles.asmx";
const URL_PUBLICA = "http://ntlweb.com/arribos.html";
const TIMEOUT_MS = 15_000;

/**
 * A qué puerto pertenece cada terminal que publica NTL. La fuente informa la
 * terminal pero no el puerto, y el operador necesita el puerto para saber ante
 * qué aduana se juega la carpeta.
 */
const PUERTO_POR_TERMINAL: Record<string, string> = {
  Exolgan: "Dock Sud",
  TRP: "Buenos Aires",
  "Terminal 4": "Buenos Aires",
  TPR: "Rosario",
};

type FilaNtl = {
  IDItem?: number;
  terminal?: string;
  barco?: string;
  fechaETA?: string;
  fechaForzoso?: string;
  estado?: string;
  idBuqueMT?: number;
};

/** NTL publica los estados en español y, en la versión EN, algunos en inglés. */
function mapearEstado(raw: string): EstadoBuque {
  switch (raw.trim().toLowerCase()) {
    case "esperado":
    case "expected":
      return "esperado";
    case "arribado":
    case "arrived":
      return "arribado";
    case "operando":
    case "working":
      return "operando";
    case "finalizado":
    case "finished":
      return "finalizado";
    case "cancelado":
    case "cancelled":
      return "cancelado";
    default:
      return "desconocido";
  }
}

/** "14/8/2026" → "2026-08-14". Devuelve null si no es una fecha completa. */
function isoDesdeDmy(raw: string | undefined): string | null {
  const m = (raw ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mes, y] = m;
  return `${y}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

async function postJson(metodo: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${metodo} respondió ${res.status}`);
  return res.json();
}

/** "14/8/2026 11:02" → ms, para comparar timestamps sin depender del formato. */
function msDesdeSello(sello: string): number | null {
  const m = sello.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, d, mes, y, h, min] = m;
  return Date.UTC(+y, +mes - 1, +d, +h, +min);
}

/**
 * NTL scrapea cada terminal por separado y publica un sello por terminal.
 * Nos quedamos con el más viejo: el lineup completo es tan fresco como su
 * terminal más desactualizada, y decir lo contrario sería optimista de más.
 */
async function ultimaActualizacion(): Promise<string | null> {
  try {
    const raw = (await postJson("ListarUltimaActualizacion", {})) as { d?: unknown };
    const sellos = Array.isArray(raw.d)
      ? raw.d.map((v) => String(v).trim()).filter(Boolean)
      : [];
    if (!sellos.length) return null;

    let peor: { sello: string; ms: number } | null = null;
    for (const sello of sellos) {
      const ms = msDesdeSello(sello);
      if (ms == null) continue;
      if (!peor || ms < peor.ms) peor = { sello, ms };
    }
    return peor?.sello ?? sellos[0];
  } catch {
    return null;
  }
}

export async function consultarNtl(): Promise<ResultadoFuente> {
  const base: Omit<ResultadoFuente, "arribos" | "actualizado" | "error"> = {
    id: ID,
    nombre: "NTL — terminales de contenedores",
    url: URL_PUBLICA,
    puertos: ["Buenos Aires", "Dock Sud", "Rosario"],
    alcance:
      "Exolgan, TRP, Terminal 4 y TPR. Trae ETA, viaje, forzoso y estado operativo; no informa carga.",
  };

  try {
    const [raw, actualizado] = await Promise.all([
      postJson("ListarArribos", { terminal: "0" }) as Promise<{ d?: FilaNtl[] }>,
      ultimaActualizacion(),
    ]);

    const filas = Array.isArray(raw.d) ? raw.d : [];
    const arribos: Arribo[] = [];

    for (const f of filas) {
      const etiqueta = String(f.barco ?? "").replace(/\s+/g, " ").trim();
      if (!etiqueta) continue;

      const { buque, viaje } = separarViaje(etiqueta);
      const terminal = String(f.terminal ?? "").trim() || null;
      const mt = Number(f.idBuqueMT ?? 0);

      arribos.push({
        id: `${ID}-${f.IDItem ?? `${etiqueta}-${f.fechaETA ?? ""}`}`,
        buque,
        viaje,
        etiqueta,
        terminal,
        puerto: (terminal && PUERTO_POR_TERMINAL[terminal]) || "Buenos Aires",
        eta: isoDesdeDmy(f.fechaETA),
        etaHora: null,
        etd: null,
        cutoff: null,
        forzoso: isoDesdeDmy(f.fechaForzoso),
        estado: mapearEstado(String(f.estado ?? "")),
        // El cronograma de una terminal de contenedores no distingue carga de
        // descarga: el mismo buque descarga impo y carga expo en la misma escala.
        operacion: "carga_descarga",
        linea: null,
        tipoCarga: null,
        producto: null,
        toneladas: null,
        bandera: null,
        eslora: null,
        agencia: null,
        destino: null,
        ultimoPuerto: null,
        sitio: null,
        fuenteId: ID,
        marineTrafficId: Number.isFinite(mt) && mt > 0 ? mt : null,
      });
    }

    return { ...base, arribos, actualizado, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error desconocido";
    return { ...base, arribos: [], actualizado: null, error: msg };
  }
}
