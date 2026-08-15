import "server-only";

import { mkdirSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Fotos en disco de las fuentes externas (Boletín Oficial, prensa, buques).
 *
 * Las páginas no salen a internet: leen el archivo. Una tarea programada lo
 * reescribe a horario fijo. Así una visita nunca espera por un PDF ni por un
 * sitio de terceros caído, y el resultado es el mismo para todo el equipo
 * durante el día.
 *
 * Viven en data/, que está fuera de git y sobrevive a los despliegues.
 */

const DIR = path.join(process.cwd(), "data", "cache");

export type Snapshot<T> = {
  /** Cuándo se escribió esta foto (ISO). */
  generado: string;
  dato: T;
};

function archivo(nombre: string): string {
  return path.join(DIR, `${nombre}.json`);
}

/** Lee la foto guardada. Devuelve null si todavía no se generó o está rota. */
export async function leerSnapshot<T>(nombre: string): Promise<Snapshot<T> | null> {
  try {
    const crudo = await readFile(archivo(nombre), "utf8");
    const parsed = JSON.parse(crudo) as Snapshot<T>;
    if (!parsed || typeof parsed.generado !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Escribe la foto de forma atómica: primero a un temporal y después rename.
 * Si el proceso muere a mitad de la escritura, el archivo anterior queda
 * intacto en vez de dejar un JSON truncado que nadie puede leer.
 */
export async function escribirSnapshot<T>(nombre: string, dato: T): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  const destino = archivo(nombre);
  const temporal = `${destino}.tmp`;
  const contenido: Snapshot<T> = { generado: new Date().toISOString(), dato };
  await writeFile(temporal, JSON.stringify(contenido), "utf8");
  await rename(temporal, destino);
}

/** Antigüedad de una foto, en milisegundos. Infinito si la fecha está rota. */
export function edadSnapshot(generado: string): number {
  const t = Date.parse(generado);
  return Number.isFinite(t) ? Date.now() - t : Number.POSITIVE_INFINITY;
}

/** ¿La foto es de hoy? (comparando en la zona horaria de Argentina). */
export function esDeHoy(generado: string, hoyIso: string): boolean {
  try {
    const d = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(generado));
    return d === hoyIso;
  } catch {
    return false;
  }
}
