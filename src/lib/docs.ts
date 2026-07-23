/**
 * Tipos y reglas de documentación, compartidos entre servidor y cliente.
 * (No importa "server-only": se puede usar en componentes cliente.)
 */

import {
  acuerdoLabel,
  buscarPais,
  recomiendaCertificadoOrigen,
} from "./cotizador";

export type DocType =
  | "pedido_compra"
  | "factura_comercial"
  | "proforma"
  | "packing_list"
  | "transporte"
  | "transporte_borrador"
  | "certificado_origen"
  | "declaracion_transbordo"
  | "certificado_peso"
  | "liberacion_transporte"
  | "seguro"
  | "catalogo"
  | "despacho"
  | "cotizacion_forwarder"
  | "factura_gastos"
  | "remito"
  | "otro";

export const DOC_LABELS: Record<DocType, string> = {
  pedido_compra: "Pedido / Orden de compra",
  factura_comercial: "Factura comercial",
  proforma: "Factura proforma",
  packing_list: "Packing list",
  transporte: "Documento de transporte",
  transporte_borrador: "Documento de transporte (borrador)",
  certificado_origen: "Certificado de origen",
  declaracion_transbordo: "Declaración de transbordo / expedición directa",
  certificado_peso: "Certificado de peso",
  liberacion_transporte: "Liberación del transporte / orden de entrega",
  seguro: "Póliza de seguro",
  catalogo: "Catálogo / ficha técnica",
  despacho: "Despacho / documento de Aduana (SIM)",
  cotizacion_forwarder: "Cotización de flete / forwarder",
  factura_gastos: "Factura de gastos (naviera / terminal / forwarder)",
  remito: "Remito de entrega",
  otro: "Otro documento",
};

/**
 * Categorías para ORGANIZAR los documentos automáticamente en el panel
 * "Documentos". Cada documento que se sube cae en una categoría según su tipo;
 * los que no se reconocen quedan en "Otros". El orden refleja el avance real de
 * la carpeta (comercial → origen → transporte → aduana → entrega).
 */
export type DocCategoria =
  | "comercial"
  | "origen"
  | "transporte"
  | "aduana"
  | "gastos"
  | "otros";

export const DOC_CATEGORIA_LABEL: Record<DocCategoria, string> = {
  comercial: "Comercial",
  origen: "Origen e intervenciones",
  transporte: "Transporte",
  aduana: "Aduana",
  gastos: "Gastos y entrega",
  otros: "Otros",
};

/** Orden en que se muestran las categorías en el panel. */
export const DOC_CATEGORIAS_ORDEN: DocCategoria[] = [
  "comercial",
  "origen",
  "transporte",
  "aduana",
  "gastos",
  "otros",
];

/** A qué categoría pertenece cada tipo de documento. */
export const DOC_CATEGORIA_DE: Record<DocType, DocCategoria> = {
  pedido_compra: "comercial",
  proforma: "comercial",
  factura_comercial: "comercial",
  packing_list: "comercial",
  catalogo: "comercial",
  certificado_origen: "origen",
  declaracion_transbordo: "origen",
  transporte: "transporte",
  transporte_borrador: "transporte",
  certificado_peso: "transporte",
  liberacion_transporte: "transporte",
  seguro: "transporte",
  despacho: "aduana",
  cotizacion_forwarder: "gastos",
  factura_gastos: "gastos",
  remito: "gastos",
  otro: "otros",
};

/** Etapa del workflow donde típicamente aparece cada documento. */
export const DOC_ETAPA_DE: Record<DocType, string> = {
  pedido_compra: "apertura",
  proforma: "apertura",
  factura_comercial: "apertura",
  packing_list: "documentacion",
  catalogo: "apertura",
  certificado_origen: "documentacion",
  declaracion_transbordo: "embarque",
  certificado_peso: "embarque",
  transporte: "embarque",
  transporte_borrador: "embarque",
  liberacion_transporte: "embarque",
  seguro: "documentacion",
  despacho: "oficializacion",
  cotizacion_forwarder: "apertura",
  // Aviso/factura naviera: en importación se cobra en embarque (aviso de arribo);
  // en retiro puede repetirse el mismo doc para gastos de terminal.
  factura_gastos: "embarque",
  remito: "retiro",
  otro: "documentacion",
};

