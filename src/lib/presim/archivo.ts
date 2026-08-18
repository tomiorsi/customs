import type { Bloque, DeclaracionSim } from "@/lib/presim/tipos";
import { NART_CABECERA, ORDEN_CABECERA, ORDEN_ITEM } from "@/lib/presim/tipos";

/**
 * Leer y escribir el archivo del pre-SIM.
 *
 * Sin dependencias del servidor a propósito: es texto puro, y así se puede
 * probar y usar desde cualquier lado.
 */

/* ─────────────────────────── leer ─────────────────────────── */

/**
 * Texto del archivo → bloques.
 *
 * Los archivos que genera Sintia vienen en latin-1 y con saltos de Windows;
 * eso lo resuelve quien lee el archivo, acá entra ya como string.
 */
export function leerDeclaracion(texto: string): DeclaracionSim {
  const bloques: Bloque[] = [];
  let actual: Bloque | null = null;

  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.trim();
    if (!l) continue;

    const sec = /^\[([A-Za-z0-9_]+)\]$/.exec(l);
    if (sec) {
      actual = { seccion: sec[1].toUpperCase(), pares: [] };
      bloques.push(actual);
      continue;
    }

    const par = /^([A-Za-z0-9_]+)=(.*)$/.exec(l);
    // Una línea suelta fuera de toda sección no es parte del formato: se
    // ignora en vez de inventarle una sección, para no fabricar datos.
    if (par && actual) actual.pares.push([par[1].toUpperCase(), par[2].trim()]);
  }

  return { bloques };
}

/* ─────────────────────────── escribir ─────────────────────────── */

/**
 * Bloques → texto.
 *
 * Un renglón en blanco entre bloques, como los archivos reales. El SIM tolera
 * el archivo sin esa línea, pero se respeta para que un diff contra un archivo
 * de Sintia dé exactamente igual.
 */
export function escribirDeclaracion(d: DeclaracionSim): string {
  return (
    d.bloques
      .map((b) => [`[${b.seccion}]`, ...b.pares.map(([k, v]) => `${k}=${v}`)].join("\n"))
      .join("\n\n") + "\n"
  );
}

/* ─────────────────────────── ordenar ─────────────────────────── */

/** El `NART` de un bloque, o el de cabecera si no lo lleva. */
export function nartDe(b: Bloque): string {
  const par = b.pares.find(([k]) => k === "NART" || k === "NARTEXT");
  return par ? par[1].trim() : NART_CABECERA;
}

/**
 * Reordena los bloques como los espera el SIM: cabecera y lo suyo, después
 * cada ítem con su ART, sus complementarios, sus regímenes y sus subítems.
 *
 * Estable dentro de cada grupo: si venían tres `[CPL]` seguidos, salen en el
 * mismo orden. Importa porque el orden de los complementarios es el que eligió
 * el declarante y no hay motivo para alterarlo.
 */
export function ordenarDeclaracion(d: DeclaracionSim): DeclaracionSim {
  const peso = (lista: readonly string[], sec: string) => {
    const i = lista.indexOf(sec);
    // Una sección que no conocemos va al final de su grupo en vez de perderse.
    return i === -1 ? lista.length : i;
  };

  const cabecera = d.bloques.filter(
    (b) => b.seccion === "DDT" || (nartDe(b) === NART_CABECERA && b.seccion !== "ART"),
  );
  const deItems = d.bloques.filter((b) => !cabecera.includes(b));

  cabecera.sort((a, b) => peso(ORDEN_CABECERA, a.seccion) - peso(ORDEN_CABECERA, b.seccion));

  const items = new Map<string, Bloque[]>();
  for (const b of deItems) {
    const n = nartDe(b);
    const arr = items.get(n);
    if (arr) arr.push(b);
    else items.set(n, [b]);
  }

  const ordenados: Bloque[] = [...cabecera];
  for (const nart of [...items.keys()].sort()) {
    const grupo = items.get(nart)!;
    grupo.sort((a, b) => peso(ORDEN_ITEM, a.seccion) - peso(ORDEN_ITEM, b.seccion));
    ordenados.push(...grupo);
  }

  return { bloques: ordenados };
}

/* ─────────────────────────── acceso ─────────────────────────── */

/** El valor de una clave dentro de un bloque. */
export function valor(b: Bloque, clave: string): string | null {
  const par = b.pares.find(([k]) => k === clave);
  return par ? par[1] : null;
}

/** El primer bloque de una sección. */
export function bloque(d: DeclaracionSim, seccion: string): Bloque | null {
  return d.bloques.find((b) => b.seccion === seccion) ?? null;
}

/** Todos los bloques de una sección. */
export function bloques(d: DeclaracionSim, seccion: string): Bloque[] {
  return d.bloques.filter((b) => b.seccion === seccion);
}

/** El subrégimen de la declaración: manda sobre qué campos son obligatorios. */
export function subregimenDe(d: DeclaracionSim): string | null {
  const ddt = bloque(d, "DDT");
  return ddt ? valor(ddt, "ISTA") : null;
}
