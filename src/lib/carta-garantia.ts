/**
 * Carta de garantía del importador para retirar contenedores.
 *
 * - ANUAL: certificada por escribano, válida por AÑO CALENDARIO. Vence el 31/12
 *   del año de presentación; pasada esa fecha hay que renovarla.
 * - PUNTUAL: válida para un solo embarque (cita contenedor/BL). No se trackea
 *   vencimiento a nivel cliente: se gestiona por operación.
 *
 * Fuente: instructivos de navieras/agentes (p. ej. LK Global, Unlimited World),
 * vigencia atada al 31/12 del año del conocimiento de embarque.
 */

export type CartaGarantiaTipo = "anual" | "puntual" | "no";

export type CartaGarantiaEstado =
  | "vigente" // anual con vencimiento futuro
  | "vencida" // anual ya vencida → renovar
  | "puntual" // se gestiona por operación
  | "sin"; // sin carta registrada

/** Vencimiento de una carta anual: 31/12 del año de la fecha dada (ISO). */
export function vencimientoAnual(d: Date = new Date()): string {
  return `${d.getFullYear()}-12-31`;
}

/** Normaliza el tipo guardado en la base a un valor conocido. */
export function tipoCarta(tipo: string | null | undefined): CartaGarantiaTipo {
  const t = (tipo ?? "").trim().toLowerCase();
  if (t === "anual") return "anual";
  if (t === "puntual") return "puntual";
  return "no";
}

/** Estado actual de la carta a partir del tipo y el vencimiento guardados. */
export function estadoCartaGarantia(
  tipo: string | null | undefined,
  vence: string | null | undefined,
  hoy: Date = new Date(),
): CartaGarantiaEstado {
  const t = tipoCarta(tipo);
  if (t === "puntual") return "puntual";
  if (t !== "anual") return "sin";

  if (!vence) return "vigente";
  const fin = new Date(`${vence}T23:59:59`);
  if (Number.isNaN(fin.getTime())) return "vigente";
  return fin.getTime() < hoy.getTime() ? "vencida" : "vigente";
}

/** Fecha de vencimiento en formato DD/MM/AAAA (o null si no hay). */
export function formatVence(vence: string | null | undefined): string | null {
  if (!vence) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(vence.trim());
  if (!m) return null;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
