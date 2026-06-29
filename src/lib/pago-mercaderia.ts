/**
 * Condición comercial de la operación (comprador ↔ vendedor en el exterior).
 * El estudio NO gestiona ni avisa pagos de mercadería al proveedor: solo usa
 * la condición para el flujo operativo (banco, BL, COD). Ver docs/retiro-bl-logistica.md
 */

import { formaPagoMeta, type FormaPagoMeta } from "./cotizador";
import {
  parseFechaComercial,
  plazoPagoRazonable,
  type ContextoFechaComercial,
} from "./fechas";
import type { SubTarea } from "./workflow";

export type EtapaPagoMercaderia = "documentacion" | "embarque" | "liquidacion";

export type ConfigPagoMercaderia = {
  etapa: EtapaPagoMercaderia;
  subtarea: SubTarea;
  pagoDiferido: boolean;
};

/** @deprecated Usar parseFechaComercial de fechas.ts */
export const parseFechaFactura = parseFechaComercial;

/** Plazo en días desde texto de condiciones (NET 30, etc.) — solo registro interno. */
export function extraerPlazoDias(texto: string | null | undefined): number | null {
  if (!texto?.trim()) return null;
  const t = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const net = t.match(/\bnet\s*(\d{1,3})\b/);
  if (net) {
    const n = Number(net[1]);
    return plazoPagoRazonable(n) ? n : null;
  }

  const dias = t.match(/(?:a\s+|within\s+)?(\d{1,3})\s*(?:d[ií]as?|days?)\b/);
  if (dias) {
    const n = Number(dias[1]);
    return plazoPagoRazonable(n) ? n : null;
  }

  const plazo = t.match(/\bplazo\s*(?:de\s+)?(\d{1,3})\b/);
  if (plazo) {
    const n = Number(plazo[1]);
    return plazoPagoRazonable(n) ? n : null;
  }

  if (/\b(30|60|90|120)\s*(?:d[ií]as?|days?)?\b/.test(t)) {
    const m = t.match(/\b(30|60|90|120)\b/);
    if (m) return Number(m[1]);
  }

  return null;
}

const CONDICION_PAGO_EXPLICITA =
  /\b(net\s*\d+|cuenta|open account|diferid|plazo|cobranza|collection|carta|cr[eé]dito|credit|\bl\/?c\b|anticip|advance|prepaid|cod|consign|contra\s+(pago|aceptaci|documentos)|documents against|\bd\/?p\b|\bd\/?a\b|\d+\s*d[ií]as?|\d+\s*days?)\b/i;

/** Normaliza texto de condición leída en factura (sin checklist ni avisos). */
export function enriquecerFormaPagoComercial(
  formaPago: string | null | undefined,
  plazoDias: number | null,
): string | null {
  const fp = (formaPago ?? "").trim();
  if (plazoDias == null || !plazoPagoRazonable(plazoDias)) return fp || null;
  if (!fp) return `NET ${plazoDias} días`;
  if (CONDICION_PAGO_EXPLICITA.test(fp)) return fp;
  return `NET ${plazoDias} · ${fp}`;
}

/**
 * El estudio no calcula ni persiste vencimientos de pago al proveedor.
 * @deprecated Sin uso en UI; conservado por compatibilidad de imports.
 */
export function vencimientoPagoCoherente(_args: {
  fechaFactura?: string | null;
  plazoPagoDias?: string | null;
  fechaVencimientoPago?: string | null;
  hoyAr?: string;
  ctxFecha?: ContextoFechaComercial;
}): string | null {
  return null;
}

/**
 * Sin ítems de checklist de “pago al proveedor”: el banco/BL ya están en workflow.
 */
export function configPagoMercaderia(
  _formaPago: string | null | undefined,
  _via?: string | null,
): ConfigPagoMercaderia | null {
  return null;
}

/** Sin avisos de vencimiento al proveedor (fuera del rol del despachante). */
export function avisoVencimientoPagoMercaderia(_args: {
  formaPago?: string | null;
  via?: string | null;
  fechaFactura?: string | null;
  plazoPagoDias?: string | null;
  fechaVencimientoPago?: string | null;
  pagoConfirmado?: boolean;
  hoyAr?: string;
  ctxFecha?: ContextoFechaComercial;
}): null {
  return null;
}

/** @deprecated Ya no hay subtarea pago_mercaderia en el checklist. */
export const PRIORIDAD_PAGO_MERCADERIA = 46;