/**
 * Documentos que pertenecen a cada paso (1–3): subida individual, hallazgos
 * en mesa, validación cruzada e incremental. Una misma fuente puede figurar
 * en más de un paso (p. ej. CO en 2 y 3, packing en 2 y 3).
 */
export const ETAPAS_DOCS_IA = ["apertura", "documentacion", "embarque"] as const;
export type EtapaDocsIA = (typeof ETAPAS_DOCS_IA)[number];

export const DOCS_IA_POR_ETAPA: Record<EtapaDocsIA, DocType[]> = {
  apertura: [
    "proforma",
    "pedido_compra",
    "factura_comercial",
    "catalogo",
    "cotizacion_forwarder",
  ],
  documentacion: [
    "factura_comercial",
    "packing_list",
    "certificado_origen",
    "certificado_peso",
    "seguro",
  ],
  embarque: [
    "factura_comercial",
    "transporte",
    "transporte_borrador",
    "liberacion_transporte",
    "declaracion_transbordo",
    "packing_list",
    "certificado_peso",
    "certificado_origen",
    "factura_gastos",
  ],
};

/**
 * Paso 3: la validación IA no re-lee estos PDFs (ya analizados al subir).
 * Sus datos van por `extraccion_ia` en el contexto del prompt.
 */
export const DOCS_IA_EMBARQUE_SOLO_CONTEXTO: DocType[] = [
  "factura_comercial",
  "packing_list",
  "certificado_origen",
  "certificado_peso",
  "factura_gastos",
];

/**
 * Documentos que aportan campos reconciliables (cruce global, todas las etapas).
 * Fuente única: reconciliación, upload incremental y limpieza al borrar.
 */
export const DOCS_RECONCILIACION: DocType[] = [
  "pedido_compra",
  "proforma",
  "factura_comercial",
  "factura_gastos",
  "cotizacion_forwarder",
  "packing_list",
  "transporte",
  "transporte_borrador",
  "declaracion_transbordo",
  "certificado_peso",
  "certificado_origen",
  "seguro",
  "liberacion_transporte",
];

/** Documentos que aportan gastos de flete / forwarder. */
export const DOCS_COSTOS_FORWARDER: DocType[] = [
  "factura_gastos",
  "cotizacion_forwarder",
  "seguro",
];

/** Conjunto de tipos de documento que la IA analiza en una etapa dada. */
export function docsRelevantesIA(etapa: string): Set<DocType> {
  return new Set(DOCS_IA_POR_ETAPA[etapa as EtapaDocsIA] ?? []);
}

/** Pasos (1–3) a los que aplica un tipo de documento subido. */
export function etapasDocsIA(docType: DocType): EtapaDocsIA[] {
  return ETAPAS_DOCS_IA.filter((e) => docsRelevantesIA(e).has(docType));
}

/** Orden de envío a la IA dentro de una etapa (índice en DOCS_IA_POR_ETAPA). */
export function ordenDocEnEtapa(etapa: EtapaDocsIA, docType: DocType): number {
  const lista = DOCS_IA_POR_ETAPA[etapa];
  const i = lista.indexOf(docType);
  return i < 0 ? lista.length : i;
}

/**
 * Clasifica automáticamente un documento por su nombre de archivo. Sirve para
 * organizar lo que se sube como "otro" o por carga masiva, sin que el operador
 * tenga que elegir el tipo. Devuelve "otro" si no reconoce el patrón.
 */
