import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getDb } from "./db";
import { clienteDir } from "./parquet-store";
import { estudioDe } from "./roles";
import type { PublicUser } from "./types";

/**
 * Logo del estudio para los documentos que se le entregan al cliente.
 *
 * Vive con el resto de los archivos del estudio, no en `public/`: es material
 * de una cuenta y no tiene por qué quedar servido en una URL adivinable.
 *
 * Es del DUEÑO del estudio, no de cada usuario. Un empleado que descarga una
 * cotización la descarga con el logo del estudio; si cada uno pudiera poner el
 * suyo, dos PDF del mismo estudio saldrían con marcas distintas.
 *
 * SE ACEPTA CUALQUIER IMAGEN y se normaliza a PNG al subirla. pdf-lib solo
 * embebe PNG y JPG, así que la alternativa sería rechazar la mitad de los
 * archivos que la gente tiene a mano —el logo de un estudio suele venir en SVG
 * o WebP del diseñador—. Convertir una vez al subir es mejor que hacerle
 * convertir a mano a cada usuario, y deja un solo formato del lado del PDF.
 */

/** Todo lo que sharp sabe decodificar. El SVG se rasteriza al vuelo. */
export const TIPOS_LOGO = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/tiff",
  "image/svg+xml",
] as const;

/** Para el `accept` del input: lo mismo, más el comodín por si el navegador no infiere el MIME. */
export const ACCEPT_LOGO = `${TIPOS_LOGO.join(",")},.svg,.png,.jpg,.jpeg,.webp,.avif,.gif,.tif,.tiff`;

export const MAX_LOGO_BYTES = 8 * 1024 * 1024;

/**
 * Lado máximo del PNG normalizado.
 *
 * En el PDF el logo se dibuja en una caja de ~56 pt (≈ 0,78"). A 300 DPI eso
 * son ~235 px; 512 deja margen para que se vea nítido con zoom o en una
 * impresión más grande, sin guardar un archivo pesado al pedo. Achicamos si
 * viene más grande, y NO agrandamos un bitmap chico: escalar no inventa
 * detalle, solo lo hace borroso y más pesado.
 */
const LADO_MAX = 512;

/**
 * Densidad de rasterizado para entradas vectoriales (SVG).
 *
 * Un SVG no tiene píxeles: sharp lo rasteriza al tamaño que digan sus
 * atributos, que suele ser chico (32 o 64 px) y saldría pixelado. Con 300 DPI
 * el vector se dibuja grande y recién después se achica a LADO_MAX.
 */
const DENSIDAD_VECTOR = 300;

function dirLogo(estudioId: string): string {
  return path.join(clienteDir(estudioId), "marca");
}

export function rutaLogo(estudioId: string, archivo: string): string {
  // basename corta cualquier "../" que venga en el nombre guardado.
  return path.join(dirLogo(estudioId), path.basename(archivo));
}

/** Nombre del archivo de logo del estudio de este usuario, o null. */
export function logoDeEstudio(user: PublicUser): string | null {
  const fila = getDb()
    .prepare("SELECT logo FROM users WHERE id = ?")
    .get(estudioDe(user)) as { logo: string | null } | undefined;
  return fila?.logo?.trim() || null;
}

/**
 * Lee el logo listo para embeber. Siempre PNG: se normaliza al subirlo.
 *
 * Devuelve null si el estudio no tiene, si el archivo desapareció o si no se
 * puede leer: un PDF de cotización nunca puede fallar por una imagen.
 */
export async function logoParaPdf(user: PublicUser): Promise<Uint8Array | null> {
  const archivo = logoDeEstudio(user);
  if (!archivo) return null;
  try {
    return new Uint8Array(await readFile(rutaLogo(estudioDe(user), archivo)));
  } catch {
    return null;
  }
}

export type ResultadoGuardar = { ok: true; archivo: string } | { ok: false; error: string };

export async function guardarLogo(
  user: PublicUser,
  file: File,
): Promise<ResultadoGuardar> {
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, error: "El archivo no puede superar los 8 MB." };
  }

  const entrada = Buffer.from(await file.arrayBuffer());
  let png: Buffer;
  try {
    png = await sharp(entrada, { density: DENSIDAD_VECTOR })
      .resize({
        width: LADO_MAX,
        height: LADO_MAX,
        // "inside" mantiene la proporción y entra en la caja: nunca deforma ni
        // recorta. La proporción original es la que después decide cómo se
        // acomoda en el PDF.
        fit: "inside",
        withoutEnlargement: true,
      })
      // PNG conserva la transparencia: un logo con fondo recortado se imprime
      // sobre el blanco de la hoja sin un rectángulo alrededor.
      .png()
      .toBuffer();
  } catch {
    return {
      ok: false,
      error:
        "No se pudo leer la imagen. Probá con PNG, JPG, WebP o SVG (si es un PDF o un archivo de diseño, exportalo primero).",
    };
  }

  const estudio = estudioDe(user);
  // Nombre nuevo en cada subida: si reusáramos el mismo, el navegador seguiría
  // mostrando el logo viejo desde su caché.
  const archivo = `logo-${Date.now()}.png`;
  const dir = dirLogo(estudio);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  // El logo no lleva datos de terceros, pero comparte el mismo criterio de
  // permisos que el resto del directorio del estudio.
  await writeFile(path.join(dir, archivo), png, { mode: 0o600 });

  const anterior = logoDeEstudio(user);
  getDb().prepare("UPDATE users SET logo = ? WHERE id = ?").run(archivo, estudio);
  if (anterior && anterior !== archivo) {
    await unlink(rutaLogo(estudio, anterior)).catch(() => {});
  }
  return { ok: true, archivo };
}

export async function borrarLogo(user: PublicUser): Promise<void> {
  const estudio = estudioDe(user);
  const archivo = logoDeEstudio(user);
  getDb().prepare("UPDATE users SET logo = NULL WHERE id = ?").run(estudio);
  if (archivo) await unlink(rutaLogo(estudio, archivo)).catch(() => {});
}
