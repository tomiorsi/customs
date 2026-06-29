import type { ClasificacionResultado } from "./tipos";

/**
 * Estado operativo del expediente de clasificación — lenguaje de despachante,
 * no score subjetivo.
 */
export type EstadoExpediente =
  | "sin_clasificar"
  | "consulta_pendiente"
  | "evaluando_partida"
  | "evaluando_posicion"
  | "posicion_cerrada";

/** Deriva el estado a partir del resultado del motor (determinístico). */
export function derivarEstadoExpediente(
  r: ClasificacionResultado,
): EstadoExpediente {
  if (r.decision === "SIN_RESULTADO") return "sin_clasificar";

  const hayPreguntas = (r.preguntas?.length ?? 0) > 0;
  const ncmCerrada = Boolean(r.ncm) && !hayPreguntas;

  if (ncmCerrada) return "posicion_cerrada";
  if (hayPreguntas) return "consulta_pendiente";
  if (r.fasePregunta === "partida") return "evaluando_partida";
  return "evaluando_posicion";
}

/** Etiqueta breve para UI. */
export function etiquetaEstado(estado: EstadoExpediente): string {
  switch (estado) {
    case "sin_clasificar":
      return "Sin posición";
    case "consulta_pendiente":
      return "Falta un dato";
    case "evaluando_partida":
      return "Partida en evaluación";
    case "evaluando_posicion":
      return "Posición orientativa";
    case "posicion_cerrada":
      return "Posición cerrada";
  }
}

/** Una línea de ayuda según estado (opcional en UI). */
export function ayudaEstado(estado: EstadoExpediente): string | undefined {
  switch (estado) {
    case "sin_clasificar":
      return "Ampliá la descripción del producto o el contexto del bien padre.";
    case "consulta_pendiente":
      return "Respondé para definir la partida o la línea NCM.";
    case "evaluando_partida":
      return "La partida puede cambiar al incorporar más datos.";
    case "evaluando_posicion":
      return "Hipótesis dentro de la partida — puede cambiar al responder.";
    case "posicion_cerrada":
      return undefined;
  }
}
