import "server-only";

/**
 * Un freno simple para lo que queda abierto sin cuenta.
 *
 * Las dos rutas públicas —noticias y nomenclador— leen datos que ya son
 * públicos, así que no hay nada que filtrar. Lo que sí hay es trabajo: cada
 * consulta al nomenclador abre parquet y cruza tablas. Sin un tope, un bot en
 * bucle deja al servidor haciéndole lugar a nadie.
 *
 * Es por proceso y en memoria a propósito. Un contador en la base agregaría
 * escrituras a cada visita para resolver un problema que todavía no tenemos, y
 * si el servidor se reinicia y alguien recupera su cupo, no pasa nada: el tope
 * está para frenar un bucle, no para cobrar.
 */

type Ventana = { hasta: number; usos: number };

const ventanas = new Map<string, Ventana>();

/** Cada cuánto se vacía el contador. */
const VENTANA_MS = 60_000;

/**
 * ¿Puede pasar esta visita?
 *
 * `clave` separa los contadores por ruta, para que gastar el nomenclador no
 * deje sin noticias a la misma persona.
 */
export function dentroDelLimite(ip: string, clave: string, maxPorMinuto: number): boolean {
  const ahora = Date.now();
  const k = `${clave}:${ip}`;
  const v = ventanas.get(k);

  if (!v || v.hasta <= ahora) {
    ventanas.set(k, { hasta: ahora + VENTANA_MS, usos: 1 });
    // Barrido oportunista: sin esto el mapa crece con cada IP que pasó una vez.
    if (ventanas.size > 5_000) {
      for (const [otra, w] of ventanas) if (w.hasta <= ahora) ventanas.delete(otra);
    }
    return true;
  }

  v.usos += 1;
  return v.usos <= maxPorMinuto;
}

/**
 * De dónde viene la visita.
 *
 * Detrás de Cloudflare, `x-forwarded-for` trae la cadena y la primera es la
 * real. Sin encabezado se agrupa todo bajo una clave sola: es peor freno, pero
 * es preferible a no tener ninguno.
 */
export function ipDe(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "sin-ip";
}
