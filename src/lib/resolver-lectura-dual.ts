import "server-only";

import {
  iaDocsDisponible,
  leerArchivoConVision,
  leerContenidoConVision,
  MODELO_LECTURA,
} from "@/lib/ia-documentos";
import type { ArchivoIA } from "@/lib/ia-documentos";
import type { PaginaImagen } from "@/lib/pdf-preparar";

const MAX_TOKENS = 8192;

const SYSTEM_VERIFICAR =
  "Tenés el PDF original y dos transcripciones previas (capa embebida del archivo vs " +
  "visión) que DISCREPAN en puntos concretos.\n\n" +
  "Mirá el PDF y devolvé la transcripción literal CORRECTA verificando visualmente " +
  "los fragmentos en disputa.\n" +
  "REGLAS:\n" +
  "1. Números, fechas y códigos deben coincidir exactamente con el PDF.\n" +
  "2. No inventes texto que no esté en el documento.\n" +
  "3. En PDF nativo, la capa embebida suele ser fiel salvo en los puntos en disputa.\n" +
  "Respondé SOLO la transcripción final, sin markdown ni comentarios.";

type BloqueVision =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: "image/jpeg" | "image/png";
        data: string;
      };
    };

function promptVerificacion(
  nombreArchivo: string,
  embebido: string,
  vision: string,
  conflictos: string[],
): string {
  const lista =
    conflictos.length > 0
      ? conflictos.map((c, i) => `${i + 1}. ${c}`).join("\n")
      : "Las dos versiones difieren en contenido sustancial.";

  return (
    `Archivo: ${nombreArchivo}\n\n` +
    `Puntos en disputa (verificá en el PDF):\n${lista}\n\n` +
    `=== CAPA EMBEBIDA (PyMuPDF) ===\n${embebido.trim()}\n\n` +
    `=== VISIÓN PREVIA ===\n${vision.trim()}\n\n` +
    "Transcripción final verificada contra el PDF:"
  );
}

async function verificarConPaginas(
  archivo: ArchivoIA,
  paginas: PaginaImagen[],
  userText: string,
): Promise<string | null> {
  const bloques: BloqueVision[] = [{ type: "text", text: userText }];
  for (const p of paginas) {
    bloques.push({
      type: "text",
      text:
        paginas.length > 1
          ? `${archivo.nombre} — página ${p.n} de ${paginas.length}`
          : archivo.nombre,
    });
    bloques.push({
      type: "image",
      source: {
        type: "base64",
        media_type: p.mediaType,
        data: p.base64,
      },
    });
  }

  try {
    const texto = await leerContenidoConVision(
      bloques,
      MAX_TOKENS,
      {
        etiqueta: "doc.verificar-lectura",
        detalle: archivo.nombre,
        modelo: MODELO_LECTURA,
      },
      { system: SYSTEM_VERIFICAR, modelo: MODELO_LECTURA },
    );
    return texto.trim() || null;
  } catch (err) {
    console.error(`[doc.verificar-lectura] ${archivo.nombre}:`, err);
    return null;
  }
}

/**
 * Conflicto real capa vs visión: re-verificación con el PDF (no arbitraje texto ciego).
 */
export async function verificarLecturaConPdf(
  archivo: ArchivoIA,
  paginas: PaginaImagen[],
  embebido: string,
  vision: string,
  conflictos: string[],
): Promise<string | null> {
  if (!iaDocsDisponible()) return null;
  const a = embebido.trim();
  const b = vision.trim();
  if (!a || !b) return a || b || null;

  const userText = promptVerificacion(archivo.nombre, a, b, conflictos);

  if (paginas.length > 0) {
    return verificarConPaginas(archivo, paginas, userText);
  }

  try {
    const texto = await leerArchivoConVision(
      archivo,
      MAX_TOKENS,
      {
        etiqueta: "doc.verificar-lectura",
        detalle: archivo.nombre,
        modelo: MODELO_LECTURA,
      },
      {
        userText,
        system: SYSTEM_VERIFICAR,
        modelo: MODELO_LECTURA,
      },
    );
    return texto.trim() || null;
  } catch (err) {
    console.error(`[doc.verificar-lectura] ${archivo.nombre}:`, err);
    return null;
  }
}

/** @deprecated usar verificarLecturaConPdf */
export async function arbitrarLecturaDual(
  embebido: string,
  vision: string,
  _nombreArchivo: string,
): Promise<string | null> {
  return embebido.trim() || vision.trim() || null;
}
