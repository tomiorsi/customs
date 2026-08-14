import "server-only";

import { consultarNtl } from "@/lib/buques/fuente-ntl";
import { consultarZarate } from "@/lib/buques/fuente-zarate";
import { consultarBahiaBlanca } from "@/lib/buques/fuente-bahia-blanca";
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

/** Los lineups se actualizan varias veces por día; no tiene sentido pegarles por request. */
const TTL_MS = 15 * 60 * 1000;

let cache: { dato: ListadoBuques; expira: number } | null = null;
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

/**
 * Lineup consolidado. Con `forzar` se saltea el caché (botón "Actualizar").
 */
export async function listarBuques(forzar = false): Promise<ListadoBuques> {
  const ahora = Date.now();
  if (!forzar && cache && cache.expira > ahora) return cache.dato;
  if (!forzar && enVuelo) return enVuelo;

  const trabajo = consultarFuentes()
    .then((dato) => {
      cache = { dato, expira: Date.now() + TTL_MS };
      return dato;
    })
    .finally(() => {
      enVuelo = null;
    });

  enVuelo = trabajo;
  return trabajo;
}

export type { Arribo, ListadoBuques, ResultadoFuente };