export function clasificarPorNombre(fileName: string): DocType {
  // Sacamos la extensión y normalizamos (sin acentos, en minúsculas).
  const sinExt = fileName.replace(/\.[a-z0-9]+$/i, "");
  const s = sinExt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const tiene = (...palabras: string[]) => palabras.some((p) => s.includes(p));
  // Tokens sueltos (para siglas como BL, CO, AWB, CRT que vienen aisladas).
  const tokens = new Set(s.split(/[^a-z0-9]+/).filter(Boolean));
  const token = (...t: string[]) => t.some((x) => tokens.has(x));

  // El orden importa: lo más específico primero.
  if (
    tiene(
      "certificado de origen",
      "certificado origen",
      "cert origen",
      "certif origen",
      "co mercosur",
      "certificado de origen del mercosur",
    )
  )
    return "certificado_origen";
  if (tiene("certificado de peso", "certificado peso", "cert peso", "weight"))
    return "certificado_peso";
  if (
    tiene(
      "transbordo",
      "trasbordo",
      "transhipment",
      "transshipment",
      "expedicion directa",
      "expedicion directo",
      "declaracion de transbordo",
    )
  )
    return "declaracion_transbordo";
  if (tiene("liberacion", "release", "orden de entrega", "telex"))
    return "liberacion_transporte";
  if (
    tiene(
      "draft bl",
      "doc de transporte",
      "documento de transporte",
      "guia aerea",
      "conocimiento de embarque",
      "bill of lading",
    ) ||
    token("bl", "awb", "crt", "bol")
  ) {
    // Un BORRADOR/draft del documento de transporte se clasifica aparte: es una
    // copia preliminar para revisar datos, no el original válido.
    return tiene("draft", "borrador", "preliminar")
      ? "transporte_borrador"
      : "transporte";
  }
  if (tiene("packing", "lista de empaque", "lista de bultos"))
    return "packing_list";
  if (tiene("proforma", "peoforma", "pro forma"))
    return "proforma";
  if (tiene("despacho", "arca", "afip", "destinacion", "caratula", "malvina") || token("sim"))
    return "despacho";
  if (tiene("remito"))
    return "remito";
  if (
    tiene(
      "cotizacion",
      "quotation",
      "quote",
      "freight quote",
      "freight quotation",
      "tarifa forwarder",
      "cotizacion de flete",
      "cotizacion forwarder",
      "propuesta de transporte",
      "propuesta comercial",
    )
  )
    return "cotizacion_forwarder";
  if (
    tiene(
      "pago",
      "maersk",
      "naviera",
      "terminal",
      "forwarder",
      "factura de gastos",
      "aviso de llegada",
      "aviso llegada",
      "aviso de arribo",
      "aviso arribo",
      "arrival notice",
      "import invoice",
      "gastos",
    )
  )
    return "factura_gastos";
  if (tiene("poliza", "seguro", "insurance"))
    return "seguro";
  if (tiene("catalogo", "ficha tecnica", "datasheet", "data sheet"))
    return "catalogo";
  if (tiene("pedido", "orden de compra", "purchase order") || token("po", "oc"))
    return "pedido_compra";
  // Certificado de origen digital (p. ej. «… COD.pdf» en MERCOSUR).
  if (token("cod")) return "certificado_origen";
  // "factura" / "fatura" (PT) / "invoice" / documento comercial genérico.
  if (
    tiene(
      "factura",
      "fatura",
      "invoice",
      "documento comercial",
      "commercial invoice",
      "commercial document",
    )
  )
    return "factura_comercial";
  return "otro";
}

/** Pistas en el nombre del archivo que delatan un BORRADOR (sin valor legal). */
const PISTAS_BORRADOR = ["draft", "borrador", "preliminar", "sin valor"];

/** ¿El nombre del archivo sugiere que es un borrador/draft (no el definitivo)? */
export function pareceBorrador(fileName: string): boolean {
  const s = fileName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return PISTAS_BORRADOR.some((p) => s.includes(p));
}

