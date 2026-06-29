import "server-only";

import { DOC_LABELS, type DocType } from "@/lib/docs";
import { iaDocsDisponible, invocarIATexto, MODELO } from "@/lib/ia-documentos";

const MAX_TOKENS = 128;
const MAX_TEXTO = 12_000;

/**
 * Clasifica el tipo de documento leyendo el CONTENIDO (post-lectura).
 * No usa el nombre del archivo. Si no hay evidencia clara → otro.
 */
export async function clasificarDocumentoPorContenido(input: {
  texto: string;
  nombreArchivo: string;
  resumen?: string;
}): Promise<DocType> {
  if (!iaDocsDisponible()) return "otro";

  const texto = input.texto.trim();
  if (texto.length < 80) return "otro";

  const tipos = Object.keys(DOC_LABELS) as DocType[];
  const system =
    "Clasificá el tipo de documento aduanero/comercial según su CONTENIDO transcrito.\n" +
    "No clasifiques por el nombre del archivo. Elegí el código que mejor describa la " +
    "naturaleza jurídica del documento leído; si no hay evidencia suficiente, respondé otro.\n" +
    `Códigos válidos: ${tipos.join(", ")}.\n` +
    'JSON: {"tipo":"<codigo>"}.';

  const userText =
    `Archivo (referencia, no clasificar por esto): ${input.nombreArchivo}\n` +
    (input.resumen?.trim() ? `Resumen extracción: ${input.resumen.trim()}\n\n` : "") +
    "CONTENIDO LEÍDO:\n---\n" +
    texto.slice(0, MAX_TEXTO) +
    "\n---";

  try {
    const parsed = await invocarIATexto(system, userText, MAX_TOKENS, {
      etiqueta: "doc.clasificar-contenido",
      detalle: input.nombreArchivo,
      modelo: MODELO,
    });
    const tipo = String(parsed.tipo ?? "").trim();
    return (tipos as string[]).includes(tipo) ? (tipo as DocType) : "otro";
  } catch (err) {
    console.error(`[doc.clasificar-contenido] ${input.nombreArchivo}:`, err);
    return "otro";
  }
}
