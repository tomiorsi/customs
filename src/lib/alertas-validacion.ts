/**
 * Filtros mínimos de flujo sobre salida JSON (vacíos, refs obligatorias en faltantes).
 */

import {
  filtrarFaltantesFundamentados,
  refNormativaValida,
  textoConRef,
} from "@/lib/ia-guardrails";

export type FaltanteValidacion = { doc: string; motivo?: string; ref?: string };

export function textoHallazgoValidacion(
  doc: string,
  motivo?: string | null,
): string {
  const d = doc.trim();
  const m = String(motivo ?? "").trim();
  return m ? `${d} — ${m}` : d;
}

export function sanearFaltantesIA<T extends FaltanteValidacion>(faltantes: T[]): T[] {
  return filtrarFaltantesFundamentados(
    faltantes.filter((f) => Boolean(f.doc?.trim()) && refNormativaValida(f.ref)),
  );
}

export function sanearInconsistenciasIA(inconsistencias: string[]): string[] {
  return inconsistencias
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);
}

export { textoConRef, refNormativaValida };
