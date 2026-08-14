import "server-only";

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ejecutarPythonScript } from "@/lib/python-runtime";

const SCRIPT_TEXTO = join(process.cwd(), "scripts", "pdf_texto.py");

export type FuenteLectura = "embebido" | "vision" | "arbitrada" | "verificada";

export type CapaTextoPdf = {
  texto: string;
  paginas: number;
  tieneTexto: boolean;
  /** Páginas transcritas con OCR local (EasyOCR), sin cloud. */
  ocrUsado?: boolean;
  paginasOcr?: number[];
  /** Alguna página solo-imagen no pudo transcribirse (OCR off o fallo). */
  ocrFallo?: boolean;
};

export type MetaLectura = {
  fuente: FuenteLectura;
  paginas: number;
  chars_embebido: number;
  /** Capa de texto del PDF (PyMuPDF), si existe. */
  texto_embebido?: string;
  /** Transcripción Haiku, solo si corrió visión. */
  texto_vision?: string;
  confiable_embebido: boolean;
  /** true = capa embebida y visión IA idénticas al 100% (normalizado). */
  lectura_validada_dual?: boolean;
  /** true = capa y visión difirieron; Haiku texto arbitra la transcripción final. */
  lectura_arbitrada?: boolean;
  /** true = capa y visión difirieron en sustancia; se re-verificó contra el PDF. */
  lectura_verificada_pdf?: boolean;
  /** Páginas transcritas con OCR local (EasyOCR). */
  ocr_usado?: boolean;
  paginas_ocr?: number[];
};

export type ResultadoDiffLectura = {
  /** Mismo contenido; solo cambia formato u orden. */
  equivalente: boolean;
  /** Discrepancia en números, códigos, fechas o texto faltante. */
  conflictoReal: boolean;
  /** Fragmentos para el prompt de verificación visual (máx ~12). */
  conflictos: string[];
};

function pdfEnTemp(buf: Buffer): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "desp-pdf-"));
  const path = join(dir, "doc.pdf");
  writeFileSync(path, buf);
  return { dir, path };
}

