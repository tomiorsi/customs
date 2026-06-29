/** Constantes legacy — sesiones anteriores con pregunta de equipo padre. */
export const PREGUNTA_NCM_MAQUINA_PADRE =
  "¿Cuál es la posición NCM de la máquina o aparato al que corresponde este artículo?";

export function soloDigitosNcm(texto: string): string {
  return (texto ?? "").replace(/\D/g, "");
}

export function extraerNcmDeTexto(texto: string): string | null {
  const m = (texto ?? "").match(
    /\b(\d{4}(?:\.\d{2}){0,3}(?:\.\d{3})?[A-Za-z]?)\b/,
  );
  if (!m) return null;
  const d = soloDigitosNcm(m[1] ?? "");
  return d.length >= 6 ? m[1].trim() : null;
}

/**
 * Formato canónico para guardar NCM máquina padre:
 * - SIM completa si el usuario la dio (≥8 dígitos + opcional letra).
 * - Si no, subpartida de 6 dígitos — nunca solo 4.
 */
export function normalizarNcmMaquina(texto: string): string | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  const extraido = extraerNcmDeTexto(t);
  const digitos = soloDigitosNcm(extraido ?? t);
  if (digitos.length < 6) return null;
  if (extraido && digitos.length >= 8) return extraido;
  if (extraido && digitos.length === 6) return extraido;
  return `${digitos.slice(0, 4)}.${digitos.slice(4, 6)}`;
}

/** Normaliza texto para comparar preguntas/opciones (sin acentos, minúsculas). */
export function normClaveTexto(p: string): string {
  return (p ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function esPreguntaNcmMaquinaPadre(pregunta: string): boolean {
  return normClaveTexto(pregunta) === normClaveTexto(PREGUNTA_NCM_MAQUINA_PADRE);
}

/** Pregunta inválida: pide al importador elegir partida/NCM en lugar de un dato factual. */
export function preguntaPideClasificacion(pregunta: string): boolean {
  const n = normClaveTexto(pregunta);
  if (!n) return false;
  if (/\b\d{4}\b/.test(n)) return true;
  if (/\b(ncm|subpartida|partida|capitulo)\b/.test(n)) return true;
  if (/\b(posicion arancelaria|codigo arancelario)\b/.test(n)) return true;
  if (/\b(nomenclador|listado provisto|listado actual)\b/.test(n)) return true;
  if (/\b(requiere acceso|se requiere acceso)\b/.test(n)) return true;
  if (/\b(existe en el nomenclador|figura en el listado)\b/.test(n)) return true;
  return false;
}

/** Opciones mal formadas: la IA puso preguntas enteras en lugar de respuestas cortas. */
export function opcionesParecenPreguntas(opciones: string[]): boolean {
  const ops = opciones.map((o) => (o ?? "").trim()).filter(Boolean);
  if (ops.length < 2) return false;
  const comoPregunta = ops.filter((o) => /^\s*¿/.test(o) || /\?\s*$/.test(o)).length;
  return comoPregunta >= 2 || ops.some((o) => o.length > 120);
}
