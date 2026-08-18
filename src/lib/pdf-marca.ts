import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PDFDocument, PDFImage } from "pdf-lib";
import { logoParaPdf } from "./logo-estudio";
import type { PublicUser } from "./types";

/**
 * Marca del estudio en los PDF.
 *
 * El logo lo sube cada estudio y puede tener cualquier proporción: un wordmark
 * apaisado, un isotipo cuadrado, un escudo vertical. Dibujarlo con alto y ancho
 * fijos lo deformaría —y un logo estirado es exactamente lo que un estudio no
 * quiere mandarle a un cliente—, así que se encaja dentro de una caja
 * respetando su proporción.
 */

/** Logo propio de la plataforma, para cuando el estudio no subió el suyo. */
const LOGO_FALLBACK = path.join(process.cwd(), "public", "jc-logo.png");

/**
 * Embebe el logo del estudio; si no hay, cae al de la plataforma; si tampoco,
 * devuelve null y el encabezado usa el nombre en texto. Un PDF de cotización
 * nunca puede fallar por una imagen.
 */
export async function embeberLogo(
  doc: PDFDocument,
  user: PublicUser | null,
): Promise<PDFImage | null> {
  if (user) {
    const propio = await logoParaPdf(user);
    // Siempre PNG: se normaliza al subirlo.
    if (propio) {
      try {
        return await doc.embedPng(propio);
      } catch {
        /* sigue al fallback */
      }
    }
  }
  try {
    return await doc.embedPng(await readFile(LOGO_FALLBACK));
  } catch {
    return null;
  }
}

export type CajaLogo = {
  /** Borde derecho: el logo se alinea a la derecha desde ahí. */
  derecha: number;
  /** Centro vertical de la caja. */
  centroY: number;
  maxAncho: number;
  maxAlto: number;
};

export type LogoDibujado = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Calcula dónde y de qué tamaño dibujar el logo para que entre en la caja sin
 * deformarse, alineado a la derecha y centrado en vertical.
 *
 * Se escala por el lado que primero toca el borde (el mismo criterio que
 * `object-fit: contain`) y nunca se agranda más allá de la caja: un logo chico
 * se dibuja a su tamaño real antes que estirado y borroso.
 */
export function encajarLogo(img: PDFImage, caja: CajaLogo): LogoDibujado {
  const escala = Math.min(
    caja.maxAncho / img.width,
    caja.maxAlto / img.height,
    1,
  );
  const width = img.width * escala;
  const height = img.height * escala;
  return {
    x: caja.derecha - width,
    y: caja.centroY - height / 2,
    width,
    height,
  };
}
