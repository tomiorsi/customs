/**
 * Estados que ve el CLIENTE en su portal (versión simple del avance).
 * El detalle real lo maneja el operador con el workflow interno (ver workflow.ts).
 * Estos estados se derivan automáticamente de la etapa interna.
 */

export const ESTADO_RECIBIDA = "Recibida";
export const ESTADO_PREPARACION = "En preparación";
export const ESTADO_PRESENTADA = "Presentada en Aduana";
export const ESTADO_CANAL = "Canal asignado";
export const ESTADO_LIBERADA = "Liberada";
export const ESTADO_ENTREGADA = "Entregada";

export type EstadoDef = { value: string; label: string };

export const ESTADOS: EstadoDef[] = [
  { value: ESTADO_RECIBIDA, label: "Recibida" },
  { value: ESTADO_PREPARACION, label: "En preparación" },
  { value: ESTADO_PRESENTADA, label: "Presentada en Aduana" },
  { value: ESTADO_CANAL, label: "Canal asignado" },
  { value: ESTADO_LIBERADA, label: "Liberada" },
  { value: ESTADO_ENTREGADA, label: "Entregada" },
];

export const ESTADO_VALUES = ESTADOS.map((e) => e.value);

export function esEstadoValido(estado: string): boolean {
  return ESTADO_VALUES.includes(estado);
}

/** Índice del estado en el pipeline (0 si no se reconoce). */
export function estadoIndex(estado: string | null): number {
  const i = ESTADOS.findIndex((e) => e.value === estado);
  return i < 0 ? 0 : i;
}

/** Etiqueta corta del estado actual. */
export function estadoLabel(estado: string | null): string {
  return ESTADOS[estadoIndex(estado)].label;
}

/** Explicación, para el cliente, de qué está pasando en la etapa actual. */
export function estadoDescripcion(
  estado: string | null,
  esExpo: boolean,
): string {
  switch (estadoIndex(estado)) {
    case 0:
      return "Recibimos tu operación y la documentación inicial. Nuestro equipo está revisando la factura/proforma y los documentos: verificamos que los datos estén completos y consistentes y empezamos a definir la clasificación arancelaria (NCM) para tu despacho. Si nos falta algún documento o dato, te lo vamos a pedir por acá mismo. Cuando terminemos esta revisión, la operación pasa a \"En preparación\".";
    case 1:
      return esExpo
        ? "Ya te enviamos la cotización preliminar (te llegó por mail y también la tenés acá). Para seguir adelante con tu exportación, tu confirmación es simple: cuando los tengas, subí acá (o mandanos) la factura comercial definitiva y el packing list. Con esos documentos arrancamos: definimos la clasificación (NCM) y la liquidación de tributos. Si no querés avanzar con esta operación, podés eliminarla desde «Operaciones»."
        : "Ya te enviamos la cotización preliminar (te llegó por mail y también la tenés acá). Para seguir adelante con tu importación, tu confirmación es simple: cuando los tengas, subí acá (o mandanos) la factura comercial definitiva, el packing list y —cuando lo tengas— el documento de transporte. Con esos documentos arrancamos: definimos la clasificación (NCM), los permisos y la liquidación de tributos. Si no querés avanzar con esta operación, podés eliminarla desde «Operaciones».";
    case 2:
      return esExpo
        ? "Presentamos el permiso de embarque ante la Aduana. A la espera de la asignación del canal de control."
        : "Presentamos (oficializamos) la declaración ante la Aduana. A la espera de la asignación del canal de control.";
    case 3:
      return "La Aduana asignó el canal de control. Avanzamos con la verificación que corresponda para liberar la mercadería.";
    case 4:
      return esExpo
        ? "El embarque fue autorizado: la mercadería está lista para salir del país. Coordinamos el embarque."
        : "La Aduana liberó la mercadería. Coordinamos el retiro de la terminal / depósito y el transporte a destino.";
    case 5:
      return esExpo
        ? "Exportación finalizada. Queda disponible toda la documentación y, si corresponde, la liquidación de divisas."
        : "Operación finalizada: mercadería entregada. Queda disponible toda la documentación del despacho.";
    default:
      return "";
  }
}
