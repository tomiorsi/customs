/**
 * Retiro del documento de transporte y primer pago de logística en destino.
 * La guía y el checklist de la etapa 3 se adaptan según vía, forma de pago y
 * tipo de liberación (original / telex). Ver docs/retiro-bl-logistica.md.
 */

import {
  formaPagoMeta,
  type FormaPagoMeta,
} from "./cotizador";
import type { SubTarea } from "./workflow";

export type RetiroOpts = {
  via?: string | null;
  formaPago?: string | null;
  liberacion?: string | null;
};

function esViaMaritima(via?: string | null): boolean {
  const v = (via ?? "").toLowerCase();
  return v === "" || v.startsWith("mar");
}

function esAerea(via?: string | null): boolean {
  return (via ?? "").toLowerCase().startsWith("aer");
}

function esTerrestre(via?: string | null): boolean {
  return (via ?? "").toLowerCase().startsWith("terr");
}

function docTransporte(via?: string | null): string {
  if (esAerea(via)) return "AWB";
  if (esTerrestre(via)) return "CRT";
  return "BL";
}

/** ¿El BL viaja como original a canjear? */
export function blEsOriginal(
  liberacion: string | null | undefined,
  fp: FormaPagoMeta,
): boolean {
  const l = (liberacion ?? "").toLowerCase();
  if (l.includes("telex") || l.includes("waybill")) return false;
  if (l.includes("original")) return true;
  return fp.blOriginal;
}

/**
 * Texto para inyectar en prompts de IA (Paso 2 y 3): cómo se libera la carga
 * según vía y forma de pago.
 */
export function contextoRetiroTransporteIA(
  via?: string | null,
  formaPago?: string | null,
): string {
  const fp = formaPagoMeta(formaPago, via);
  const doc = docTransporte(via);
  const mar = esViaMaritima(via);
  const aer = esAerea(via);
  const terr = esTerrestre(via);

  let bloque =
    "RETIRO DEL TRANSPORTE Y PAGOS EN LA OPERACIÓN:\n" +
    "- Hay TRES pagos distintos en la operación: (1) MERCADERÍA al proveedor (lo " +
    "paga el CLIENTE entre ellos; el despachante NO avisa ni gestiona ese pago); " +
    "(2) LOGÍSTICA en destino (el cliente paga al estudio); (3) TRIBUTOS por VEP " +
    "(el cliente paga directo a AFIP).\n" +
    "- Los TRIBUTOS (VEP) van en liquidación. El pago de LOGÍSTICA en destino es " +
    "obligatorio (handling, orden de entrega, terminal, depósito fiscal).\n";

  if (mar) {
    bloque +=
      "- MARÍTIMO (BL): el aviso de arribo / factura de gastos de la naviera suele " +
      "ser el PRIMER cobro operativo en destino para liberar el BL y obtener la " +
      "orden de entrega (handling, BL fee, delivery order, ISPS, terminal). " +
      "EXCEPCIONES que van ANTES: (1) cobranza D/P o carta de crédito → primero " +
      "levantar documentos en el BANCO; (2) BL original negociable → debe estar " +
      "el original físico o telex release del shipper. La carta de garantía " +
      "(anual o puntual) es DOCUMENTAL para retirar el contenedor, no un pago.\n";
  } else if (aer) {
    bloque +=
      "- AÉREO (AWB): documento NO negociable. Con el aviso de llegada se pagan " +
      "gastos del agente y depósito fiscal aeroportuario; ahí se libera la carga. " +
      "Si hay cobranza o L/C con AWB consignada al banco, primero carta de " +
      "liberación bancaria.\n";
  } else if (terr) {
    bloque +=
      "- TERRESTRE (CRT + MIC/DTA): al arribo en frontera/destino se verifica " +
      "precinto y pesaje; se pagan gastos del agente/transportista y depósito " +
      "fiscal. El aviso puede ser la factura del transportista. COD es habitual: " +
      "el transportista retiene hasta cobrar.\n";
  } else {
    bloque +=
      "- Inferí la vía del BL/AWB/CRT o de la factura y aplicá las reglas " +
      "correspondientes (marítimo / aéreo / terrestre).\n";
  }

  bloque +=
    "- Extraé de factura, pedido o BL: 'forma_pago' (condición comercial: " +
    "anticipado, cuenta abierta, cobranza D/P, cobranza D/A, carta de crédito, " +
    "COD) y 'liberacion_doc' (original / telex / waybill). Si cambian el paso " +
    "a paso del retiro, agregá UNA alerta nivel 'ok' explicando la secuencia " +
    "correcta para esta operación.\n";

  if (fp.categoria !== "desconocido") {
    bloque += `- Forma de pago detectada/configurada: ${fp.label}. ${fp.momentoBl}\n`;
    if (fp.nota) bloque += `  ${fp.nota}\n`;
  }

  return bloque;
}

