import type { ContextoClasificacion, Respuesta } from "./tipos";
import {
  esPreguntaNcmMaquinaPadre,
  normalizarNcmMaquina,
  normClaveTexto,
} from "./preguntas-sistema";

/**
 * Quita pistas de clasificación en opciones (referencias a partida, capítulo o NCM).
 */
export function sanitizarOpcionHecho(opcion: string): string {
  let s = opcion.trim();
  s = s.replace(/\s*\([^)]*(?:partida|cap[ií]tulo|posici[oó]n|ncm)[^)]*\)/gi, "");
  s = s.replace(/\s*\([^)]*\b\d{4}(?:\.\d{2}){0,3}\b[^)]*\)/gi, "");
  s = s.replace(/\s*(?:del?\s+)?cap[ií]tulo\s+[ivxlcdm\d]+[^.]*\.?/gi, "");
  return s.replace(/\s{2,}/g, " ").trim();
}

/** Encabezado de partida/capítulo pegado como descripción (no es texto facturado). */
function esSegmentoEncabezadoLegal(segmento: string): boolean {
  const t = segmento.trim();
  if (!t) return true;
  const letters = t.replace(/[^a-zA-ZÀ-ÿ]/g, "");
  if (letters.length < 15) return false;
  const upper = (t.match(/[A-ZÀ-ÜÁÉÍÓÚÑ]/g) ?? []).length;
  const ratio = upper / letters.length;
  const hasDigit = /\d/.test(t);
  if (t.length >= 80 && ratio > 0.75) return true;
  if (ratio > 0.85 && !hasDigit) return true;
  return false;
}