/**
 * Rol FUNCIONAL de un documento: dos documentos con el mismo rol cumplen lo
 * mismo (compiten). El borrador de transporte y el definitivo comparten rol;
 * la proforma/pedido y la factura comercial definitiva también compiten.
 */
export function rolDocumento(t: DocType): string {
  if (t === "transporte" || t === "transporte_borrador") return "transporte";
  if (
    t === "proforma" ||
    t === "pedido_compra" ||
    t === "factura_comercial"
  ) {
    return "documento_comercial";
  }
  return t;
}

/** Documento comercial preliminar (Paso 1): cede ante la factura definitiva. */
export function esDocumentoComercialPreliminar(t: DocType): boolean {
  return t === "proforma" || t === "pedido_compra";
}

function esDocumentoPreliminar(d: {
  doc_type: DocType;
  file_name: string;
}): boolean {
  return (
    d.doc_type === "transporte_borrador" ||
    pareceBorrador(d.file_name) ||
    esDocumentoComercialPreliminar(d.doc_type)
  );
}

/** Un ganador por rol cuando varios documentos compiten (dos BL, dos borradores, etc.). */
function compararDocumentoMismoRol<
  T extends { doc_type: DocType; file_name: string; created_at?: string },
>(a: T, b: T): number {
  const preA = esDocumentoPreliminar(a) ? 1 : 0;
  const preB = esDocumentoPreliminar(b) ? 1 : 0;
  if (preA !== preB) return preA - preB;

  if (rolDocumento(a.doc_type) === "transporte") {
    const defA = a.doc_type === "transporte" ? 0 : 1;
    const defB = b.doc_type === "transporte" ? 0 : 1;
    if (defA !== defB) return defA - defB;
  }

  if (rolDocumento(a.doc_type) === "documento_comercial") {
    const rank = (t: DocType) =>
      t === "factura_comercial" ? 0 : t === "pedido_compra" ? 1 : 2;
    const ra = rank(a.doc_type);
    const rb = rank(b.doc_type);
    if (ra !== rb) return ra - rb;
  }

  if (a.created_at && b.created_at) {
    return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
  }
  return 0;
}

function elegirDocumentoDelRol<
  T extends { doc_type: DocType; file_name: string; created_at?: string },
>(grupo: T[]): T {
  return [...grupo].sort(compararDocumentoMismoRol)[0]!;
}

/**
 * Regla GENERAL del motor: qué documentos entran al cruce (reconciliación, IA,
 * checklist). (1) Los borradores ceden ante un definitivo del mismo rol.
 * (2) Un solo documento por rol funcional — no se mezclan dos BL ni draft +
 * re-upload; evita duplicar lecturas OCR contradictorias en TODOS los campos.
 */
export function documentosConValorLegal<
  T extends { doc_type: DocType; file_name: string; created_at?: string },
>(
  docs: T[],
  opts?: {
    /**
     * No colapsar a UNA sola factura por rol: mantiene TODAS las facturas
     * comerciales/proformas definitivas (para operaciones con varias facturas /
     * consolidados). El resto de los roles se sigue colapsando a la definitiva.
     */
    mantenerVariasFacturas?: boolean;
  },
): T[] {
  const rolesConDefinitivo = new Set<string>();
  for (const d of docs) {
    if (!esDocumentoPreliminar(d)) rolesConDefinitivo.add(rolDocumento(d.doc_type));
  }

  const sinBorradoresObsoletos = docs.filter((d) => {
    if (
      esDocumentoPreliminar(d) &&
      rolesConDefinitivo.has(rolDocumento(d.doc_type))
    ) {
      return false;
    }
    return true;
  });

  const porRol = new Map<string, T[]>();
  for (const d of sinBorradoresObsoletos) {
    const rol = rolDocumento(d.doc_type);
    const grupo = porRol.get(rol) ?? [];
    grupo.push(d);
    porRol.set(rol, grupo);
  }

  const esFactura = (dt: DocType) =>
    dt === "factura_comercial" || dt === "proforma";

  const resultado: T[] = [];
  for (const grupo of porRol.values()) {
    // Varias facturas distintas NO son borradores una de otra: se mantienen todas.
    if (opts?.mantenerVariasFacturas && grupo.every((d) => esFactura(d.doc_type))) {
      resultado.push(...grupo);
      continue;
    }
    resultado.push(grupo.length === 1 ? grupo[0]! : elegirDocumentoDelRol(grupo));
  }
  return resultado;
}

