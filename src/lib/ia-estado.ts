import "server-only";

/**
 * Registro EN MEMORIA del análisis de IA en curso por operación. Como la app
 * corre en un único proceso Node de larga duración, alcanza con un mapa en
 * memoria para saber si una operación tiene análisis de fondo corriendo y cuándo
 * terminó el último. No se persiste: si el server reinicia, simplemente arranca
 * "sin análisis en curso" (lo cual es correcto: no hay trabajo de fondo vivo).
 *
 * Cada unidad de trabajo (análisis de un documento, validación de un paso) marca
 * un TOKEN al empezar y lo libera al terminar. La operación está "analizando"
 * mientras tenga al menos un token activo.
 */
type EstadoOp = {
  activos: Set<string>;
  /** ISO del momento en que se vació la lista de activos (último fin). */
  ultimoFin: string | null;
};

const registro = new Map<string, EstadoOp>();

function get(operationId: string): EstadoOp {
  let e = registro.get(operationId);
  if (!e) {
    e = { activos: new Set(), ultimoFin: null };
    registro.set(operationId, e);
  }
  return e;
}

/** Marca el inicio de una unidad de análisis. `token` permite que reintentos del
 * mismo trabajo no se cuenten dos veces (Set deduplica). */
export function iaInicio(operationId: string, token: string): void {
  get(operationId).activos.add(token);
}

/** Marca el fin de una unidad de análisis. Si no queda ninguna activa, registra
 * el momento como "último fin". */
export function iaFin(operationId: string, token: string): void {
  const e = registro.get(operationId);
  if (!e) return;
  e.activos.delete(token);
  if (e.activos.size === 0) e.ultimoFin = new Date().toISOString();
}

export type IaEstado = {
  analizando: boolean;
  activos: number;
  ultimoFin: string | null;
};

/** Estado actual del análisis de IA de una operación. */
export function iaEstado(operationId: string): IaEstado {
  const e = registro.get(operationId);
  if (!e) return { analizando: false, activos: 0, ultimoFin: null };
  return {
    analizando: e.activos.size > 0,
    activos: e.activos.size,
    ultimoFin: e.ultimoFin,
  };
}
