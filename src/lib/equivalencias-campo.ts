/**
 * Equivalencias globales entre valores de documentos (peso, montos).
 * Usado en reconciliación y filtro de ruido del cruce IA.
 */

const UNIDAD_TON =
  /\b(mt|mts|m\.?t\.?|tm|tn|to|ton|tons|tonelada|toneladas|metric ton|metric tons)\b/i;

const UNIDAD_MASA =
  /\b(mt|mts|m\.?t\.?|tm|tn|to|ton|tons|tonelada|kg|kilogram|lb|lbs)\b/i;

export function normMonto(v: string): string {
  const limpio = String(v ?? "")
    .replace(/[^\d.,-]/g, "")
    .replace(/,/g, ".");
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? String(n) : limpio;
}

/** Canoniza pesos con unidad; toneladas → «N MT». */
export function normPesoDocumento(v: string): string {
  const s = String(v ?? "").trim();
  if (!s) return s;
  const m = s.match(/^([\d.,]+)\s*(.*)$/);
  if (m) {
    const num = normMonto(m[1]!);
    const unit = (m[2] ?? "").trim();
    if (unit && UNIDAD_TON.test(unit)) return `${num} MT`;
    if (unit && /\bkg\b/i.test(unit)) return `${num} kg`;
    if (!unit) return num;
    return `${num} ${unit}`.replace(/\s+/g, " ");
  }
  if (UNIDAD_MASA.test(s)) return s.replace(/\s+/g, " ");
  return normMonto(s);
}

export function montosEquivalentes(a: string, b: string): boolean {
  const na = parseFloat(normMonto(a));
  const nb = parseFloat(normMonto(b));
  return Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) < 0.02;
}

export function pesosEquivalentes(a: string, b: string): boolean {
  if (a === b) return true;
  if (montosEquivalentes(a, b)) return true;
  const na = parseFloat(normMonto(a));
  const nb = parseFloat(normMonto(b));
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  if (Math.abs(na - nb) > 0.02) return false;

  const ua = a.match(UNIDAD_MASA)?.[0]?.toLowerCase();
  const ub = b.match(UNIDAD_MASA)?.[0]?.toLowerCase();
  if (ua && ub) {
    const canon = (u: string) =>
      /^(mt|mts|m\.?t\.?|tm|tn|to|ton|tons?|tonelada)/.test(u) ? "mt" : u;
    return canon(ua) === canon(ub);
  }
  return !UNIDAD_MASA.test(a) && !UNIDAD_MASA.test(b);
}

const RE_PESO_EN_TEXTO =
  /([\d][\d.,]*)\s*(MT|M\.?T\.?|TM|TN|TO|TON|TONS?|KG|KGS?)/gi;

/** Extrae fragmentos «número + unidad de masa» de un texto libre. */
export function extraerFragmentosPeso(texto: string): string[] {
  const out: string[] = [];
  for (const m of texto.matchAll(RE_PESO_EN_TEXTO)) {
    out.push(normPesoDocumento(`${m[1]!} ${m[2]!}`));
  }
  return out;
}

/** ¿El texto describe pesos que en realidad son equivalentes? */
export function textoSoloPesosEquivalentes(texto: string): boolean {
  const pesos = extraerFragmentosPeso(texto);
  if (pesos.length < 2) return false;
  const ref = pesos[0]!;
  return pesos.every((p) => pesosEquivalentes(ref, p));
}

/** Observaciones que la IA etiqueta mal como inconsistencia. */
export function inconsistenciaEsObservacionBlanda(texto: string): boolean {
  const t = texto.toLowerCase();
  return (
    /coincide exactamente|es normal|no (?:es|hay) inconsistencia|v[aá]lido pero|requiere claridad pero|no permite verificar si/.test(
      t,
    ) || /solo para verificar|diferencia m[ií]nima.*redondeo/.test(t)
  );
}

export function filtrarInconsistenciasRuido(inconsistencias: string[]): string[] {
  return inconsistencias.filter((s) => {
    const t = String(s ?? "").trim();
    if (!t) return false;
    if (inconsistenciaEsObservacionBlanda(t)) return false;
    if (textoSoloPesosEquivalentes(t)) return false;
    return true;
  });
}
