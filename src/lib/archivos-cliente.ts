import "server-only";
import { unlink } from "node:fs/promises";
import {
  escribirArchivoSeguro,
  leerArchivoSeguro,
} from "./almacenamiento-seguro";
import { dentroDeClientes, rutaArchivo } from "./parquet-store";

/**
 * Punto único de acceso a los archivos de los clientes.
 *
 * Antes cada ruta armaba la ruta, chequeaba el encierro del directorio y hacía
 * su propio `readFile`. Eso significa que la seguridad dependía de que quien
 * escribiera la próxima ruta se acordara de repetir los tres pasos — y alcanza
 * con que uno se olvide del chequeo para abrir un agujero. Acá el cifrado y la
 * validación de ruta son parte de leer y escribir: no hay forma de saltearlos
 * sin salirse de estas funciones.
 */

/** Guarda cifrado y comprimido, con permisos 600. */
export async function guardarDocumento(
  userId: string,
  storedName: string,
  contenido: Buffer,
): Promise<boolean> {
  const destino = rutaArchivo(userId, storedName);
  if (!dentroDeClientes(destino)) return false;
  await escribirArchivoSeguro(destino, contenido, userId, storedName);
  return true;
}

/**
 * Lee y descifra. Devuelve null si la ruta se sale del directorio de clientes,
 * si el archivo no está, o si el contenido fue alterado (GCM lo detecta).
 */
export async function leerDocumento(
  userId: string,
  storedName: string,
): Promise<Buffer | null> {
  const origen = rutaArchivo(userId, storedName);
  if (!dentroDeClientes(origen)) return null;
  return leerArchivoSeguro(origen, userId, storedName);
}

export async function borrarDocumento(
  userId: string,
  storedName: string,
): Promise<void> {
  const destino = rutaArchivo(userId, storedName);
  if (!dentroDeClientes(destino)) return;
  await unlink(destino).catch(() => {});
}
