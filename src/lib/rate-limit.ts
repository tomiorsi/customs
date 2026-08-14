import "server-only";

/**
 * Límite de intentos por IP, en memoria.
 *
 * Alcanza porque la app corre en un solo proceso. Si algún día hay varias
 * instancias, esto hay que moverlo a la base o a Redis; mientras tanto, evita
 * que alguien pruebe contraseñas de a miles contra el login.
 */

type Registro = { fallos: number; hasta: number };

const registros = new Map<string, Registro>();

/** Cada tanto sacamos las entradas vencidas para que el Map no crezca solo. */
function limpiar(ahora: number) {
  if (registros.size < 500) return;
  for (const [k, v] of registros) {
    if (v.hasta <= ahora) registros.delete(k);
  }
}

/**
 * IP real del visitante. Detrás de Cloudflare y nginx, la del socket es la del
 * proxy: hay que leerla de los headers que ellos agregan.
 */
export function ipDeRequest(req: Request): string {
  const h = req.headers;
  const cf = h.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  // El último de la cadena es el que agregó nuestro nginx; los anteriores
  // los puede haber puesto el cliente y no son confiables.
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const partes = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    if (partes.length) return partes[partes.length - 1];
  }
  return "desconocida";
}

export type ResultadoLimite = {
  permitido: boolean;
  /** Segundos que faltan para poder reintentar. */
  esperaSegundos: number;
};

/**
 * ¿Puede intentar de nuevo? No cuenta el intento: solo consulta.
 */
export function puedeIntentar(clave: string, maxFallos: number): ResultadoLimite {
  const ahora = Date.now();
  limpiar(ahora);
  const reg = registros.get(clave);

  if (!reg || reg.hasta <= ahora) return { permitido: true, esperaSegundos: 0 };
  if (reg.fallos < maxFallos) return { permitido: true, esperaSegundos: 0 };

  return {
    permitido: false,
    esperaSegundos: Math.ceil((reg.hasta - ahora) / 1000),
  };
}

/** Suma un fallo y extiende la ventana. */
export function registrarFallo(clave: string, ventanaMs: number): void {
  const ahora = Date.now();
  const reg = registros.get(clave);
  if (!reg || reg.hasta <= ahora) {
    registros.set(clave, { fallos: 1, hasta: ahora + ventanaMs });
    return;
  }
  reg.fallos += 1;
  reg.hasta = ahora + ventanaMs;
}

/** Un acierto borra el historial: no queremos castigar a quien se equivocó y ya entró. */
export function limpiarIntentos(clave: string): void {
  registros.delete(clave);
}
