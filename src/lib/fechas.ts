/**
 * Calendario y reloj de Argentina (America/Argentina/Buenos_Aires).
 * Usar en vencimientos, avisos y cualquier "hoy" del negocio.
 *
 * Fechas comerciales: por defecto DD/MM (Argentina y la mayoría del mundo).
 * MM/DD cuando el emisor es de EE.UU. o el texto solo tiene sentido así.
 */

export const TZ_AR = "America/Argentina/Buenos_Aires";

export type FormatoFechaPreferido = "dd_mm" | "mm_dd";

/** Contexto para interpretar fechas ambiguas (05/06/2026). */
export type ContextoFechaComercial = {
  /** Quién emite la factura (triangulación: país del facturador, no siempre origen). */
  paisEmisor?: string | null;
  paisAdquisicion?: string | null;
  /** Referencia para validar plausibilidad; default = hoy en Argentina. */
  hoyAr?: string;
};

/** Fecha de hoy en Argentina como ISO YYYY-MM-DD. */
export function hoyIsoArgentina(fecha = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_AR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

/** Bloque para prompts de IA: fecha de referencia del servidor (Argentina). */
export function contextoFechaReferenciaIA(fecha = new Date()): string {
  const hoy = hoyIsoArgentina(fecha);
  return (
    `FECHA DE REFERENCIA (Argentina, ${TZ_AR}): ${hoy} (${formatearFechaAr(hoy)}). ` +
    `Usá SOLO esta fecha para comparar si una fecha de documento es pasada, futura o ` +
    `vigente; no inventes ni asumas otra "fecha actual".`
  );
}

/** Hora legible en Argentina (para UI opcional). */
export function horaArgentina(fecha = new Date()): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ_AR,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(fecha);
}

/** Convierte ISO YYYY-MM-DD a ms UTC (medianoche calendario, sin DST). */
function isoAMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return Date.UTC(y, mo - 1, d);
}

function normalizarPaisClave(pais: string | null | undefined): string {
  return (pais ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Países donde lo habitual en facturas comerciales es mes/día/año. */
const PAISES_MM_DD = new Set([
  "estados unidos",
  "usa",
  "eeuu",
  "ee.uu.",
  "ee.uu",
  "u.s.a.",
  "u.s.a",
  "us",
  "united states",
  "america",
]);

function paisUsaFormatoMmDd(pais: string | null | undefined): boolean {
  const n = normalizarPaisClave(pais);
  if (!n) return false;
  if (PAISES_MM_DD.has(n)) return true;
  return /\b(estados unidos|united states|u\.?s\.?a?\.?)\b/.test(n);
}

/**
 * Formato preferido según contexto de la operación.
 * Default: DD/MM (Argentina, Mercosur, Europa, Brasil, etc.).
 */
export function formatoFechaPreferido(
  ctx?: ContextoFechaComercial,
): FormatoFechaPreferido {
  if (
    paisUsaFormatoMmDd(ctx?.paisEmisor) ||
    paisUsaFormatoMmDd(ctx?.paisAdquisicion)
  ) {
    return "mm_dd";
  }
  return "dd_mm";
}

/** Arma contexto de fechas desde campos de la operación. */
export function contextoFechaDesdeOperacion(op: {
  pais_adquisicion?: string | null;
  pais_origen?: string | null;
}): ContextoFechaComercial {
  return {
    paisAdquisicion: op.pais_adquisicion,
    // En triangulación quien factura suele ser el país de adquisición.
    paisEmisor: op.pais_adquisicion ?? op.pais_origen,
  };
}

function isoDesdePartes(yyyy: string, mm: number, dd: number): string | null {
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function candidatosSlash(
  p1: number,
  p2: number,
  yyyy: string,
  prefer: FormatoFechaPreferido,
): string[] {
  const out: string[] = [];
  const push = (mm: number, dd: number) => {
    const iso = isoDesdePartes(yyyy, mm, dd);
    if (iso && !out.includes(iso)) out.push(iso);
  };

  if (p1 > 12 && p2 <= 12) {
    push(p2, p1);
    return out;
  }
  if (p2 > 12 && p1 <= 12) {
    push(p1, p2);
    return out;
  }

  if (prefer === "mm_dd") {
    push(p1, p2);
    push(p2, p1);
  } else {
    push(p2, p1);
    push(p1, p2);
  }
  return out;
}

function elegirCandidatoFecha(candidatos: string[]): string | null {
  for (const c of candidatos) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(c)) return c;
  }
  return null;
}

/**
 * Parsea una fecha comercial a ISO YYYY-MM-DD.
 * - Sin ambigüedad: respeta el formato evidente en el texto.
 * - Ambigua: usa país del emisor; si empatan, DD/MM (operación argentina).
 * - Año de 2 dígitos: no se expande (evita 51→2051); devuelve null.
 */
export function parseFechaComercial(
  texto: string | null | undefined,
  ctx?: ContextoFechaComercial,
): string | null {
  if (!texto?.trim()) return null;
  const s = texto.trim().replace(/\s+/g, " ");
  const prefer = formatoFechaPreferido(ctx);

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = Number(iso[1]);
    let mo = Number(iso[2]);
    let d = Number(iso[3]);
    if (mo > 12 && d >= 1 && d <= 12) {
      const tmp = mo;
      mo = d;
      d = tmp;
    }
    return isoDesdePartes(String(y), mo, d);
  }

  const ymd = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (ymd) {
    return isoDesdePartes(ymd[1], Number(ymd[2]), Number(ymd[3]));
  }

  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const yyyy = dmy[3];
    if (yyyy.length === 2) return null;
    const p1 = Number(dmy[1]);
    const p2 = Number(dmy[2]);
    const candidatos = candidatosSlash(p1, p2, yyyy, prefer);
    return elegirCandidatoFecha(candidatos);
  }

  return null;
}

