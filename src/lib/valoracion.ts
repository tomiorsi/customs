/**
 * Reglas operativas de valoración (complementan arts. VAL/CA del normas.parquet).
 *
 * Objetivo: evitar que la IA exija documentos o ajustes de valor que la norma NO
 * exige (típicamente, pedir una póliza de seguro como obligatoria cuando el
 * Incoterm no la incluye: corresponde el seguro ficto).
 */

/** Ajustes que se suman al valor (Art. 8) SÓLO si están documentados. */
export const AJUSTES_VALOR_ART8: string[] = [
  "Comisiones y corretajes, EXCEPTO las comisiones de compra.",
  "Envases y embalajes.",
  "Aportes del comprador (assists): materiales, herramientas, moldes, " +
    "ingeniería/diseño realizados fuera del país de importación.",
  "Cánones y regalías (royalties) que el comprador deba pagar como condición de venta.",
  "Producto de la reventa que revierta al vendedor.",
  "Flete, seguro y gastos conexos hasta el lugar de importación (para llegar al CIF).",
];

/** Bloque de contexto determinístico sobre valoración para la IA. */
export function contextoValoracionIA(): string {
  return (
    "VALORACIÓN ADUANERA (Acuerdo de Valor OMC, Art. VII GATT / Ley 24.425; " +
    "Código Aduanero Ley 22.415). La base imponible se arma en CIF (mercadería + " +
    "flete + seguro hasta el lugar de importación). Reglas para validar:\n" +
    "- SEGURO: la póliza/certificado de seguro NO es un documento obligatorio para " +
    "oficializar. Si el Incoterm NO incluye seguro (FOB, CFR, FCA, EXW…) y no hay " +
    "póliza, corresponde el SEGURO FICTO/teórico (estimación), NO un faltante. NO " +
    "pidas la póliza como requisito ni marques inconsistencia por su ausencia, salvo " +
    "que el Incoterm la implique (CIF/CIP) o el cliente la haya aportado.\n" +
    "- AJUSTES AL VALOR (Art. 8): sólo se suman si están RESPALDADOS por los " +
    "documentos (contrato, factura, acuerdo de licencia): " +
    AJUSTES_VALOR_ART8.join("; ") +
    ". Si sospechás un canon/assist/comisión pero no hay respaldo documental, dejalo " +
    "como observación 'a verificar por el despachante', no como dato cierto ni como " +
    "faltante.\n" +
    "- NO declares 'valor inconsistente' sólo porque la factura sea FOB/CFR y falte " +
    "el seguro: es normal y se resuelve con el ficto. Diferencias de redondeo menores " +
    "entre la factura y el certificado de origen no son inconsistencia."
  );
}
