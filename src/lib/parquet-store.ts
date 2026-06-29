import "server-only";
import { existsSync } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import {
  ParquetReader,
  ParquetSchema,
  ParquetWriter,
} from "@dsnp/parquetjs";

/**
 * Almacenamiento por cliente basado en parquet.
 *
 * Estructura:
 *   data/clientes/<id_cliente>/operaciones.parquet
 *   data/clientes/<id_cliente>/documentos.parquet
 *   data/clientes/<id_cliente>/archivos/<archivo_subido>
 *
 * Parquet es columnar y no permite editar filas: cada alta/baja reescribe el
 * archivo completo (leer todo → modificar en memoria → sobrescribir).
 *
 * Nota: pensado para uso local de baja concurrencia. Las escrituras no son
 * transaccionales; dos escrituras simultáneas sobre el mismo cliente podrían
 * pisarse.
 */

const DATA_DIR = path.join(process.cwd(), "data");
export const CLIENTES_DIR = path.join(DATA_DIR, "clientes");

export type Fila = Record<string, string | null>;

export function clienteDir(userId: string): string {
  return path.join(CLIENTES_DIR, userId);
}

export function archivosDir(userId: string): string {
  return path.join(clienteDir(userId), "archivos");
}

/** Ruta absoluta de un archivo subido por un cliente. */
export function rutaArchivo(userId: string, storedName: string): string {
  return path.join(archivosDir(userId), storedName);
}

/** Verifica que una ruta resuelta quede dentro del directorio de clientes. */
export function dentroDeClientes(fullPath: string): boolean {
  const base = path.resolve(CLIENTES_DIR) + path.sep;
  return path.resolve(fullPath).startsWith(base);
}

function esquema(cols: readonly string[]): ParquetSchema {
  const def: Record<string, { type: "UTF8"; optional: true }> = {};
  for (const c of cols) def[c] = { type: "UTF8", optional: true };
  return new ParquetSchema(def);
}

/** Lee todas las filas de un parquet. Devuelve [] si el archivo no existe. */
export async function leerFilas(
  file: string,
  cols: readonly string[],
): Promise<Fila[]> {
  if (!existsSync(file)) return [];

  const reader = await ParquetReader.openFile(file);
  try {
    const cursor = reader.getCursor();
    const filas: Fila[] = [];
    let registro: Record<string, unknown> | null;
    while ((registro = (await cursor.next()) as Record<string, unknown> | null)) {
      const fila: Fila = {};
      for (const c of cols) {
        const v = registro[c];
        fila[c] = v === undefined || v === null ? null : String(v);
      }
      filas.push(fila);
    }
    return filas;
  } finally {
    await reader.close();
  }
}

/**
 * Sobrescribe por completo un parquet con las filas dadas.
 * Si no hay filas, elimina el archivo (parquet vacío no aporta nada).
 */
export async function escribirFilas(
  file: string,
  cols: readonly string[],
  filas: Fila[],
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });

  if (filas.length === 0) {
    if (existsSync(file)) await unlink(file);
    return;
  }

  // Escribimos a un temporal y luego reemplazamos el parquet con rename atómico.
  // Si se lee el archivo mientras se está guardando, el lector sigue viendo el
  // parquet anterior completo, nunca uno truncado o a medio cerrar.
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const writer = await ParquetWriter.openFile(esquema(cols), tmp);
  try {
    for (const fila of filas) {
      const registro: Record<string, string | null> = {};
      for (const c of cols) registro[c] = fila[c] ?? null;
      await writer.appendRow(registro);
    }
    await writer.close();
    await rename(tmp, file);
  } catch (err) {
    try {
      await writer.close();
    } catch {
      // Ignoramos el cierre fallido: el error real se relanza abajo.
    }
    try {
      await unlink(tmp);
    } catch {
      // Si no llegó a crearse o ya fue movido, no hay nada que limpiar.
    }
    throw err;
  } finally {
    // El cierre normal ocurre antes del rename; acá no hay trabajo pendiente.
  }
}