/** Guía de la etapa 3 según vía y forma de pago. */
export function guiaEmbarqueImportacion(
  opts: RetiroOpts,
  fp: FormaPagoMeta,
): string {
  const doc = docTransporte(opts.via);
  const mar = esViaMaritima(opts.via);
  const aer = esAerea(opts.via);
  const terr = esTerrestre(opts.via);
  const original = mar && blEsOriginal(opts.liberacion, fp);

  if (aer) {
    return (
      "El documento es la GUÍA AÉREA (AWB), no negociable: la carga se libera al " +
      "consignatario con el aviso de llegada (no hay canje de original). Con el " +
      "aviso se pagan los gastos del agente y el depósito fiscal aeroportuario: " +
      "ese es el momento de cobrarle al cliente el pago de la logística (los " +
      "tributos los paga aparte por VEP). " +
      (fp.liberaBanco
        ? `ATENCIÓN (${fp.label}): primero carta de liberación del banco; después aviso y cobro de logística. `
        : "") +
      (fp.categoria !== "desconocido" ? `Pago (${fp.label}): ${fp.momentoBl}` : "")
    );
  }

  if (terr) {
    return (
      "En terrestre (ATIT) el documento es el CRT (carta de porte), no negociable, " +
      "y el tránsito se ampara con el MIC/DTA electrónico (SINTIA). Al arribo: " +
      "verificá precinto íntegro y pesaje del camión. Con el arribo se pagan " +
      "gastos del agente y depósito fiscal: cobrá la logística al cliente (tributos " +
      "aparte por VEP). " +
      (fp.categoria === "cod"
        ? "COD: el transportista puede retener la carga hasta cobrar el valor de la mercadería. "
        : "") +
      (fp.liberaBanco
        ? `ATENCIÓN (${fp.label}): verificá liberación bancaria antes del retiro en frontera. `
        : "") +
      (fp.categoria !== "desconocido" ? `Pago (${fp.label}): ${fp.momentoBl}` : "")
    );
  }

  // Marítimo (default)
  let guia =
    "Cuando llega el BL, la IA detecta contenedor (ISO 6346) y recalcula logística. ";

  if (fp.liberaBanco || original) {
    guia +=
      `Con ${fp.label}${original ? " y BL original" : ""}, primero gestioná la ` +
      "liberación bancaria / recepción del BL original; recién después el aviso " +
      "de arribo y el cobro de logística habilitan la orden de entrega. ";
  } else {
    guia +=
      "Con el aviso de arribo llega la factura de gastos (handling, orden de " +
      "entrega, ISPS): ahí cobrás la logística al cliente y pagás la liberación " +
      "del BL. ";
  }

  guia +=
    "Los tributos los paga aparte por VEP (liquidación). Para retirar el " +
    "contenedor: carta de compromiso y garantía ante escribano (anual o puntual; " +
    "requisito documental, no depósito en efectivo).";

  if (fp.categoria !== "desconocido") {
    guia += ` Pago (${fp.label}): ${fp.momentoBl}`;
  }
  return guia;
}

/** Etiqueta del paso de logística en destino (checklist etapa 3). */
export function labelPagoLogistica(fp: FormaPagoMeta): string {
  if (fp.liberaBanco) {
    return "Logística en destino pagada (después de liberar en el banco)";
  }
  return "Logística en destino pagada";
}

/**
 * Prioridad de subtareas en etapa embarque (importación): menor = más arriba.
 * Asegura que banco/BL original vayan antes del aviso cuando corresponde.
 */
const PRIORIDAD_BASE: Record<string, number> = {
  origen_retiro: 5,
  origen_export: 6,
  origen_transporte: 7,
  consignacion_banco: 15,
  transporte: 20,
  transbordo: 25,
  mic_dta: 28,
  contenedor: 30,
  precinto: 32,
  pesaje: 34,
  bl_original: 45,
  banco_docs: 50,
  cod_pago: 55,
  aviso_arribo: 70,
  adelanto: 80,
  carta_garantia: 85,
  bl_liberado: 90,
};

export function ordenarSubtareasEmbarque(subtareas: SubTarea[]): SubTarea[] {
  return [...subtareas].sort(
    (a, b) =>
      (PRIORIDAD_BASE[a.id] ?? 60) - (PRIORIDAD_BASE[b.id] ?? 60),
  );
}

/** Alerta determinística cuando se aplicó forma de pago / liberación desde documentos. */
export function alertaFlujoRetiro(
  opts: RetiroOpts,
  fp: FormaPagoMeta,
): string | null {
  if (fp.categoria === "desconocido" && !opts.liberacion) return null;

  const doc = docTransporte(opts.via);
  const mar = esViaMaritima(opts.via);
  const parts: string[] = [];

  if (fp.categoria !== "desconocido") {
    parts.push(`Forma de pago: ${fp.label}`);
  }
  if (opts.liberacion?.trim()) {
    parts.push(`Liberación ${doc}: ${opts.liberacion.trim()}`);
  }

  if (mar && fp.liberaBanco) {
    parts.push(
      "Secuencia: levantar documentos en el banco → aviso de arribo → cobro de logística → orden de entrega",
    );
  } else if (mar) {
    parts.push(
      "Secuencia: aviso de arribo → cobro de logística → orden de entrega → carta de garantía (si FCL)",
    );
  } else if (esAerea(opts.via)) {
    parts.push(
      fp.liberaBanco
        ? "Secuencia: liberación bancaria → aviso de llegada → cobro de logística"
        : "Secuencia: aviso de llegada → cobro de logística → retiro en depósito fiscal",
    );
  } else if (esTerrestre(opts.via)) {
    parts.push(
      "Secuencia: arribo (precinto/pesaje) → cobro de logística → liberación CRT en frontera",
    );
  }

  return parts.length ? `Flujo de retiro actualizado: ${parts.join(" · ")}.` : null;
}