/** Nombre del documento de transporte según la vía elegida. */
export function transporteLabel(via: string | null): string {
  switch (via) {
    case "maritima":
      return "Documento de transporte marítimo/fluvial (BL)";
    case "aerea":
      return "Documento de transporte aéreo (AWB)";
    case "terrestre":
      return "Documento de transporte terrestre (CRT)";
    default:
      return "Documento de transporte";
  }
}

/** Motivo cuando falta el transporte definitivo en Paso 3 (según vía). */
export function motivoFaltanteTransporte(
  via: string | null,
  opts?: { borrador?: boolean },
): string {
  const tipo = transporteLabel(via);
  const pref = opts?.borrador
    ? `Hay borrador; falta el ${tipo} definitivo/original`
    : `Falta el ${tipo} definitivo/original`;
  return `${pref} para validar embarque, ruta y datos logísticos.`;
}

/** De dónde salieron datos logísticos (alertas / reconciliación). */
export function fuenteLogisticaLabel(
  via: string | null,
  etapa: "documentacion" | "embarque",
): string {
  if (etapa === "documentacion") return "packing/factura";
  return transporteLabel(via);
}

/** Etiqueta de un documento según su tipo y la vía (para el de transporte). */
export function docLabelDe(tipo: DocType, via: string | null): string {
  return tipo === "transporte" ? transporteLabel(via) : DOC_LABELS[tipo];
}

const STOPWORDS_ETIQUETA = new Set([
  "de",
  "la",
  "el",
  "y",
  "en",
  "del",
  "los",
  "las",
  "the",
  "and",
  "for",
]);

