import "server-only";

/**
 * Qué se puede subir, verificado por el CONTENIDO del archivo.
 *
 * El `Content-Type` que manda el navegador lo elige quien sube: renombrar un
 * ejecutable a `.pdf` y declararlo `application/pdf` es trivial. Por eso acá se
 * miran los primeros bytes, que son los que de verdad dicen qué es la cosa.
 *
 * El riesgo concreto que cierra: un HTML o un SVG subidos como "documento" y
 * después abiertos desde nuestro dominio ejecutan JavaScript con la sesión del
 * usuario que los abre. La descarga ya fuerza `attachment` para todo lo que no
 * sea PDF o imagen conocida, así que esto es la segunda barrera — y la que
 * evita que el archivo entre siquiera.
 */

export type TipoDetectado = {
  /** MIME real, según los bytes. */
  mime: string;
  extension: string;
  etiqueta: string;
};

type Firma = {
  mime: string;
  extension: string;
  etiqueta: string;
  /** Bytes iniciales esperados. */
  bytes: number[];
  /** Desde qué posición comparar (el .heic/.mp4 arrancan en 4). */
  offset?: number;
};

const FIRMAS: Firma[] = [
  { mime: "application/pdf", extension: "pdf", etiqueta: "PDF", bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: "image/jpeg", extension: "jpg", etiqueta: "imagen JPG", bytes: [0xff, 0xd8, 0xff] },
  {
    mime: "image/png",
    extension: "png",
    etiqueta: "imagen PNG",
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  { mime: "image/gif", extension: "gif", etiqueta: "imagen GIF", bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/tiff", extension: "tif", etiqueta: "imagen TIFF", bytes: [0x49, 0x49, 0x2a, 0x00] },
  { mime: "image/tiff", extension: "tif", etiqueta: "imagen TIFF", bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  // ZIP: además de .zip, es el contenedor de docx/xlsx. Se acepta como
  // documento ofimático; el riesgo de un zip es de quien lo abre, no del portal.
  { mime: "application/zip", extension: "zip", etiqueta: "archivo comprimido o documento de Office", bytes: [0x50, 0x4b, 0x03, 0x04] },
  // Formatos viejos de Office (.doc/.xls): contenedor OLE2.
  { mime: "application/msword", extension: "doc", etiqueta: "documento de Word/Excel", bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
];

/** WEBP y HEIC llevan la marca después de un encabezado de contenedor. */
function detectaContenedor(buf: Buffer): TipoDetectado | null {
  if (buf.length < 12) return null;
  const marca = buf.subarray(8, 12).toString("ascii");
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && marca === "WEBP") {
    return { mime: "image/webp", extension: "webp", etiqueta: "imagen WebP" };
  }
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const sub = buf.subarray(8, 12).toString("ascii");
    if (sub.startsWith("hei") || sub.startsWith("mif") || sub.startsWith("avi")) {
      return { mime: "image/heic", extension: "heic", etiqueta: "imagen HEIC" };
    }
  }
  return null;
}

/**
 * Afina los dos contenedores que sirven para varias cosas.
 *
 * Los formatos de Office no tienen firma propia: comparten contenedor.
 *  - `.xlsx` y `.docx` son ZIP, igual que cualquier comprimido.
 *  - `.xls` y `.doc` son OLE2, indistinguibles por los primeros bytes.
 *
 * Se distinguen por lo que llevan adentro, que sí es específico y verificable:
 * un `.xlsx` guarda sus hojas bajo `xl/` y un `.docx` su cuerpo en `word/`;
 * en OLE2, el flujo se llama `Workbook` en Excel y `WordDocument` en Word.
 *
 * Importa porque sin esto una factura en `.xlsx` se detectaba como comprimido
 * genérico y la lista blanca de la subida la rechazaba, aunque el sistema sepa
 * leerla perfectamente.
 *
 * Se mira solo el arranque del archivo: los nombres de entrada del ZIP y el
 * directorio OLE2 viven ahí, y recorrer un archivo entero por esto sería caro
 * al pedo.
 */
function afinarOffice(buf: Buffer, tipo: TipoDetectado): TipoDetectado {
  const cabeza = buf.subarray(0, Math.min(buf.length, 8192)).toString("latin1");

  if (tipo.mime === "application/zip") {
    if (cabeza.includes("xl/")) {
      return {
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        extension: "xlsx",
        etiqueta: "planilla de Excel",
      };
    }
    if (cabeza.includes("word/")) {
      return {
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        extension: "docx",
        etiqueta: "documento de Word",
      };
    }
    return tipo;
  }

  if (tipo.mime === "application/msword") {
    // En OLE2 los nombres del directorio van en UTF-16, así que entre letra y
    // letra hay un byte cero: se busca sobre el texto con los ceros sacados.
    const sinCeros = cabeza.replace(/\u0000/g, "");
    if (sinCeros.includes("Workbook") || sinCeros.includes("Book")) {
      return {
        mime: "application/vnd.ms-excel",
        extension: "xls",
        etiqueta: "planilla de Excel",
      };
    }
    return tipo;
  }

  return tipo;
}

/**
 * Detecta el tipo real. Devuelve null si no reconoce la firma, que es la
 * respuesta correcta para "esto no es un documento": preferimos rechazar algo
 * legítimo raro antes que aceptar algo ejecutable.
 */
export function detectarTipo(buf: Buffer): TipoDetectado | null {
  for (const f of FIRMAS) {
    const off = f.offset ?? 0;
    if (buf.length < off + f.bytes.length) continue;
    let coincide = true;
    for (let i = 0; i < f.bytes.length; i++) {
      if (buf[off + i] !== f.bytes[i]) {
        coincide = false;
        break;
      }
    }
    if (coincide) {
      return afinarOffice(buf, { mime: f.mime, extension: f.extension, etiqueta: f.etiqueta });
    }
  }
  return detectaContenedor(buf);
}

export type Verificacion =
  | { ok: true; tipo: TipoDetectado }
  | { ok: false; error: string };

/**
 * Verifica que el contenido sea uno de los formatos que aceptamos como
 * documentación. El nombre y el MIME declarado no participan de la decisión.
 */
export function verificarDocumento(buf: Buffer, nombre: string): Verificacion {
  if (buf.length === 0) {
    return { ok: false, error: `«${nombre}» está vacío.` };
  }
  const tipo = detectarTipo(buf);
  if (!tipo) {
    return {
      ok: false,
      error:
        `«${nombre}» no parece un documento válido. Se aceptan PDF, imágenes ` +
        `(JPG, PNG, WebP, HEIC, TIFF, GIF) y archivos de Office. ` +
        `Si es una captura o una foto, subila como imagen; si es un correo o una página, exportala a PDF.`,
    };
  }
  return { ok: true, tipo };
}
