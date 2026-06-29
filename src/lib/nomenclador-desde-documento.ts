import "server-only";

import {
  lecturaTieneContenido,
  serializarLectura,
} from "@/lib/ia-extraccion";
import { leerDocumentoSubido, type ArchivoIA } from "@/lib/ia-documentos";

export type LecturaCatalogo = {
  /** Texto para clasificar (resumen si alcanza, si no lectura acotada). */
  texto: string;
  /** Vista corta para la UI. */
  resumen: string;
};

/**
 * Lee un catálogo/ficha con el mismo motor que la subida de documentos en
 * operaciones. Solo lectura — la clasificación va siempre por `/api/clasificar`.
 */
export async function leerCatalogoParaClasificar(
  archivo: ArchivoIA,
): Promise<LecturaCatalogo> {
  const leido = await leerDocumentoSubido(archivo, { tipoConocido: "otro" });
  const lectura = leido.lectura_bruta ?? {
    texto: leido.resumen,
    pares: [],
    tablas: [],
  };

  let raw = "";
  if (lecturaTieneContenido(lectura)) {
    raw = serializarLectura(lectura).trim();
  } else if (leido.resumen.trim()) {
    raw = leido.resumen.trim();
  }

  if (!raw.trim()) {
    throw new Error(
      "No se pudo leer el archivo. Probá con otro PDF o una imagen más nítida.",
    );
  }

  const resumen =
    leido.resumen.trim() ||
    raw.replace(/^LECTURA DEL PDF:\n?/i, "").slice(0, 280);
  const texto =
    resumen.length >= 40 ? resumen : raw.length <= 4000 ? raw : raw.slice(0, 4000);

  return { texto, resumen };
}
