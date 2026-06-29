/**
 * Utilidades estructurales para parsear salida JSON de la IA (refs, niveles).
 * Sin rubricas ni reglas de prompt — la IA decide en extracción/cruce.
 */

export type NivelHallazgo = "ok" | "warn" | "error";

export type HallazgoConRef = {
  nivel: NivelHallazgo;
  texto: string;
  ref?: string | null;
};

export type FaltanteConRef = {
  doc: string;
  motivo?: string;
  ref?: string | null;
};

const REF_NORMATIVA =
  /^(CA|ROM|VAL)\s·\s(Art\.|Ap\.\s*[IVXLC\d]+)|^VUCE\s·\s(Intervención|Antidumping)/i;

export function refNormativaValida(ref: string | null | undefined): boolean {
  return Boolean(ref?.trim() && REF_NORMATIVA.test(ref.trim()));
}

export function textoConRef(item: { texto: string; ref?: string | null }): string {
  const ref = item.ref?.trim();
  if (ref && refNormativaValida(ref)) return `[${ref}] ${item.texto}`;
  return item.texto;
}

/** Descarta warn/error sin ref normativa válida; ok pasa siempre. */
export function filtrarHallazgosFundamentados<T extends HallazgoConRef>(items: T[]): T[] {
  return items.filter((h) => {
    if (h.nivel === "ok") return Boolean(h.texto?.trim());
    return refNormativaValida(h.ref) && Boolean(h.texto?.trim());
  });
}

/** Descarta faltantes sin ref normativa. */
export function filtrarFaltantesFundamentados<T extends FaltanteConRef>(items: T[]): T[] {
  return items.filter(
    (f) =>
      Boolean(f.doc?.trim()) &&
      refNormativaValida(f.ref) &&
      Boolean(String(f.motivo ?? "").trim()),
  );
}
