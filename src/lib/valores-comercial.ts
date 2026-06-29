import "server-only";
import { OP_CAMPOS, updateOperationCampos } from "@/lib/data";
import type { DocumentacionIA } from "@/lib/ia-documentos";

/** Únicos campos que sobreviven al salir del Paso 1 (cotización provisional). */
export const CAMPOS_CONSERVADOS_PASO1 = ["ncm", "primera_vez"] as const;

/**
 * Todo lo demás que el Paso 1 pudo haber cargado (proforma, cotización forwarder,
 * overrides de logística, incoterm, valores comerciales, transporte, IA, etc.).
 */
export const CAMPOS_PROVISIONALES_PASO1 = OP_CAMPOS.filter(
  (c) => !(CAMPOS_CONSERVADOS_PASO1 as readonly string[]).includes(c),
);

/** Borra los datos provisionales del Paso 1. Solo conserva la NCM. */
export async function limpiarProvisionalPaso1(
  ownerId: string,
  operationId: string,
): Promise<void> {
  const campos: Record<string, null> = {};
  for (const c of CAMPOS_PROVISIONALES_PASO1) campos[c] = null;
  await updateOperationCampos(ownerId, operationId, campos);
}

/** Gastos de logística (Paso 3+): overrides y agregados, no valores comerciales. */
export const CAMPOS_LOGISTICA_PROVISIONAL = [
  "costos_override",
  "gastos_destino",
  "gastos_origen",
  "transporte_interno",
] as const;

/**
 * Borra gastos de logística al entrar al Paso 3 (embarque). Arrancan en cero:
 * se cargan a mano o al subir la factura/aviso del forwarder de esa etapa.
 */
export async function limpiarProvisionalLogistica(
  ownerId: string,
  operationId: string,
): Promise<void> {
  const campos: Record<string, null> = {};
  for (const c of CAMPOS_LOGISTICA_PROVISIONAL) campos[c] = null;
  await updateOperationCampos(ownerId, operationId, campos);
}

/** Texto de alerta cuando se detectaron montos comerciales en un documento. */
export function alertaValoresComercial(
  com: NonNullable<DocumentacionIA["comercial"]>,
  monedaFallback: string | null,
): string {
  const moneda = com.moneda ?? monedaFallback ?? "USD";
  const partes: string[] = [];
  if (com.valor_fob) partes.push(`FOB ${moneda} ${com.valor_fob}`);
  if (com.flete) partes.push(`flete ${moneda} ${com.flete}`);
  if (com.seguro) partes.push(`seguro ${moneda} ${com.seguro}`);
  if (com.valor_factura) partes.push(`total ${moneda} ${com.valor_factura}`);
  return (
    "Montos comerciales detectados en la documentación: " +
    (partes.length ? partes.join(", ") + ". " : "") +
    "Se guardaron los que figuraban (FOB/flete por separado si venían desglosados). Podés editarlos a mano si hace falta."
  );
}
