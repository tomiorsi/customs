/**
 * Guía para VALIDAR los certificados de intervención que presenta el cliente.
 *
 * Importante: QUÉ organismos intervienen sale de VUCE por NCM (ver requisitos.ts);
 * acá solo damos el criterio CONSERVADOR para validar el documento, sin inventar
 * requisitos de contenido por organismo. Detalle en
 * docs/intervenciones-certificados.md.
 */

/** Bloque de contexto determinístico para la IA sobre certificados de intervención. */
export function contextoIntervencionesValidacionIA(): string {
  return (
    "VALIDACIÓN DE CERTIFICADOS DE INTERVENCIÓN: qué organismos intervienen surge " +
    "SOLO del listado oficial de VUCE que te paso (no inventes organismos ni " +
    "regímenes). Para validar el certificado/documento que haya, controlá únicamente " +
    "lo objetivo: (1) que corresponda al producto/NCM de la operación; (2) que esté " +
    "emitido por o dirigido al organismo que figura en ese listado; (3) que esté " +
    "vigente si muestra fecha de validez; (4) que nombre al importador cuando " +
    "corresponda. NO asumas de memoria requisitos de contenido específicos de cada " +
    "organismo: si no podés confirmar con certeza que un certificado cumple lo que " +
    "pide un organismo, dejalo como 'a verificar por el despachante', no como " +
    "faltante ni como cumplido. Aplicá DOCUMENTOS PRIMERO, CONTEXTO DESPUÉS: el " +
    "listado oficial solo se cruza cuando los documentos leídos activan ese régimen."
  );
}
