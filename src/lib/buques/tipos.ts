/**
 * Modelo unificado de arribos de buques a puertos argentinos.
 *
 * Cada fuente publica su lineup con columnas propias (una terminal de
 * contenedores informa ETA y viaje; una autoridad portuaria informa producto,
 * toneladas y último puerto). El tipo `Arribo` es el mínimo común denominador:
 * lo que no publica la fuente queda en `null`, nunca se completa por inferencia.
 */

/** Qué va a hacer el buque en el puerto, según lo declara la fuente. */
export type OperacionBuque =
  | "carga"
  | "descarga"
  | "carga_descarga"
  | "bunker"
  | "desconocida";

/** Momento del arribo dentro del ciclo operativo de la terminal. */
export type EstadoBuque =
  | "esperado"
  | "arribado"
  | "operando"
  | "finalizado"
  | "cancelado"
  | "desconocido";

export type Arribo = {
  /** Estable por fuente + registro; sirve de key de React y de deduplicación. */
  id: string;
  /** Nombre del buque, sin el número de viaje. */
  buque: string;
  /** Número de viaje, cuando la fuente lo publica pegado al nombre. */
  viaje: string | null;
  /** Texto original publicado por la fuente (es lo que se busca). */
  etiqueta: string;
  terminal: string | null;
  puerto: string;
  /** ETA normalizada a ISO (YYYY-MM-DD) para ordenar y comparar. */
  eta: string | null;
  /** Hora del ETA ("HH:MM"), cuando la fuente la publica. */
  etaHora: string | null;
  /** Salida estimada, ISO. */
  etd: string | null;
  /**
   * Cut-off de consolidación para exportación, tal como lo publica la terminal.
   * Es una fecha límite: se muestra con hora porque perderla por una hora
   * deja la carga afuera del buque.
   */
  cutoff: string | null;
  /** Fecha límite de permanencia / forzoso, si la fuente la publica. */
  forzoso: string | null;
  estado: EstadoBuque;
  operacion: OperacionBuque;
  /** Línea marítima (naviera) que opera el servicio. */
  linea: string | null;
  /** Tipo de carga que mueve la escala ("Contenedores", "Autos", "Carga General"). */
  tipoCarga: string | null;
  producto: string | null;
  toneladas: number | null;
  bandera: string | null;
  eslora: number | null;
  /** Agencia marítima (código o nombre, según la fuente). */
  agencia: string | null;
  destino: string | null;
  ultimoPuerto: string | null;
  sitio: string | null;
  fuenteId: string;
  /** shipid de MarineTraffic, solo si la fuente lo trae. */
  marineTrafficId: number | null;
};

/** Resultado de consultar una fuente: sus arribos o el motivo del fallo. */
export type ResultadoFuente = {
  id: string;
  nombre: string;
  url: string;
  puertos: string[];
  /** Qué publica realmente esta fuente (se muestra al operador). */
  alcance: string;
  arribos: Arribo[];
  /** Última actualización declarada por la fuente, si la informa. */
  actualizado: string | null;
  error: string | null;
};

export type ListadoBuques = {
  arribos: Arribo[];
  fuentes: ResultadoFuente[];
  /** Momento en que se consultaron las fuentes (ISO completo). */
  consultado: string;
};

export const ETIQUETA_ESTADO: Record<EstadoBuque, string> = {
  esperado: "Esperado",
  arribado: "Arribado",
  operando: "Operando",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
  desconocido: "Sin estado",
};

export const ETIQUETA_OPERACION: Record<OperacionBuque, string> = {
  carga: "Carga",
  descarga: "Descarga",
  carga_descarga: "Carga y descarga",
  bunker: "Bunker",
  desconocida: "Sin dato",
};

/** Clave de búsqueda: sin acentos, mayúsculas y espacios colapsados. */
export function normalizarBusqueda(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Separa "MAERSK LA PAZ 626S" en nombre + viaje.
 * Solo corta un token final numérico (con sufijo opcional de rotación tipo
 * 626S / 44N / 017W). Si no matchea, el nombre queda entero: preferimos no
 * cortar antes que inventar un viaje.
 */
export function separarViaje(raw: string): { buque: string; viaje: string | null } {
  const limpio = raw.replace(/\s+/g, " ").trim();
  const m = limpio.match(/^(.*\S)\s+(\d{2,5}[A-Z]{0,2})$/);
  if (!m) return { buque: limpio, viaje: null };
  return { buque: m[1], viaje: m[2] };
}

/* ───────────────────── Vigencia de una escala ─────────────────────
 * Vive acá y no en el componente porque la usan las dos capas: la tabla para
 * decidir qué muestra, y el almacenamiento para separar lo vivo de lo
 * histórico. Si cada una tuviera su criterio, el archivo y la pantalla dirían
 * cosas distintas.
 */

const TERMINADOS = new Set<EstadoBuque>(["finalizado", "cancelado"]);
const EN_PUERTO = new Set<EstadoBuque>(["arribado", "operando"]);

/**
 * Días que una escala puede seguir figurando "en puerto" antes de que dejemos
 * de creerle a la fuente.
 *
 * Una escala real dura horas, a lo sumo un par de días. Un buque que hace tres
 * semanas dice "operando" no está operando: la terminal publicó ese renglón y
 * nunca lo cerró. Sin este corte esos registros quedaban vigentes para siempre
 * y ensuciaban la lista de lo que de verdad hay que atender.
 */
const DIAS_GRACIA_EN_PUERTO = 7;

function diasEntre(desdeIso: string, hastaIso: string): number {
  const a = Date.parse(`${desdeIso}T00:00:00Z`);
  const b = Date.parse(`${hastaIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * ¿Esta escala sigue importando? Es decir: ¿hay algo por hacer todavía?
 *
 * Vigente = el buque está en puerto ahora, o todavía no llegó. Lo terminado ya
 * operó; lo que quedó con ETA vencida sin cerrarse es un renglón que la fuente
 * nunca actualizó. En ninguno de los dos casos hay carga que despachar.
 */
export function sigueVigente(a: Arribo, hoy: string): boolean {
  if (TERMINADOS.has(a.estado)) return false;
  if (EN_PUERTO.has(a.estado)) {
    // En puerto sí, pero no eternamente: pasada la gracia es dato muerto.
    return !a.eta || diasEntre(a.eta, hoy) <= DIAS_GRACIA_EN_PUERTO;
  }
  return !a.eta || a.eta >= hoy;
}