function limpiarTemp(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

export type OpcionesCapaTexto = {
  /**
   * Saltea el OCR de páginas solo-imagen. Para PDFs que se sabe que son
   * nativos (boletines, reportes oficiales) evita cargar PyTorch y EasyOCR
   * por una página decorativa: son ~17 segundos contra ~0,2.
   */
  sinOcr?: boolean;
};

/**
 * Se queda con el objeto JSON de la salida del script.
 *
 * MuPDF escribe sus avisos ("warning: ...") directo a la salida estándar, en
 * la misma que el JSON, así que ante un PDF con cualquier irregularidad la
 * respuesta viene con basura adelante y `JSON.parse` explota. Recortamos entre
 * la primera llave y la última.
 */
function soloJson(salida: string): string {
  const desde = salida.indexOf("{");
  const hasta = salida.lastIndexOf("}");
  if (desde < 0 || hasta <= desde) {
    throw new Error(
      `el script no devolvió JSON: ${salida.trim().slice(0, 120) || "(vacío)"}`,
    );
  }
  return salida.slice(desde, hasta + 1);
}

/** Texto embebido + OCR local en páginas solo-imagen (cola global, $0). */
export async function extraerCapaTextoPdf(
  buf: Buffer,
  opciones: OpcionesCapaTexto = {},
): Promise<CapaTextoPdf> {
  const { dir, path } = pdfEnTemp(buf);
  try {
    const out = await ejecutarPythonScript(
      SCRIPT_TEXTO,
      [path],
      undefined,
      opciones.sinOcr ? { PDF_TEXTO_SIN_OCR: "1" } : {},
    );
    const raw = JSON.parse(soloJson(out)) as {
      texto?: string;
      paginas?: number;
      tiene_texto?: boolean;
      ocr_usado?: boolean;
      paginas_ocr?: number[];
      ocr_fallo?: boolean;
    };
    const texto = String(raw.texto ?? "").trim();
    const paginasOcr = Array.isArray(raw.paginas_ocr)
      ? raw.paginas_ocr.map((n) => Number(n)).filter((n) => n > 0)
      : undefined;
    return {
      texto,
      paginas: Math.max(1, Number(raw.paginas) || 1),
      tieneTexto: Boolean(raw.tiene_texto && texto),
      ocrUsado: Boolean(raw.ocr_usado),
      paginasOcr: paginasOcr?.length ? paginasOcr : undefined,
      ocrFallo: Boolean(raw.ocr_fallo),
    };
  } finally {
    limpiarTemp(dir);
  }
}

/**
 * Heurística global: ¿la capa embebida alcanza para operar sin visión?
 * Cubre PDFs nativos reales y detecta escaneos / capas rotas o vacías.
 */
export function embebidoEsConfiable(capa: CapaTextoPdf): boolean {
  if (capa.ocrFallo) return false;

  const t = capa.texto.trim();
  if (!capa.tieneTexto || t.length < 80) return false;

  const porPagina = t.length / Math.max(1, capa.paginas);
  if (porPagina < 40) return false;

  const sinEspacios = t.replace(/\s+/g, "");
  if (sinEspacios.length < 50) return false;

  const reemplazos = (t.match(/\uFFFD/g) || []).length;
  if (reemplazos > 2) return false;

  return true;
}

/** Segunda opinión Haiku en PDFs nativos (default ON). Opt-out: LECTURA_SIN_VALIDAR_VISION=1 */
export function dualValidacionLectura(): boolean {
  const v = process.env.LECTURA_SIN_VALIDAR_VISION?.trim();
  return v !== "1" && v !== "true";
}

/** @deprecated usar dualValidacionLectura */
export function validarVisionNativo(): boolean {
  return dualValidacionLectura();
}

/** Normaliza espacios y saltos para comparar capa vs visión. */
export function normalizarTextoLectura(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

/** ¿Idénticos al 100% tras normalizar? Gate antes de interpretar. */
export function textosLecturaIdenticos(a: string, b: string): boolean {
  const na = normalizarTextoLectura(a);
  const nb = normalizarTextoLectura(b);
  return na.length > 0 && na === nb;
}

/**
 * ¿Capa embebida y visión dicen lo mismo? (referencia, no ground truth).
 * Tolerante a espacios; exige solapamiento alto de longitud y prefijo.
 */
export function textosLecturaCoinciden(a: string, b: string): boolean {
  const na = normalizarTextoLectura(a);
  const nb = normalizarTextoLectura(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const maxLen = Math.max(na.length, nb.length);
  const minLen = Math.min(na.length, nb.length);
  if (minLen / maxLen < 0.75) return false;

  const prefijo = Math.min(120, minLen);
  if (na.slice(0, prefijo) !== nb.slice(0, prefijo)) return false;

  const corto = na.length <= nb.length ? na : nb;
  const largo = na.length <= nb.length ? nb : na;
  return largo.includes(corto.slice(0, Math.min(200, corto.length)));
}

/** Normaliza layout/espacios para comparar sustancia, no formato. */
export function normalizarContenidoLectura(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([|:/\\\-,;])\s*/g, "$1")
    .trim()
    .toUpperCase();
}

function normalizarTokenNumerico(raw: string): string {
  let x = raw.replace(/\s/g, "").toUpperCase();
  if (!/^[\d.,/\-]+$/.test(x)) return x;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(x)) {
    x = x.replace(/,/g, "");
  } else {
    x = x.replace(/,/g, ".");
  }
  return x.replace(/\/+$/, "");
}

/** Números, fechas, contenedores, NCM — lo que no puede “arbitrarse” a ciegas. */
export function extraerTokensCriticos(s: string): string[] {
  const t = s.replace(/\s+/g, " ");
  const out = new Set<string>();

  for (const m of t.matchAll(/\b\d[\d.,/\-]*\d|\d{2,}\b/g)) {
    const n = normalizarTokenNumerico(m[0]);
    if (n.length >= 2) out.add(n);
  }
  for (const m of t.matchAll(/\b[A-Z]{4}\d{7}\b/gi)) {
    out.add(m[0].toUpperCase());
  }
  for (const m of t.matchAll(/\b\d{4}[.\s]\d{2}[.\s]\d{2}(?:[.\s]\d{2,3})?\b/g)) {
    out.add(m[0].replace(/\s/g, ".").toUpperCase());
  }
  for (const m of t.matchAll(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g)) {
    out.add(m[0]);
  }

  return [...out];
}

function contarTokens(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function jaccardPalabras(a: string, b: string): number {
  const wa = new Set(a.split(" ").filter((w) => w.length > 1));
  const wb = new Set(b.split(" ").filter((w) => w.length > 1));
  if (!wa.size && !wb.size) return 1;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  const union = new Set([...wa, ...wb]).size;
  return union > 0 ? inter / union : 0;
}

function fragmentosEnDisputa(a: string, b: string): string[] {
  const la = a.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const lb = b.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const nb = new Set(lb.map(normalizarContenidoLectura));
  const na = new Set(la.map(normalizarContenidoLectura));
  const out: string[] = [];

  for (const l of la) {
    const n = normalizarContenidoLectura(l);
    if (!nb.has(n) && l.length > 10) {
      out.push(`Capa embebida: «${l.slice(0, 140)}»`);
    }
  }
  for (const l of lb) {
    const n = normalizarContenidoLectura(l);
    if (!na.has(n) && l.length > 10) {
      out.push(`Visión previa: «${l.slice(0, 140)}»`);
    }
  }
  return out;
}

/**
 * ¿Capa vs visión difieren en sustancia o solo en layout?
 * Equivalente → usar capa embebida sin segunda llamada IA.
 */
export function analizarDiferenciaLectura(a: string, b: string): ResultadoDiffLectura {
  const ea = a.trim();
  const eb = b.trim();
  if (!ea || !eb) {
    return {
      equivalente: ea === eb,
      conflictoReal: ea !== eb,
      conflictos: [],
    };
  }

  if (textosLecturaIdenticos(ea, eb)) {
    return { equivalente: true, conflictoReal: false, conflictos: [] };
  }

  const na = normalizarContenidoLectura(ea);
  const nb = normalizarContenidoLectura(eb);
  if (na === nb) {
    return { equivalente: true, conflictoReal: false, conflictos: [] };
  }

  const ca = contarTokens(extraerTokensCriticos(ea));
  const cb = contarTokens(extraerTokensCriticos(eb));
  const tokensDistintos: string[] = [];
  for (const k of new Set([...ca.keys(), ...cb.keys()])) {
    if ((ca.get(k) ?? 0) !== (cb.get(k) ?? 0)) tokensDistintos.push(k);
  }

  if (tokensDistintos.length > 0) {
    const conflictos = [
      ...tokensDistintos.slice(0, 6).map((t) => `Valor crítico distinto: «${t}»`),
      ...fragmentosEnDisputa(ea, eb),
    ].slice(0, 12);
    return { equivalente: false, conflictoReal: true, conflictos };
  }

  if (textosLecturaCoinciden(ea, eb)) {
    return { equivalente: true, conflictoReal: false, conflictos: [] };
  }

  const jaccard = jaccardPalabras(na, nb);
  const lenRatio =
    Math.min(na.length, nb.length) / Math.max(na.length, nb.length);

  const conflictoReal = lenRatio < 0.88 && jaccard < 0.94;

  if (!conflictoReal) {
    return { equivalente: true, conflictoReal: false, conflictos: [] };
  }

  const conflictos = fragmentosEnDisputa(ea, eb).slice(0, 12);
  return { equivalente: false, conflictoReal: true, conflictos };
}
