import "server-only";

import { consultarNtl } from "@/lib/buques/fuente-ntl";
import { consultarZarate } from "@/lib/buques/fuente-zarate";
import { consultarBahiaBlanca } from "@/lib/buques/fuente-bahia-blanca";
import { edadSnapshot, escribirSnapshot, leerSnapshot } from "@/lib/snapshot";
import {
  sigueVigente,
  type Arribo,
  type ListadoBuques,
  type ResultadoFuente,
} from "@/lib/buques/tipos";

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

/**
 * Dos archivos, no uno.
 *
 * VIVO guarda lo que todavía tiene algo por hacer y se reescribe entero en cada
 * consulta: es la foto de ahora, y sobrescribirla es justamente lo que la
 * mantiene al día.
 *
 * HISTÓRICO guarda lo que ya terminó. Existe porque las terminales BORRAN de su
 * lineup las escalas viejas: sin este archivo, una escala que se despachó la
 * semana pasada desaparecía del sistema el día que la terminal la sacaba, y con
 * ella el registro de cuándo llegó ese buque. Se acumula, pero acotado por
 * fecha y por cantidad, así que tampoco crece sin control.
 */
export const SNAPSHOT = "buques";
export const SNAPSHOT_HISTORICO = "buques-historico";

/**
 * Cuánto se guarda del histórico. Noventa días cubre con holgura cualquier
 * consulta hacia atrás sobre una operación en curso, y mil registros le pone un
 * techo duro al archivo: rondan 1 MB, que es lo que queríamos evitar que
 * creciera sin freno.
 */
const DIAS_HISTORICO = 90;
const MAX_HISTORICO = 1000;

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

/** Fecha ISO de hace `dias` días. */
function haceDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Suma las escalas que acaban de terminar al histórico y lo poda.
 *
 * Dedup por `id`, que es estable por fuente y registro: una escala que aparece
 * en varias consultas seguidas mientras se cierra no se duplica, y la versión
 * más nueva pisa a la vieja (los datos finales son mejores que los del
 * arribo).
 */
async function acumularHistorico(terminadas: Arribo[]): Promise<void> {
  const previo = await leerSnapshot<{ arribos: Arribo[] }>(SNAPSHOT_HISTORICO);
  const porId = new Map<string, Arribo>();
  for (const a of previo?.dato.arribos ?? []) porId.set(a.id, a);
  for (const a of terminadas) porId.set(a.id, a);

  const corte = haceDias(DIAS_HISTORICO);
  const arribos = [...porId.values()]
    // Sin ETA no hay con qué medir la antigüedad: se conserva.
    .filter((a) => !a.eta || a.eta >= corte)
    // Más nuevas primero, para que el recorte se coma las más viejas.
    .sort((x, y) => (y.eta ?? "").localeCompare(x.eta ?? ""))
    .slice(0, MAX_HISTORICO);

  await escribirSnapshot(SNAPSHOT_HISTORICO, { arribos });
}

/**
 * Consulta las fuentes y reescribe los dos archivos: el vivo con lo que sigue
 * en juego, el histórico con lo que ya terminó.
 */
export async function refrescarBuques(): Promise<ListadoBuques> {
  const dato = await consultarFuentes();
  // Si ninguna fuente respondió, dejamos la foto anterior: un lineup viejo y
  // fechado es más útil que una tabla vacía.
  if (!dato.arribos.length) return dato;

  const hoy = dato.consultado.slice(0, 10);
  const vivos = dato.arribos.filter((a) => sigueVigente(a, hoy));
  const terminadas = dato.arribos.filter((a) => !sigueVigente(a, hoy));

  await Promise.all([
    escribirSnapshot(SNAPSHOT, { ...dato, arribos: vivos }),
    acumularHistorico(terminadas),
  ]);

  return { ...dato, arribos: vivos };
}

/**
 * Escalas ya terminadas, de los últimos meses. Es lo que alimenta el botón
 * «Ver anteriores»: sale de su propio archivo, no de filtrar el vivo.
 */
export async function historicoBuques(): Promise<Arribo[]> {
  const snap = await leerSnapshot<{ arribos: Arribo[] }>(SNAPSHOT_HISTORICO);
  return snap?.dato.arribos ?? [];
}

/**
 * Cuánto vale la foto antes de volver a salir a las terminales.
 *
 * Una hora, que es lo que la pantalla le promete al usuario ("las consultamos
 * cada hora"). Las terminales republican su lineup varias veces por día y un
 * ETA movido cambia decisiones —turnos, free time, transporte—, así que una
 * foto de ayer no sirve.
 */
const MAX_EDAD_MS = 60 * 60 * 1000;

/**
 * Lineup consolidado para las páginas: sale del archivo en disco, salvo que
 * haya quedado viejo. Con `forzar` se consultan las fuentes en vivo (botón
 * "Actualizar").
 *
 * El chequeo de edad no es una optimización, es lo que hace que el dato se
 * actualice: sin él, el primer snapshot que se escribía quedaba servido para
 * siempre y la pantalla mostraba un lineup de hacía días bajo el cartel de "las
 * consultamos cada hora". No alcanza con delegarlo a una tarea programada —si
 * el timer no está puesto, o se cae, nadie se entera— así que el módulo se
 * refresca solo, igual que el boletín y las noticias.
 */
export async function listarBuques(forzar = false): Promise<ListadoBuques> {
  if (forzar) return refrescarBuques();

  const snap = await leerSnapshot<ListadoBuques>(SNAPSHOT);
  if (snap && edadSnapshot(snap.generado) < MAX_EDAD_MS) return snap.dato;

  if (!enVuelo) {
    enVuelo = refrescarBuques().finally(() => {
      enVuelo = null;
    });
  }
  const fresco = await enVuelo;

  // Si las terminales no respondieron, mostramos la foto anterior aunque esté
  // vencida: un lineup viejo y fechado sirve; una tabla vacía se lee como "no
  // hay buques", que es falso.
  if (!fresco.arribos.length && snap) return snap.dato;
  return fresco;
}

export type { Arribo, ListadoBuques, ResultadoFuente };
