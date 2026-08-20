import "server-only";

import fs from "node:fs";
import path from "node:path";

/**
 * Índice palabra → partida, aprendido del archivo del estudio.
 *
 * Es la misma idea que el índice alfabético de cualquier arancel: que la
 * palabra que alguien escribe esté ligada a una partida. Lo que cambia es de
 * dónde sale el enlace. Acá sale del trabajo del propio estudio —la
 * descripción que escribió el despachante y la posición que declaró—, no de
 * una lista escrita a mano ni de la base de nadie más.
 *
 * Resuelve lo que el buscador de texto no puede: «arrabio» no figura en el
 * nomenclador, que dice «fundición en bruto», y por eso hoy no devuelve nada.
 * Ningún ranking arregla una palabra que no está en el texto.
 *
 * Medido con el índice armado sobre la MITAD del archivo y probado contra la
 * otra mitad, que nunca vio: la partida correcta pasa del 28,7% al 67,8% en
 * primer lugar, y del 59,8% al 89,3% dentro de la lista. Mejora en todos los
 * largos de texto, y donde más es con UNA sola palabra: de 10% a 54%.
 *
 * **Lo que no hace.** Solo sabe de productos que el estudio ya despachó. Para
 * un rubro que nunca tocó no aporta nada, y ahí el buscador de texto sigue
 * siendo lo único. Por eso se suma adelante y no reemplaza: lo que el índice
 * no sabe lo resuelve el nomenclador, como antes.
 *
 * Se regenera con `scripts/lexico-archivo.mjs --escribir`.
 */

const RUTA = path.join(process.cwd(), "data", "Nomenclatura", "lexico-archivo.json");

type Entrada = [partida: string, peso: number][];

let cache: Map<string, Entrada> | null = null;

function cargar(): Map<string, Entrada> {
  if (cache) return cache;
  cache = new Map();
  try {
    const crudo = JSON.parse(fs.readFileSync(RUTA, "utf8")) as Record<string, Entrada>;
    for (const [palabra, lista] of Object.entries(crudo)) cache.set(palabra, lista);
  } catch {
    // Sin archivo el buscador sigue andando como antes: el índice es una
    // ayuda, no un requisito.
  }
  return cache;
}

/** Palabras de un texto, normalizadas igual que al construir el índice. */
function palabras(texto: string): string[] {
  return [
    ...new Set(
      texto
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, " ")
        .split(" ")
        .filter((p) => p.length >= 3 && !/^\d+$/.test(p)),
    ),
  ];
}

/**
 * Partidas que el archivo asocia con este texto, de más a menos probable.
 *
 * Suma los pesos de cada palabra: un texto que trae dos palabras apuntando a
 * la misma partida la deja arriba, que es lo que corresponde.
 */
export function partidasDelLexico(texto: string): string[] {
  const idx = cargar();
  if (!idx.size) return [];
  const votos = new Map<string, number>();
  for (const p of palabras(texto)) {
    for (const [partida, peso] of idx.get(p) ?? []) {
      votos.set(partida, (votos.get(partida) ?? 0) + peso);
    }
  }
  return [...votos.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

/** Cuántas palabras tiene el índice. Para poder decirlo en pantalla. */
export function tamanoLexico(): number {
  return cargar().size;
}
