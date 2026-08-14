import "server-only";

import { consultarNtl } from "@/lib/buques/fuente-ntl";
import { consultarZarate } from "@/lib/buques/fuente-zarate";
import { consultarBahiaBlanca } from "@/lib/buques/fuente-bahia-blanca";
import { escribirSnapshot, leerSnapshot } from "@/lib/snapshot";
import type { Arribo, ListadoBuques, ResultadoFuente } from "@/lib/buques/tipos";

/**
 * Agregador de lineups portuarios.
 *
 * Las fuentes son sitios de terceros que no nos deben nada: pueden tardar,
 * cambiar de formato o caerse. Por eso cada una se consulta en paralelo y de
 * forma aislada — si una falla, las demás igual se muestran y el error queda
 * visible en la UI en vez de disfrazarse de "no hay buques".
 */

type Fuente = () => Promise<ResultadoFuente>;

const FUENTES: Fuente[] = [consultarNtl, consultarZarate, consultarBahiaBlanca];

/** Nombre del archivo en data/cache/. */
export const SNAPSHOT = "buques";

/** Evita que varias requests simultáneas disparen la misma consulta externa. */
let enVuelo: Promise<ListadoBuques> | null = null;

function ordenar(arribos: Arribo[]): Arribo[] {
  return [...arribos].sort((a, b) => {
    // Sin ETA no hay dónde ubicarlo: va al final, no arriba de todo.
    if (a.eta !== b.eta) {
      if (!a.eta) return 1;
      if (!b.eta) return -1;
      return a.eta < b.eta ? -1 : 1;
    }
    return a.buque.localeCompare(b.buque, "es");
  });
}

async function consultarFuentes(): Promise<ListadoBuques> {
  const resultados = await Promise.all(
    FUENTES.map(async (f) => {
      try {
        return await f();
      } catch (e) {
        // Red de seguridad: un adaptador nunca debería tirar, pero si lo hace
        // no puede voltear al resto.
        const msg = e instanceof Error ? e.message : "error desconocido";
        return {
          id: "desconocida",
          nombre: "Fuente no identificada",
          url: "",
          puertos: [],
          alcance: "",
          arribos: [],
          actualizado: null,
          error: msg,
        } satisfies ResultadoFuente;
      }
    }),
  );

  return {
    arribos: ordenar(resultados.flatMap((r) => r.arribos)),
    fuentes: resultados,
    consultado: new Date().toISOString(),
  };
}

/** Consulta las fuentes y reescribe el archivo. Lo llama la tarea programada. */
export async function refrescarBuques(): Promise<ListadoBuques> {
  const dato = await consultarFuentes();
  // Si ninguna fuente respondió, dejamos la foto anterior: un lineup viejo y
  // fechado es más útil que una tabla vacía.
  if (dato.arribos.length) await escribirSnapshot(SNAPSHOT, dato);
  return dato;
}

/**
 * Lineup consolidado para las páginas: sale del archivo en disco.
 * Con `forzar` se consultan las fuentes en vivo (botón "Actualizar").
 */
export async function listarBuques(forzar = false): Promise<ListadoBuques> {
  if (forzar) return refrescarBuques();

  const snap = await leerSnapshot<ListadoBuques>(SNAPSHOT);
  if (snap) return snap.dato;

  if (enVuelo) return enVuelo;
  const trabajo = refrescarBuques().finally(() => {
    enVuelo = null;
  });
  enVuelo = trabajo;
  return trabajo;
}

export type { Arribo, ListadoBuques, ResultadoFuente };
