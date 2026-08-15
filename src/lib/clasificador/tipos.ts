/** Tipos compartidos del clasificador (importables desde cliente y servidor). */

export type Decision = "DIRECTO" | "NEEDS_AI" | "SIN_RESULTADO";

export type CandidatoNcm = {
  codigo: string;
  descripcion: string;
  di: number;
  /** Ruta jerárquica completa (contexto para clasificar con precisión). */
  ruta?: string;
};

/** NCM evaluada en Fase B (cruce) y descartada frente a la posición elegida. */
export type PosicionEnMira = {
  ncm: string;
  descripcion: string;
  /** Motivo legal breve por el que no se eligió esta línea. */
  motivo?: string;
  di?: number;
};

/** Desenlace planificado al elegir una opción (fase partida o posición). */
export type OpcionRuta = {
  opcion: string;
  /** Consecuencia: `partida:` | `partidas:` | `ncm:` | `descartar:` | `seguir` */
  consecuencia: string;
};

/** Pregunta para precisar la clasificación, con opciones para elegir (no escribir). */
export type Pregunta = {
  /** Id dentro del plan de Fase 1 (árbol de preguntas). */
  id?: string;
  pregunta: string;
  opciones: string[];
  /** Plan por opción — `pregunta:id` siguiente | `listo` cuando alcanza. */
  rutas?: OpcionRuta[];
  /** Si true, el usuario puede responder con texto libre (la IA lo interpreta). */
  permiteTextoLibre?: boolean;
  etiquetaTextoLibre?: string;
  /** Máximo de opciones mostradas como botones (el resto solo por texto libre). */
  maxOpcionesBotones?: number;
};

/** Respuesta del usuario a una pregunta (la opción elegida). */
export type Respuesta = {
  pregunta: string;
  opcion: string;
  /** Consecuencia planificada de la opción elegida (si venía en rutas[]). */
  consecuencia?: string;
};

/** Busca la consecuencia planificada para una opción (cliente y servidor). */
export function consecuenciaParaOpcion(p: Pregunta, opcion: string): string | undefined {
  const n = (s: string) => (s ?? "").trim().toLowerCase();
  const op = n(opcion);
  if (!op) return undefined;
  return p.rutas?.find((r) => n(r.opcion) === op)?.consecuencia;
}

/** Contexto opcional de la operación (bien padre, equipo ya clasificado, etc.). */
export type ContextoClasificacion = {
  /** NCM ya confirmada del bien padre o equipo en la misma operación, si existe. */
  ncmMaquina?: string;
  /** Descripción del bien padre, equipo o mercadería de la operación. */
  equipoReferencia?: string;
  /** Partidas ya probadas sin encaje en parquet (memoria del loop). */
  partidasDescartadas?: string[];
  /** Partida cuya posición se estaba afinando (reintentar parquet tras nueva respuesta). */
  partidaEnPrueba?: string;
  /** Hipótesis del parquet pendiente de NCM padre o cruce legal. */
  hipotesisNcm?: string;
  hipotesisPartida?: string;
  /** Partidas paralelas en evaluación (Fase A → cruce RGI 3 en Fase B). */
  partidasEnJuego?: string[];
};

/** Partida que el motor puso a consideración, elegida o no. */
export type PartidaEvaluada = {
  partida: string;
  descripcion: string;
  /** True en la que quedó seleccionada. */
  elegida?: boolean;
};

/** Subdivisión de 6 dígitos dentro de una partida. */
export type SubpartidaNcm = { codigo: string; descripcion: string };

/** Sufijo de valor: detalle que la aduana pide declarar además del código. */
export type SufijoNcm = { sufijo: string; tipo: string; descripcion: string };

/** Nota legal de sección o capítulo: decide inclusiones y exclusiones. */
export type NotaNcm = {
  tipo: string;
  referencia: string;
  titulo: string;
  texto: string;
};

/** Hipótesis mientras hay preguntas pendientes (no es la posición final). */
export type NcmProvisional = {
  ncm?: string;
  partida?: string;
  partidaDesc?: string;
  descripcion?: string;
  justificacion?: string;
  /** Derecho estimado (%). */
  derecho?: number;
};

export type ClasificacionResultado = {
  producto: string;
  /** "local" = resuelto sin IA; "ia" = definió el modelo. */
  via: "local" | "ia";
  decision: Decision;
  /** Posición NCM definitiva (solo cuando terminó el flujo de preguntas). */
  ncm?: string;
  /** Hipótesis actual mientras `preguntas` tiene ítems. */
  provisional?: NcmProvisional;
  /** Partida de 4 dígitos. */
  partida?: string;
  partidaDesc?: string;
  /** Descripción de la posición elegida. */
  descripcion?: string;
  /** Derecho de importación (%). */
  derecho?: number;
  /** IVA estimado (%). */
  iva?: number;
  ivaEstimado?: boolean;
  justificacion?: string;
  /** Preguntas (con opciones) para precisar la clasificación. */
  preguntas?: Pregunta[];
  /** Plan completo de Fase 1 (hasta 5); el cliente recorre el árbol sin replanificar. */
  planPreguntas?: Pregunta[];
  /**
   * partida = aún no se fijó el capítulo (4 dígitos); posicion = partida en curso,
   * afinando subpartida dentro del parquet.
   */
  fasePregunta?: "partida" | "posicion";
  /** Aranceles posibles dentro de la partida (contexto). */
  aranceles?: number[];
  alternativas?: CandidatoNcm[];
  /** Otras NCM evaluadas en el cruce legal y descartadas (2+ propuestas en Fase B). */
  posicionesEnMira?: PosicionEnMira[];
  /**
   * Todas las partidas que el motor puso a consideración, con su encabezado.
   * Si la elegida no es la correcta, la buena suele estar acá.
   */
  partidasEvaluadas?: PartidaEvaluada[];
  /** Subdivisiones de 6 dígitos de la partida resuelta (o de la hipótesis). */
  subpartidas?: SubpartidaNcm[];
  /** Unidad estadística en la que se declara la cantidad. */
  unidad?: string | null;
  /** Sufijos de valor de la posición, si el Arancel los pide. */
  sufijos?: SufijoNcm[];
  /** Notas de sección y capítulo que gobiernan la posición. */
  notas?: NotaNcm[];
  /** Partidas probadas sin encaje; el cliente debe reenviarlas en la siguiente consulta. */
  partidasDescartadas?: string[];
  /** Partida en prueba en el árbol; reenviar tras responder. */
  partidaEnPrueba?: string;
  hipotesisNcm?: string;
  hipotesisPartida?: string;
  /** Partidas en evaluación paralela; reenviar hasta cerrar Fase B. */
  partidasEnJuego?: string[];
};