/**
 * Alias histórico: parseo con contexto opcional (default Argentina DD/MM).
 */
export function parseFechaArgentina(
  texto: string | null | undefined,
  ctx?: ContextoFechaComercial,
): string | null {
  return parseFechaComercial(texto, ctx);
}

/** Suma días calendario a una fecha ISO (sin depender de la TZ del servidor). */
export function sumarDiasCalendario(iso: string, dias: number): string | null {
  const ms = isoAMs(iso);
  if (ms == null || dias <= 0) return null;
  const r = new Date(ms + dias * 86_400_000);
  const y = r.getUTCFullYear();
  const m = String(r.getUTCMonth() + 1).padStart(2, "0");
  const d = String(r.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Días entre dos fechas ISO (hasta - desde). Positivo = hasta es futuro. */
export function diasEntreIso(desdeIso: string, hastaIso: string): number | null {
  const a = isoAMs(desdeIso);
  const b = isoAMs(hastaIso);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86_400_000);
}

export function formatearFechaAr(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const MAX_ANTIGUEDAD_FACTURA_DIAS = 540; // ~18 meses
const MAX_FUTURO_FACTURA_DIAS = 14;

/**
 * ¿La fecha de factura es creíble para una operación vigente?
 * Filtra OCR/IA erróneos (ej. Incoterms 2020 leído como fecha).
 */
export function fechaFacturaPlausible(
  iso: string | null | undefined,
  hoyAr = hoyIsoArgentina(),
): boolean {
  const f = parseFechaComercial(iso ?? "", { hoyAr });
  if (!f) return false;
  const diasDesdeEmision = diasEntreIso(f, hoyAr);
  if (diasDesdeEmision == null) return false;
  if (diasDesdeEmision < 0 && Math.abs(diasDesdeEmision) > MAX_FUTURO_FACTURA_DIAS) {
    return false;
  }
  if (diasDesdeEmision > MAX_ANTIGUEDAD_FACTURA_DIAS) return false;
  return true;
}

/** Plazo de pago comercial razonable (días). */
export function plazoPagoRazonable(dias: number): boolean {
  return Number.isFinite(dias) && dias > 0 && dias <= 365;
}
