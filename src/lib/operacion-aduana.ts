import type { DocType } from "@/lib/docs";

/** Operación de exportación (desde Argentina hacia el exterior). */
export function esOperacionExportacion(tipo: string | null | undefined): boolean {
  return Boolean(tipo?.trim().toLowerCase().startsWith("exp"));
}

/** Destino aduanero por defecto en importaciones gestionadas en la plataforma. */
export const DESTINO_IMPORTACION = "Argentina" as const;

/** Tipos donde tiene sentido fijar el destino aduanero de la operación. */
export function documentoLlevaDestinoOperacion(tipo: DocType): boolean {
  switch (tipo) {
    case "packing_list":
    case "factura_gastos":
    case "catalogo":
    case "cotizacion_forwarder":
    case "seguro":
    case "remito":
    case "otro":
      return false;
    default:
      return true;
  }
}

/** Bloque para prompts de IA (interpretación, cruce, hallazgos). */
export function contextoDestinoImportacionIA(
  tipo: string | null | undefined,
  paisDestinoOp?: string | null,
): string | null {
  if (esOperacionExportacion(tipo)) return null;
  const dest = paisDestinoOp?.trim() || DESTINO_IMPORTACION;
  return (
    `MARCO OPERATIVO — IMPORTACIÓN: destino aduanero ${dest}. ` +
    "En importación el país destino de la operación es Argentina; no confundas hub logístico " +
    "(Miami, forward, c/o) ni dirección del exportador con destino aduanero. " +
    "origen.pais_destino = Argentina salvo exportación."
  );
}