function normTextoEtiqueta(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * ¿Un ítem de faltantes (texto IA) se refiere al tipo de documento dado?
 * Usa etiquetas oficiales (DOC_LABELS / docLabelDe), no keywords ad hoc.
 */
export function faltanteMencionaTipoDocumento(
  f: { doc: string; motivo?: string },
  docType: DocType,
  via: string | null,
): boolean {
  const texto = normTextoEtiqueta(`${f.doc} ${f.motivo ?? ""}`);
  const etiquetas = [docLabelDe(docType, via), DOC_LABELS[docType]].map(
    normTextoEtiqueta,
  );
  if (etiquetas.some((e) => e.length >= 4 && texto.includes(e))) return true;

  const tokens = new Set<string>();
  for (const e of etiquetas) {
    for (const t of e.split(/[^a-z0-9]+/)) {
      if (t.length >= 3 && !STOPWORDS_ETIQUETA.has(t)) tokens.add(t);
    }
  }
  if (tokens.size === 0) return false;
  let hits = 0;
  for (const t of tokens) {
    if (texto.includes(t)) hits++;
  }
  return hits >= Math.min(2, tokens.size);
}

const PAT_AUSENCIA_OTRO_DOC =
  /\b(no figura|no se identifica|no se adjunta|ausencia|falta|no contiene|no incluye|no adjunta|debe acompanarse|debe presentarse|debe emitirse)\b/;

/**
 * ¿El hallazgo exige otro documento del expediente? (solo aplica al validar UN PDF al subir.)
 */
export function hallazgoExigeOtroDocumento(
  texto: string,
  docTypeActual: DocType,
  via: string | null,
): boolean {
  const t = normTextoEtiqueta(texto);
  if (!PAT_AUSENCIA_OTRO_DOC.test(t)) return false;
  if (
    docTypeActual !== "certificado_origen" &&
    /\b(prueba de origen|declaracion de origen)\b/.test(t)
  ) {
    return true;
  }
  for (const dt of Object.keys(DOC_LABELS) as DocType[]) {
    if (dt === docTypeActual || dt === "otro") continue;
    if (faltanteMencionaTipoDocumento({ doc: texto, motivo: "" }, dt, via)) {
      return true;
    }
  }
  return false;
}

/** ¿El faltante apunta a algún documento del Paso 3 (embarque)? */
export function faltantePerteneceEtapaEmbarque(
  f: { doc: string; motivo?: string },
  via: string | null,
): boolean {
  return DOCS_IA_POR_ETAPA.embarque.some((dt) =>
    faltanteMencionaTipoDocumento(f, dt, via),
  );
}

/** ¿El faltante es exclusivo de embarque (no de documentación comercial)? */
export function faltantePerteneceSoloEmbarque(
  f: { doc: string; motivo?: string },
  via: string | null,
): boolean {
  const embarque = faltantePerteneceEtapaEmbarque(f, via);
  const documentacion = DOCS_IA_POR_ETAPA.documentacion.some((dt) =>
    faltanteMencionaTipoDocumento(f, dt, via),
  );
  return embarque && !documentacion;
}

/** Doc cargado → faltante que puede tachar si la IA lo validó. */
export function docTypeCubreFaltante(
  docType: DocType,
  f: { doc: string; motivo?: string },
  via: string | null,
  opts?: { excluirBorradorSiPideDefinitivo?: boolean },
): boolean {
  if (!faltanteMencionaTipoDocumento(f, docType, via)) return false;
  if (
    opts?.excluirBorradorSiPideDefinitivo &&
    docType === "transporte_borrador"
  ) {
    const texto = normTextoEtiqueta(`${f.doc} ${f.motivo ?? ""}`);
    if (/definitivo|original/.test(texto)) return false;
  }
  return true;
}

/** Etiquetas en inglés (para la vista del participante/tercero del exterior). */
export const DOC_LABELS_EN: Record<DocType, string> = {
  pedido_compra: "Purchase order",
  factura_comercial: "Commercial invoice",
  proforma: "Proforma invoice",
  packing_list: "Packing list",
  transporte: "Transport document",
  transporte_borrador: "Transport document (draft)",
  certificado_origen: "Certificate of origin",
  declaracion_transbordo: "Transshipment / direct-shipment declaration",
  certificado_peso: "Weight certificate",
  liberacion_transporte: "Transport release / delivery order",
  seguro: "Insurance policy",
  catalogo: "Catalog / datasheet",
  despacho: "Customs declaration",
  cotizacion_forwarder: "Freight / forwarder quote",
  factura_gastos: "Expenses invoice (carrier / terminal / forwarder)",
  remito: "Delivery note",
  otro: "Other document",
};

function transporteLabelEn(via: string | null): string {
  switch (via) {
    case "maritima":
      return "Transport document — sea/river (B/L)";
    case "aerea":
      return "Transport document — air (AWB)";
    case "terrestre":
      return "Transport document — road (CRT)";
    default:
      return "Transport document";
  }
}

/** Etiqueta en inglés de un documento según su tipo y la vía. */
export function docLabelEn(tipo: DocType, via: string | null): string {
  return tipo === "transporte" ? transporteLabelEn(via) : DOC_LABELS_EN[tipo];
}

/**
 * Documentos obligatorios según el tipo de operación (criterio despachante).
 * El de "transporte" cambia de nombre según la vía (BL/AWB/CRT) pero cuenta igual.
 */
export const OBLIGATORIOS_IMPO: DocType[] = [
  "factura_comercial",
  "packing_list",
  "transporte",
];
export const OBLIGATORIOS_EXPO: DocType[] = [
  "factura_comercial",
  "packing_list",
  "transporte",
];

export function docsObligatorios(tipo: string): DocType[] {
  return tipo.toLowerCase().startsWith("exp")
    ? OBLIGATORIOS_EXPO
    : OBLIGATORIOS_IMPO;
}

/**
 * Documentos opcionales sugeridos (tienen su propio espacio de carga, pero no
 * cuentan para el progreso de obligatorios). El pedido / orden de compra va al
 * principio de todo (antes de la proforma): de él surgen el Incoterm, la forma
 * de pago y dónde se emite el documento de transporte. La proforma es clave
 * para abrir la carpeta cuando todavía no hay factura comercial.
 */
export const OPCIONALES_SUGERIDOS: DocType[] = ["pedido_compra", "proforma"];

/** Cuántos obligatorios están cargados, dado el set de tipos presentes. */
export function progresoDocs(tipo: string, tiposPresentes: DocType[]) {
  const obligatorios = docsObligatorios(tipo);
  const presentes = new Set(tiposPresentes);
  const completos = obligatorios.filter((t) => presentes.has(t)).length;
  return { completos, total: obligatorios.length };
}

/** Une una lista en castellano: "a, b y c". */
function listar(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/**
 * Mensaje para el CLIENTE al pasar a "En preparación" (Paso 2). Mira qué
 * documentos entregó en el Paso 1 y le pide concretamente los que faltan,
 * incluido (como recomendación) el certificado de origen según el país.
 */
export function mensajeDocumentacionCliente(args: {
  tipo: string;
  via: string | null;
  tiposPresentes: DocType[];
  paisOrigen: string | null;
}): string {
  const { tipo, via, tiposPresentes, paisOrigen } = args;
  const esExpo = tipo.toLowerCase().startsWith("exp");
  const present = new Set(tiposPresentes);
  const obligatorios = docsObligatorios(tipo);

  const recibidos: string[] = [];
  for (const t of obligatorios) if (present.has(t)) recibidos.push(docLabelDe(t, via));
  if (present.has("proforma")) recibidos.push(DOC_LABELS.proforma);

  const faltantes = obligatorios.filter((t) => !present.has(t));
  // El documento de transporte se trata aparte: depende del embarque.
  const faltaTransporte = faltantes.includes("transporte");
  const faltantesAhora = faltantes.filter((t) => t !== "transporte");

  const partes: string[] = [];
  partes.push(
    esExpo
      ? "Empezamos a preparar tu exportación."
      : "Empezamos a preparar tu importación.",
  );

  if (recibidos.length) {
    partes.push(`Ya recibimos: ${listar(recibidos)}.`);
  }

  if (faltantesAhora.length) {
    partes.push(
      `Para avanzar necesitamos que nos hagas llegar: ${listar(
        faltantesAhora.map((t) => docLabelDe(t, via)),
      )}.`,
    );
  }

  if (faltaTransporte) {
    partes.push(
      `El ${docLabelDe("transporte", via)} lo vas a tener cuando la mercadería ` +
        "embarque; enviánoslo apenas lo tengas.",
    );
  }

  // Certificado de origen (recomendación según el país, no es obligatorio).
  const pais = buscarPais(paisOrigen);
  if (pais && recomiendaCertificadoOrigen(pais)) {
    partes.push(
      `Como la mercadería es de ${pais.nombre} (${acuerdoLabel(pais)}), si ` +
        "conseguís el certificado de origen podés acceder a una rebaja " +
        "arancelaria. Es opcional, pero conviene pedírselo al proveedor cuanto " +
        "antes porque suele demorar.",
    );
  }

  if (faltantesAhora.length || faltaTransporte) {
    partes.push(
      "Podés ir pidiéndoselos al proveedor o al forwarder y subirlos desde acá. " +
        "Cualquier duda, escribinos.",
    );
  } else {
    partes.push(
      "Ya tenemos la documentación inicial; seguimos con la clasificación y la " +
        "preparación del despacho.",
    );
  }

  return partes.join(" ");
}