/** Quita encabezados legales iniciales; conserva la descripción facturada del artículo. */
export function limpiarProductoHechos(producto: string): string {
  const parts = (producto ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  while (parts.length > 1 && esSegmentoEncabezadoLegal(parts[0]!)) {
    parts.shift();
  }
  const out = parts.join(", ").trim();
  return out || (producto ?? "").trim();
}

/** Producto + hechos declarados (sin repetir ni subsumir la misma afirmación). */
export function bloqueHechos(producto: string, respuestas: Respuesta[]): string {
  const lineas = [`- ${limpiarProductoHechos(producto)}`];
  const opciones: string[] = [];
  for (const r of respuestas.filter((x) => x.opcion?.trim())) {
    const op = sanitizarOpcionHecho(r.opcion.trim());
    if (op) opciones.push(op);
  }
  const filtradas: string[] = [];
  for (const op of opciones) {
    const cl = normClaveTexto(op);
    if (!cl) continue;
    const subsumida = opciones.some((otra) => {
      if (otra === op) return false;
      const co = normClaveTexto(otra);
      return co.length > cl.length && co.includes(cl);
    });
    if (subsumida) continue;
    if (filtradas.some((f) => normClaveTexto(f) === cl)) continue;
    filtradas.push(op);
  }
  for (const op of filtradas) lineas.push(`- ${op}`);
  return `HECHOS:\n${lineas.join("\n")}`;
}

function ncmYaEnProducto(producto: string, ncm: string): boolean {
  const d = ncm.replace(/\D/g, "");
  if (d.length < 6) return false;
  return producto.replace(/\D/g, "").includes(d.slice(0, 6));
}

export function estadoClasificacion(args: {
  producto: string;
  respuestas: Respuesta[];
  ncmMaquinaPadre?: string;
}): string {
  const partes = [bloqueHechos(args.producto, args.respuestas)];
  const ncmPadre = args.ncmMaquinaPadre?.trim();
  if (ncmPadre && !ncmYaEnProducto(args.producto, ncmPadre)) {
    partes.push(`NCM MÁQUINA PADRE (hecho declarado): ${ncmPadre}`);
  }
  return partes.join("\n\n");
}

/**
 * Extrae el nombre base del producto: la parte que describe QUÉ ES el artículo.
 * - Separa en • o – cuando existen.
 * - Frases de máquina/equipo con propósito explícito → toma el propósito (hasta 6 palabras).
 * - Quita envoltorios kit/juego/set de antes de tomar palabras iniciales.
 * - Si no aplica lo anterior, toma hasta 6 palabras del inicio.
 */
/** Cola truncada que no aporta al tipo de artículo (preposiciones/abandonos de frase). */
const COLA_NOMBRE_INCOMPLETA = new Set([
  "del", "de", "para", "con", "en", "a", "y", "o", "despues", "antes", "durante", "mediante",
  "que", "se", "el", "la", "los", "las", "un", "una",
]);

function recortarColaIncompleta(palabras: string[]): string[] {
  const out = [...palabras];
  while (out.length && COLA_NOMBRE_INCOMPLETA.has(out[out.length - 1]!)) out.pop();
  return out;
}

export function nombreBaseProducto(producto: string): string {
  let t = producto.trim();
  const corte = t.search(/[•–]/);
  if (corte > 5) t = t.slice(0, corte).trim();

  t = t.replace(/^(?:kit|juego|set|surtido)\s+de\s+/i, "").trim();

  const norm = t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const proposito = norm.match(
    /^(?:maquina|equipo|aparato|sistema|dispositivo|instalacion)\s+(?:que\s+)?(?:se\s+)?(?:utiliza|usa)\s+para\s+(?:el|la|los|las)\s+(.+?)(?:[.,]|$)/,
  );
  if (proposito?.[1]) {
    let frase = proposito[1].trim();
    // Cortar subordinadas temporales que no nombran el artículo.
    frase = frase.split(/\s+(?:despues|antes|donde|cuando|mediante|mientras)\s+/)[0]?.trim() ?? frase;
    const palabras = recortarColaIncompleta(frase.split(/\s+/).slice(0, 8));
    if (palabras.length) {
      const head = norm.match(/^(maquina|equipo|aparato|sistema|dispositivo|instalacion)/)?.[1];
      return head ? `${head} ${palabras.join(" ")}` : palabras.join(" ");
    }
  }

  const palabras = t.split(/\s+/);
  return palabras.length > 6 ? palabras.slice(0, 6).join(" ") : t;
}

/** Texto para elegir partidas (nombre base + respuestas; evita ruido técnico en partidas). */
export function textoParaFiltroParquet(producto: string, respuestas: Respuesta[]): string {
  const partes = [nombreBaseProducto(producto)];
  for (const r of respuestas) {
    const op = sanitizarOpcionHecho(r.opcion?.trim() ?? "");
    if (op) partes.push(op);
  }
  return partes.join(" ");
}

/** Texto completo para rankear SIMs dentro de una partida ya elegida. */
export function textoParaSimsParquet(producto: string, respuestas: Respuesta[]): string {
  const partes = [producto.trim()];
  for (const r of respuestas) {
    const op = sanitizarOpcionHecho(r.opcion?.trim() ?? "");
    if (op) partes.push(op);
  }
  return partes.join(" ");
}

export function resolverContextoClasificacion(
  contexto: ContextoClasificacion | undefined,
  respuestas: Respuesta[],
): ContextoClasificacion {
  const out: ContextoClasificacion = { ...(contexto ?? {}) };
  for (const r of respuestas) {
    if (!esPreguntaNcmMaquinaPadre(r.pregunta)) continue;
    const ncm = normalizarNcmMaquina(r.opcion ?? "");
    if (ncm) out.ncmMaquina = ncm;
    else if ((r.opcion ?? "").trim()) out.equipoReferencia = r.opcion.trim();
  }
  return out;
}

export async function enriquecerContextoClasificacion(
  _producto: string,
  contexto: ContextoClasificacion | undefined,
  respuestas: Respuesta[],
): Promise<ContextoClasificacion> {
  const out = resolverContextoClasificacion(contexto, respuestas);
  if (out.ncmMaquina?.trim()) {
    out.ncmMaquina = normalizarNcmMaquina(out.ncmMaquina) ?? undefined;
  }
  return out;
}
