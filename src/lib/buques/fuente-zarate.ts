import "server-only";

import type { Arribo, EstadoBuque, ResultadoFuente } from "@/lib/buques/tipos";

/**
 * Terminal Zárate (TZ) — cronograma de arribos.
 *
 * Su web es un AngularJS que consume una API REST propia. Es la fuente más
 * completa de las terminales de contenedores: además del ETA trae la línea
 * marítima, el tipo de carga, el cut-off de consolidación y el forzoso, tanto
 * de la escala como de los contenedores.
 */

const ID = "zarate";
const BASE = "http://arrival.tz.com.ar/arrival/api";
const URL_PUBLICA = "http://arrival.tz.com.ar/arrival/";
const TIMEOUT_MS = 15_000;

type FilaTz = {
  ETAATA?: string | null;
  Buque?: string | null;
  Linea?: string | null;
  Agencia?: string | null;
  TipodeCarga?: string | null;
  VencForzoso?: string | null;
  VencForzosoCont?: string | null;
  CUTOFF?: string | null;
  ETDATD?: string | null;
  Estado?: string | null;
  Viaje?: string | null;
};

/** TZ publica el ciclo de la escala en tres estados. */
function mapearEstado(raw: string): EstadoBuque {
  switch (raw.trim().toUpperCase()) {
    case "REGISTRADO":
      return "esperado";
    case "ACTIVO":
      return "operando";
    case "FINALIZADO":
      return "finalizado";
    case "CANCELADO":
      return "cancelado";
    default:
      return "desconocido";
  }
}

/** "28/08/2026 18:00" o "20/08/2026" → { iso, hora }. */
function partirFechaHora(raw: string | null | undefined): {
  iso: string | null;
  hora: string | null;
} {
  const m = (raw ?? "")
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return { iso: null, hora: null };
  const [, d, mes, y, h, min] = m;
  return {
    iso: `${y}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}`,
    hora: h ? `${h.padStart(2, "0")}:${min}` : null,
  };
}

async function getJson(ruta: string): Promise<unknown> {
  const res = await fetch(`${BASE}/${ruta}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${ruta} respondió ${res.status}`);
  return res.json();
}

async function ultimaActualizacion(): Promise<string | null> {
  try {
    const raw = await getJson("FechaActualizacion/");
    const sello = typeof raw === "string" ? raw.trim() : "";
    return sello || null;
  } catch {
    return null;
  }
}

export async function consultarZarate(): Promise<ResultadoFuente> {
  const base: Omit<ResultadoFuente, "arribos" | "actualizado" | "error"> = {
    id: ID,
    nombre: "Terminal Zárate",
    url: URL_PUBLICA,
    puertos: ["Zárate"],
    alcance:
      "Contenedores, autos y carga general. Trae línea marítima, viaje, tipo de carga, cut-off de consolidación, ETD y forzoso.",
  };

  try {
    const [raw, actualizado] = await Promise.all([
      getJson("Consulta/"),
      ultimaActualizacion(),
    ]);

    const filas = Array.isArray(raw) ? (raw as FilaTz[]) : [];
    const arribos: Arribo[] = [];

    for (const [i, f] of filas.entries()) {
      const buque = String(f.Buque ?? "").replace(/\s+/g, " ").trim();
      if (!buque) continue;

      const eta = partirFechaHora(f.ETAATA);
      const etd = partirFechaHora(f.ETDATD);
      // La terminal publica dos forzosos: el de la escala y el de los
      // contenedores. Para el despachante manda el que exista.
      const forzoso =
        partirFechaHora(f.VencForzoso).iso ?? partirFechaHora(f.VencForzosoCont).iso;
      const viaje = String(f.Viaje ?? "").trim();

      arribos.push({
        // TZ no expone un id propio: la escala queda identificada por buque +
        // viaje + ETA, que es lo que la hace única en el cronograma.
        id: `${ID}-${buque}-${viaje || i}-${eta.iso ?? i}`,
        buque,
        // Acá el viaje viene en su propia columna, no pegado al nombre.
        viaje: viaje && viaje.toLowerCase() !== "tbc" ? viaje : null,
        etiqueta: viaje ? `${buque} ${viaje}` : buque,
        terminal: "Terminal Zárate",
        puerto: "Zárate",
        eta: eta.iso,
        etaHora: eta.hora,
        etd: etd.iso,
        cutoff: String(f.CUTOFF ?? "").trim() || null,
        forzoso,
        estado: mapearEstado(String(f.Estado ?? "")),
        // Como toda terminal de contenedores, la misma escala descarga impo y
        // carga expo: no se puede separar en una sola operación.
        operacion: "carga_descarga",
        linea: String(f.Linea ?? "").trim() || null,
        tipoCarga: String(f.TipodeCarga ?? "").trim() || null,
        producto: null,
        toneladas: null,
        bandera: null,
        eslora: null,
        agencia: String(f.Agencia ?? "").trim() || null,
        destino: null,
        ultimoPuerto: null,
        sitio: null,
        fuenteId: ID,
        marineTrafficId: null,
      });
    }

    return { ...base, arribos, actualizado, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error desconocido";
    return { ...base, arribos: [], actualizado: null, error: msg };
  }
}
