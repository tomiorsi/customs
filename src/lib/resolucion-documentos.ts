import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  getDocumentsByOperation,
  getOperationById,
  updateOperationCampos,
  parseExtraccionDoc,
  extraccionDocVigente,
  setDocumentExtraccion,
  fingerprintConflicto,
  mergeResolucionesConflictos,
  setReconciliacionMeta,
  parseReconciliacionMeta,
  type DocumentRow,
  type OpCampo,
  type OperationWithClient,
  type ResolucionConflictoPersistida,
  parseResolucionesConflictos,
} from "@/lib/data";
import { leerYAplicarCostosForwarder } from "@/lib/costos-forwarder-extract";
import {
  DOC_LABELS,
  DOCS_RECONCILIACION,
  documentosConValorLegal,
  type DocType,
} from "@/lib/docs";
import { rawDatosDesdeCache } from "@/lib/extraccion-doc-cache";
import {
  resolverConflictosDocumentosBatch,
  extraerDatosDocumentoOperacion,
  fusionarYCompletarOrigen,
  iaDocsDisponible,
  normalizarDatosDocumentoOperacion,
  vendedorDesdeExtraccion,
  VACIO_DATOS_DOC,
  type ArchivoIA,
  type ConflictoDocumentoBatch,
  type DatosDocumentoOperacion,
  type ValorElegidoIA,
} from "@/lib/ia-documentos";
import { dentroDeClientes, rutaArchivo } from "@/lib/parquet-store";
import { buscarPais, nombrePaisCanonico } from "@/lib/cotizador";
import {
  enriquecerFormaPagoComercial,
  extraerPlazoDias,
} from "@/lib/pago-mercaderia";
import {
  contextoFechaDesdeOperacion,
  fechaFacturaPlausible,
  hoyIsoArgentina,
  parseFechaComercial,
  plazoPagoRazonable,
} from "@/lib/fechas";
import {
  consolidarListaContenedores,
  esContenedorIso6346Valido,
  extraerCodigosContenedor,
  resolverConflictosContenedor,
  sonVariantesOcrContenedor,
  unirListasContenedores,
} from "@/lib/costos-logistica";

/* ───────────────────────── Tipos del motor ───────────────────────── */

export type EntradaDocumento = {
  docId: string;
  docType: DocType;
  fileName: string;
  archivo: ArchivoIA;
  storedName: string;
  size: number | null;
};

type DocConDatos = EntradaDocumento & { datos: DatosDocumentoOperacion };

type MetaConflicto = {
  label: string;
  unicos: string[];
  campo: OpCampo;
  esLista?: boolean;
  tipoConflicto: "ocr_variante" | "valores_distintos";
};

type EntradaValor = {
  docType: DocType;
  archivo: ArchivoIA;
  valor: string;
};

type ResultadoDeteccionEscalar =
  | { kind: "valor"; valor: string }
  | { kind: "conflicto"; item: ConflictoDocumentoBatch; unicos: string[] }
  | { kind: "vacio" };

type DefCampoEscalar = {
  id: string;
  label: string;
  campo: OpCampo;
  descripcionIA?: string;
  /** Si se define, sólo se leen estos tipos de documento (evita consignatario ≠ vendedor). */
  docsFuente?: DocType[];
  extraer: (d: DatosDocumentoOperacion) => string | null | undefined;
  normalizar?: (v: string) => string | null;
  equivalentes?: (a: string, b: string) => boolean;
  sonVariantesOcr?: (a: string, b: string) => boolean;
  validar?: (v: string) => boolean;
};

type DefCampoLista = {
  id: string;
  label: string;
  campo: OpCampo;
  campoCantidad?: OpCampo;
  descripcionIA?: string;
  descripcionFilaIA?: string;
  extraerLista: (d: DatosDocumentoOperacion) => string[];
  normalizarItem: (v: string) => string;
  sonVariantesOcr?: (a: string, b: string) => boolean;
  validarItem?: (v: string) => boolean;
  cantidadEsperada: (
    op: OperationWithClient,
    listas: string[][],
  ) => number;
  persistir: (
    items: string[],
    op: OperationWithClient,
  ) => { lista: string | null; cantidad: number };
};

export type ResultadoReconciliacionDocumentos = {
  cambios: Partial<Record<OpCampo, string>>;
  alertas: string[];
  cantidadContenedores: number;
  contenedorLista: string | null;
};

export const RECON_VACIA: ResultadoReconciliacionDocumentos = {
  cambios: {},
  alertas: [],
  cantidadContenedores: 0,
  contenedorLista: null,
};

type DocFingerprintMeta = Pick<
  DocumentRow,
  "id" | "doc_type" | "stored_name" | "size"
>;

/** Hash estable de los PDFs reconciliables (cambia si suben/borran/reemplazan). */
export function fingerprintDocumentosReconciliacion(
  docs: DocFingerprintMeta[],
): string {
  const partes = docs
    .filter((d) => DOCS_RECONCILIACION.includes(d.doc_type))
    .map((d) => `${d.id}:${d.stored_name}:${d.size ?? 0}`)
    .sort();
  return createHash("sha256").update(partes.join("|")).digest("hex").slice(0, 20);
}

/** Reconcilia solo si cambió algún documento desde la última pasada. */
export async function reconciliarDocumentosSiCambio(
  op: OperationWithClient,
  opts?: ReconciliarOpts,
): Promise<{ recon: ResultadoReconciliacionDocumentos; ejecuto: boolean }> {
  const docs = await getDocumentsByOperation(op.id, op.user_id);
  const fp = fingerprintDocumentosReconciliacion(docs);
  const prev = parseReconciliacionMeta(op.reconciliacion_meta);

  if (prev?.fingerprint === fp) {
    return { recon: RECON_VACIA, ejecuto: false };
  }

  const recon = await reconciliarDocumentosOperacion(op, opts);
  return { recon, ejecuto: true };
}

export type ReconciliarOpts = {
  entradas?: EntradaDocumento[];
  /** Documento recién subido: el cruce prioriza conflictos que lo involucran. */
  docRecienSubidoId?: string;
  /** Sin IA: solo JSON en caché; conflictos quedan como alerta (p. ej. al borrar). */
  sinIA?: boolean;
};

/* ───────────────────────── Configuración de campos ───────────────────────── */

function normTexto(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

function normUpper(v: string): string {
  return v.toUpperCase().replace(/\s/g, "");
}

import {
  montosEquivalentes,
  normMonto,
  normPesoDocumento,
  pesosEquivalentes,
} from "@/lib/equivalencias-campo";

function sonVariantesOcrGrupo(
  codigos: string[],
  sonOcr?: (a: string, b: string) => boolean,
): boolean {
  if (codigos.length < 2 || !sonOcr) return false;
  const first = codigos[0]!;
  return codigos.every((c) => c === first || sonOcr(first, c));
}

function equivalentesTexto(a: string, b: string): boolean {
  return normTexto(a).toLowerCase() === normTexto(b).toLowerCase();
}

function equivalentesPais(a: string, b: string): boolean {
  if (equivalentesTexto(a, b)) return true;
  const pa = buscarPais(a);
  const pb = buscarPais(b);
  if (pa && pb) {
    return pa.nombre.toLowerCase() === pb.nombre.toLowerCase();
  }
  return false;
}

/** Solo devuelve ISO YYYY-MM-DD; si no parsea, descarta (no guarda basura). */
function normFecha(v: string): string | null {
  return parseFechaComercial(v) ?? null;
}

function fechaCampoInvalida(v: string | null | undefined): boolean {
  const s = String(v ?? "").trim();
  if (!s) return false;
  return parseFechaComercial(s) == null;
}

function equivalentesFecha(a: string, b: string): boolean {
  const fa = normFecha(a);
  const fb = normFecha(b);
  return fa != null && fb != null && fa === fb;
}

const CAMPOS_ESCALARES: DefCampoEscalar[] = [
  {
    id: "via",
    label: "Vía de transporte",
    campo: "via",
    docsFuente: ["transporte", "transporte_borrador"],
    extraer: (d) => d.via,
    normalizar: normTexto,
    equivalentes: (a, b) => a.toLowerCase() === b.toLowerCase(),
  },
  {
    id: "contraparte",
    label: "Proveedor / comprador",
    campo: "contraparte",
    docsFuente: ["factura_comercial", "proforma", "pedido_compra"],
    extraer: (d) => vendedorDesdeExtraccion(d),
    normalizar: normTexto,
    equivalentes: equivalentesTexto,
  },
  {
    id: "mercaderia",
    label: "Descripción de mercadería",
    campo: "mercaderia",
    docsFuente: ["factura_comercial", "proforma", "pedido_compra", "packing_list"],
    extraer: (d) => d.mercaderia?.mercaderia,
    normalizar: normTexto,
  },
  {
    id: "marca",
    label: "Marca",
    campo: "marca",
    extraer: (d) => d.mercaderia?.marca,
    normalizar: normTexto,
    equivalentes: equivalentesTexto,
  },
  {
    id: "cantidad",
    label: "Cantidad",
    campo: "cantidad",
    extraer: (d) => d.mercaderia?.cantidad,
    normalizar: normMonto,
    equivalentes: montosEquivalentes,
  },
  {
    id: "unidad",
    label: "Unidad",
    campo: "unidad",
    extraer: (d) => d.mercaderia?.unidad,
    normalizar: normUpper,
    equivalentes: (a, b) => a === b,
  },
  {
    id: "bultos",
    label: "Bultos",
    campo: "bultos",
    extraer: (d) => d.mercaderia?.bultos,
    normalizar: normMonto,
    equivalentes: montosEquivalentes,
  },
  {
    id: "tipo_embalaje",
    label: "Tipo de embalaje",
    campo: "tipo_embalaje",
    extraer: (d) => d.mercaderia?.tipo_embalaje,
    normalizar: normTexto,
    equivalentes: equivalentesTexto,
  },
  {
    id: "peso_neto",
    label: "Peso neto",
    campo: "peso_neto",
    docsFuente: ["factura_comercial", "proforma", "packing_list", "certificado_peso"],
    extraer: (d) => d.mercaderia?.peso_neto,
    normalizar: normPesoDocumento,
    equivalentes: pesosEquivalentes,
  },
  {
    id: "peso_bruto",
    label: "Peso bruto",
    campo: "peso_bruto",
    docsFuente: ["factura_comercial", "proforma", "packing_list", "certificado_peso"],
    extraer: (d) => d.mercaderia?.peso_bruto,
    normalizar: normPesoDocumento,
    equivalentes: pesosEquivalentes,
  },
  {
    id: "pais_origen",
    label: "País de origen",
    campo: "pais_origen",
    docsFuente: [
      "factura_comercial",
      "proforma",
      "certificado_origen",
      "certificado_peso",
      "transporte",
    ],
    extraer: (d) => d.origen?.pais_origen,
    normalizar: normTexto,
    equivalentes: equivalentesPais,
  },
  {
    id: "pais_adquisicion",
    label: "País de adquisición",
    campo: "pais_adquisicion",
    docsFuente: ["factura_comercial", "proforma", "pedido_compra"],
    extraer: (d) => d.origen?.pais_adquisicion,
    normalizar: normTexto,
    equivalentes: equivalentesPais,
  },
  {
    id: "pais_procedencia",
    label: "País de procedencia",
    campo: "pais_procedencia",
    extraer: (d) => d.origen?.pais_procedencia,
    normalizar: normTexto,
    equivalentes: equivalentesPais,
  },
  {
    id: "pais_destino",
    label: "País de destino",
    campo: "pais_destino",
    extraer: (d) => d.origen?.pais_destino,
    normalizar: normTexto,
    equivalentes: equivalentesPais,
  },
  {
    id: "forma_pago",
    label: "Forma de pago",
    campo: "forma_pago",
    extraer: (d) => d.pago?.forma_pago,
    normalizar: normTexto,
    equivalentes: equivalentesTexto,
  },
  {
    id: "liberacion_doc",
    label: "Liberación del transporte",
    campo: "liberacion_doc",
    extraer: (d) => d.pago?.liberacion_doc,
    normalizar: normTexto,
    equivalentes: equivalentesTexto,
  },
  {
    id: "fecha_factura",
    label: "Fecha de factura",
    campo: "fecha_factura",
    extraer: (d) => d.pago?.fecha_factura,
    normalizar: normFecha,
    equivalentes: equivalentesFecha,
  },
  {
    id: "plazo_pago_dias",
    label: "Plazo de pago (días)",
    campo: "plazo_pago_dias",
    extraer: (d) => d.pago?.plazo_pago_dias,
    normalizar: (v) => v.replace(/\D/g, ""),
    equivalentes: (a, b) => a === b,
  },
  {
    id: "transporte_doc_nro",
    label: "Número BL/AWB/CRT",
    campo: "transporte_doc_nro",
    extraer: (d) => d.transporte?.transporte_doc_nro,
    normalizar: normUpper,
    equivalentes: (a, b) => a === b,
  },
  {
    id: "transportista",
    label: "Transportista / naviera",
    campo: "transportista",
    extraer: (d) => d.transporte?.transportista,
    normalizar: normTexto,
    equivalentes: equivalentesTexto,
  },
  {
    id: "puerto_origen",
    label: "Puerto/aeropuerto de origen",
    campo: "puerto_origen",
    extraer: (d) => d.transporte?.puerto_origen,
    normalizar: normTexto,
    equivalentes: equivalentesTexto,
  },
  {
    id: "puerto_destino",
    label: "Puerto/aeropuerto de destino",
    campo: "puerto_destino",
    extraer: (d) => d.transporte?.puerto_destino,
    normalizar: normTexto,
    equivalentes: equivalentesTexto,
  },
  {
    id: "puerto_transbordo",
    label: "Puerto de transbordo",
    campo: "puerto_transbordo",
    extraer: (d) => d.logistica?.puerto_transbordo,
    normalizar: normTexto,
    equivalentes: equivalentesTexto,
  },
  {
    id: "eta",
    label: "ETA / fecha de arribo",
    campo: "eta",
    extraer: (d) => d.transporte?.eta,
    normalizar: normFecha,
    equivalentes: equivalentesFecha,
  },
  {
    id: "medio_transporte",
    label: "Medio de transporte",
    campo: "medio_transporte",
    extraer: (d) => d.transporte?.medio_transporte,
    normalizar: normTexto,
    equivalentes: equivalentesTexto,
  },
  {
    id: "tipo_contenedor",
    label: "Tipo de contenedor",
    campo: "tipo_contenedor",
    extraer: (d) => d.logistica?.tipo_contenedor,
    normalizar: normUpper,
  },
  {
    id: "volumen_cbm",
    label: "Volumen CBM",
    campo: "volumen_cbm",
    extraer: (d) => d.logistica?.volumen_cbm,
    normalizar: normMonto,
    equivalentes: montosEquivalentes,
  },
  {
    id: "valor_fob",
    label: "Valor FOB",
    campo: "valor_fob",
    extraer: (d) => d.comercial?.valor_fob,
    normalizar: normMonto,
    equivalentes: montosEquivalentes,
  },
  {
    id: "flete",
    label: "Flete",
    campo: "flete",
    extraer: (d) => d.comercial?.flete,
    normalizar: normMonto,
    equivalentes: montosEquivalentes,
  },
  {
    id: "seguro",
    label: "Seguro",
    campo: "seguro",
    extraer: (d) => d.comercial?.seguro,
    normalizar: normMonto,
    equivalentes: montosEquivalentes,
  },
  {
    id: "valor_factura",
    label: "Total factura",
    campo: "valor_factura",
    extraer: (d) => d.comercial?.valor_factura,
    normalizar: normMonto,
    equivalentes: montosEquivalentes,
  },
  {
    id: "valor_cif",
    label: "Valor CIF",
    campo: "valor_cif",
    extraer: (d) => d.comercial?.valor_cif,
    normalizar: normMonto,
    equivalentes: montosEquivalentes,
  },
  {
    id: "incoterm",
    label: "Incoterm",
    campo: "incoterm",
    extraer: (d) => d.comercial?.incoterm,
    normalizar: normUpper,
    equivalentes: (a, b) => a.slice(0, 3) === b.slice(0, 3),
  },
  {
    id: "moneda",
    label: "Moneda",
    campo: "moneda",
    extraer: (d) => d.comercial?.moneda,
    normalizar: normUpper,
    equivalentes: (a, b) => a === b,
  },
];

const CAMPO_LISTA_CONTENEDORES: DefCampoLista = {
  id: "contenedor",
  label: "Números de contenedor",
  campo: "contenedor",
  campoCantidad: "cantidad_contenedores",
  descripcionIA:
    "números de contenedor ISO 6346 (4 letras + 7 dígitos). Elegí la variante " +
    "que coincida literalmente con lo más legible en el documento.",
  descripcionFilaIA:
    "números de contenedor en esa fila de la tabla. Determiná cuál corresponde " +
    "al contenedor real de esa fila.",
  extraerLista: (d) => {
    const cont = d.logistica?.contenedor;
    if (!cont?.trim()) return [];
    return resolverConflictosContenedor(extraerCodigosContenedor(cont));
  },
  normalizarItem: normUpper,
  sonVariantesOcr: sonVariantesOcrContenedor,
  validarItem: esContenedorIso6346Valido,
  cantidadEsperada: (_op, listas) =>
    Math.max(0, ...listas.map((l) => l.length)),
  persistir: (items, _op) =>
    consolidarListaContenedores(null, items.join(", "), String(items.length)),
};

/* ───────────────────────── Utilidades ───────────────────────── */

function fuentesUnicas(
  entradas: EntradaValor[],
): { rol: string; nombre: string; archivo: ArchivoIA }[] {
  const map = new Map<string, { rol: string; nombre: string; archivo: ArchivoIA }>();
  for (const e of entradas) {
    map.set(e.archivo.nombre, {
      rol: e.archivo.rol,
      nombre: e.archivo.nombre,
      archivo: e.archivo,
    });
  }
  return [...map.values()];
}

function archivoStub(doc: DocumentRow): ArchivoIA {
  return {
    rol: DOC_LABELS[doc.doc_type] ?? "Documento",
    nombre: doc.file_name,
    mediaType: doc.mime_type || "application/octet-stream",
    base64: "",
  };
}

async function cargarArchivoDocumento(
  userId: string,
  doc: DocumentRow,
): Promise<ArchivoIA | null> {
  const fullPath = rutaArchivo(userId, doc.stored_name);
  if (!dentroDeClientes(fullPath)) return null;
  const bytes = await readFile(fullPath).catch(() => null);
  if (!bytes) return null;
  return {
    rol: DOC_LABELS[doc.doc_type] ?? "Documento",
    nombre: doc.file_name,
    mediaType: doc.mime_type || "application/octet-stream",
    base64: Buffer.from(bytes).toString("base64"),
  };
}

async function asegurarPdfEntrada(
  userId: string,
  entrada: EntradaDocumento,
  meta: DocumentRow | undefined,
): Promise<EntradaDocumento> {
  if (entrada.archivo.base64 || !meta) return entrada;
  const archivo = await cargarArchivoDocumento(userId, meta);
  return archivo ? { ...entrada, archivo } : entrada;
}

/** Carga PDFs sólo de los documentos citados en conflictos escalares. */
async function asegurarPdfsConflictos(
  userId: string,
  porDoc: DocConDatos[],
  metaPorId: Map<string, DocumentRow>,
  conflictos: ConflictoDocumentoBatch[],
): Promise<void> {
  const porNombre = new Map(porDoc.map((p) => [p.archivo.nombre, p]));
  for (const c of conflictos) {
    for (const f of c.fuentes) {
      if (f.archivo.base64) continue;
      const entrada = porNombre.get(f.nombre);
      if (!entrada) continue;
      const meta = metaPorId.get(entrada.docId);
      if (!meta) continue;
      const archivo = await cargarArchivoDocumento(userId, meta);
      if (!archivo) continue;
      f.archivo.base64 = archivo.base64;
      f.archivo.mediaType = archivo.mediaType;
      entrada.archivo.base64 = archivo.base64;
      entrada.archivo.mediaType = archivo.mediaType;
    }
  }
}

/* ───────────────────────── Carga de documentos ───────────────────────── */

export async function cargarDocumentosOperacion(
  op: OperationWithClient,
): Promise<EntradaDocumento[]> {
  const docs = await getDocumentsByOperation(op.id, op.user_id);
  const candidatos = documentosConValorLegal(docs).filter((d) =>
    DOCS_RECONCILIACION.includes(d.doc_type),
  );

  return candidatos.map((d) => ({
    docId: d.id,
    docType: d.doc_type,
    fileName: d.file_name,
    storedName: d.stored_name,
    size: d.size,
    archivo: archivoStub(d),
  }));
}

function debeExtraerConIA(docType: DocType, cacheVigente: boolean): boolean {
  return !cacheVigente && DOCS_RECONCILIACION.includes(docType);
}

async function cargarDatosDocumentos(
  entradas: EntradaDocumento[],
  op: OperationWithClient,
  opts?: ReconciliarOpts,
): Promise<DocConDatos[]> {
  const docsMeta = await getDocumentsByOperation(op.id, op.user_id);
  const metaPorId = new Map(docsMeta.map((d) => [d.id, d]));

  const porDoc: DocConDatos[] = [];
  for (const entrada of entradas) {
    const meta = metaPorId.get(entrada.docId);
    const cache = meta ? parseExtraccionDoc(meta.extraccion_ia) : null;
    const cacheVigente =
      meta != null && extraccionDocVigente(meta, cache) ? cache : null;

    let datos: DatosDocumentoOperacion;
    if (debeExtraerConIA(entrada.docType, Boolean(cacheVigente))) {
      const e = await asegurarPdfEntrada(op.user_id, entrada, meta);
      datos = await extraerDatosDocumentoOperacion(e.archivo, meta ?? null);
      if (meta) {
        await setDocumentExtraccion(
          op.user_id,
          e.docId,
          e.storedName,
          e.size,
          datos,
        ).catch(() => {});
      }
      porDoc.push({ ...e, datos });
    } else if (cacheVigente) {
      const raw = rawDatosDesdeCache(meta!);
      datos = raw
        ? normalizarDatosDocumentoOperacion({ datos: raw })
        : { ...VACIO_DATOS_DOC };
      porDoc.push({ ...entrada, datos });
    } else {
      datos = { ...VACIO_DATOS_DOC };
      porDoc.push({ ...entrada, datos });
    }
  }
  return porDoc;
}

function valorNormalizadoEscalar(
  def: DefCampoEscalar,
  p: DocConDatos,
): string | null {
  const raw = def.extraer(p.datos);
  if (raw == null || String(raw).trim() === "") return null;
  const valor = def.normalizar
    ? def.normalizar(String(raw))
    : String(raw).trim();
  return valor || null;
}

function valoresEquivalentesEscalar(
  def: DefCampoEscalar,
  a: string,
  b: string,
): boolean {
  if (a === b) return true;
  return def.equivalentes?.(a, b) ?? false;
}

/** Misma mercadería / unidades complementarias: dejamos que la IA resuelva conflictos. */
function resolverConflictoCompatible(
  _def: DefCampoEscalar,
  _unicos: string[],
  _fuentes: DocConDatos[],
): string | null {
  return null;
}

/** Un PDF por valor distinto (no todos los que coinciden). */
function fuentesUnicasPorValorDistinto(
  entradas: EntradaValor[],
  def: DefCampoEscalar,
): ReturnType<typeof fuentesUnicas> {
  const representantes: EntradaValor[] = [];
  for (const e of entradas) {
    if (
      representantes.some((r) =>
        valoresEquivalentesEscalar(def, r.valor, e.valor),
      )
    ) {
      continue;
    }
    representantes.push(e);
  }
  return fuentesUnicas(representantes);
}

function docsParaCampoEscalar(
  def: DefCampoEscalar,
  porDoc: DocConDatos[],
): DocConDatos[] {
  if (!def.docsFuente?.length) return porDoc;
  return porDoc.filter((p) => def.docsFuente!.includes(p.docType));
}

function detectarCampoEscalar(
  def: DefCampoEscalar,
  porDoc: DocConDatos[],
  opts?: ReconciliarOpts,
): ResultadoDeteccionEscalar {
  const fuentes = docsParaCampoEscalar(def, porDoc);
  const anclaId = opts?.docRecienSubidoId;
  if (anclaId) {
    const nuevo = fuentes.find((p) => p.docId === anclaId);
    if (nuevo) {
      const valorNuevo = valorNormalizadoEscalar(def, nuevo);
      if (!valorNuevo) return { kind: "vacio" };

      const contradictores: EntradaValor[] = [];
      for (const p of fuentes) {
        if (p.docId === anclaId) continue;
        const valor = valorNormalizadoEscalar(def, p);
        if (!valor) continue;
        if (valoresEquivalentesEscalar(def, valor, valorNuevo)) continue;
        contradictores.push({
          docType: p.docType,
          archivo: p.archivo,
          valor,
        });
      }

      if (contradictores.length === 0) {
        return { kind: "valor", valor: valorNuevo };
      }

      const entradas: EntradaValor[] = [
        {
          docType: nuevo.docType,
          archivo: nuevo.archivo,
          valor: valorNuevo,
        },
        ...contradictores,
      ];
      const unicos = [...new Set(entradas.map((e) => e.valor))];
      const compatible = resolverConflictoCompatible(def, unicos, fuentes);
      if (compatible) return { kind: "valor", valor: compatible };

      const ocr =
        def.sonVariantesOcr != null &&
        sonVariantesOcrGrupo(unicos, def.sonVariantesOcr);
      return {
        kind: "conflicto",
        unicos,
        item: {
          id: `escalar:${def.id}`,
          campo: def.label,
          descripcion: def.descripcionIA,
          candidatos: unicos,
          tipoConflicto: ocr ? "ocr_variante" : "valores_distintos",
          fuentes: fuentesUnicasPorValorDistinto(entradas, def),
        },
      };
    }
  }

  const entradas: EntradaValor[] = [];
  for (const p of fuentes) {
    const valor = valorNormalizadoEscalar(def, p);
    if (!valor) continue;
    entradas.push({
      docType: p.docType,
      archivo: p.archivo,
      valor,
    });
  }
  if (entradas.length === 0) return { kind: "vacio" };

  const unicos = [...new Set(entradas.map((e) => e.valor))];
  if (unicos.length === 1) return { kind: "valor", valor: unicos[0]! };

  const compatible = resolverConflictoCompatible(def, unicos, fuentes);
  if (compatible) return { kind: "valor", valor: compatible };

  if (def.equivalentes) {
    const ref = unicos[0]!;
    if (unicos.every((u) => def.equivalentes!(ref, u))) {
      return { kind: "valor", valor: ref };
    }
  }

  if (
    def.sonVariantesOcr &&
    def.validar &&
    sonVariantesOcrGrupo(unicos, def.sonVariantesOcr)
  ) {
    const validos = unicos.filter(def.validar);
    if (validos.length === 1) return { kind: "valor", valor: validos[0]! };
  }

  const ocr =
    def.sonVariantesOcr != null &&
    unicos.length >= 2 &&
    sonVariantesOcrGrupo(unicos, def.sonVariantesOcr);

  return {
    kind: "conflicto",
    unicos,
    item: {
      id: `escalar:${def.id}`,
      campo: def.label,
      descripcion: def.descripcionIA,
      candidatos: unicos,
      tipoConflicto: ocr ? "ocr_variante" : "valores_distintos",
      fuentes: fuentesUnicasPorValorDistinto(entradas, def),
    },
  };
}

function listasContenedorEquivalentes(a: string[], b: string[]): boolean {
  const na = resolverConflictosContenedor([...a]);
  const nb = resolverConflictosContenedor([...b]);
  if (na.length !== nb.length) return false;
  const usados = new Set<number>();
  for (const x of na) {
    const j = nb.findIndex(
      (y, i) =>
        !usados.has(i) && (x === y || sonVariantesOcrContenedor(x, y)),
    );
    if (j < 0) return false;
    usados.add(j);
  }
  return true;
}

type ResultadoContenedores =
  | { kind: "valor"; items: string[]; alertaIncremental?: string }
  | { kind: "conflicto"; item: ConflictoDocumentoBatch; unicos: string[] }
  | { kind: "vacio" };

function reconciliarContenedores(
  porDoc: DocConDatos[],
  opts?: ReconciliarOpts,
): ResultadoContenedores {
  const def = CAMPO_LISTA_CONTENEDORES;
  const conLista = porDoc.filter((p) => def.extraerLista(p.datos).length > 0);
  if (conLista.length === 0) return { kind: "vacio" };

  const listasTexto = conLista.map((p) => def.extraerLista(p.datos).join(", "));
  const { lista } = unirListasContenedores(listasTexto);
  const itemsMerged = lista
    ? lista.split(", ").map((s) => s.trim()).filter(Boolean)
    : [];

  if (itemsMerged.length === 0) return { kind: "vacio" };

  const contradictores = conLista.filter(
    (p) =>
      !listasContenedorEquivalentes(itemsMerged, def.extraerLista(p.datos)),
  );

  if (contradictores.length === 0) {
    return { kind: "valor", items: itemsMerged };
  }

  const unicos = contradictores.map((p) =>
    def.extraerLista(p.datos).join(", "),
  );
  return {
    kind: "conflicto",
    unicos: [...new Set(unicos)],
    item: {
      id: "lista:contenedor",
      campo: def.label,
      descripcion: def.descripcionIA,
      candidatos: [...new Set(unicos)],
      tipoConflicto: "valores_distintos",
      fuentes: fuentesUnicas(
        contradictores.map((p) => ({
          docType: p.docType,
          archivo: p.archivo,
          valor: def.extraerLista(p.datos).join(", "),
        })),
      ),
    },
  };
}

function aplicarCamposDerivadosPago(
  op: OperationWithClient,
  cambios: Partial<Record<OpCampo, string>>,
): void {
  const hoy = hoyIsoArgentina();
  const ctxFecha = { ...contextoFechaDesdeOperacion(op), hoyAr: hoy };

  const forma = cambios.forma_pago ?? op.forma_pago;
  if (!cambios.plazo_pago_dias && forma) {
    const plazo = extraerPlazoDias(forma);
    if (plazo != null && String(op.plazo_pago_dias ?? "") !== String(plazo)) {
      cambios.plazo_pago_dias = String(plazo);
    }
  }

  const rawFf = cambios.fecha_factura ?? op.fecha_factura;
  if (rawFf) {
    const ffIso = parseFechaComercial(rawFf, ctxFecha);
    if (ffIso && fechaFacturaPlausible(ffIso, hoy)) {
      cambios.fecha_factura = ffIso;
    }
  }

  let plazoNum: number | null = null;
  const plazoStr = cambios.plazo_pago_dias ?? op.plazo_pago_dias;
  if (plazoStr) {
    const n = Number(plazoStr.replace(/\D/g, ""));
    if (plazoPagoRazonable(n)) plazoNum = n;
  }
  if (plazoNum == null && forma) {
    plazoNum = extraerPlazoDias(forma);
    if (plazoNum != null) cambios.plazo_pago_dias = String(plazoNum);
  }

  const formaEnriquecida = enriquecerFormaPagoComercial(
    cambios.forma_pago ?? op.forma_pago,
    plazoNum,
  );
  if (formaEnriquecida && op.forma_pago !== formaEnriquecida) {
    cambios.forma_pago = formaEnriquecida;
  }
}

const CAMPOS_PAIS: OpCampo[] = [
  "pais_origen",
  "pais_adquisicion",
  "pais_procedencia",
  "pais_destino",
];

/** Completa campos de país vacíos fusionando todos los documentos leídos. */
function aplicarOrigenFusionado(
  op: OperationWithClient,
  porDoc: DocConDatos[],
  cambios: Partial<Record<OpCampo, string>>,
): void {
  const fusion = fusionarYCompletarOrigen(porDoc);
  if (!fusion) return;
  for (const campo of CAMPOS_PAIS) {
    const leido = nombrePaisCanonico(
      fusion[campo as keyof typeof fusion],
    );
    if (!leido) continue;
    const previo = String(op[campo] ?? "").trim();
    const pendiente = String(cambios[campo] ?? "").trim();
    if (!previo && !pendiente) cambios[campo] = leido;
  }
}

/* ───────────────────────── Entrada pública ───────────────────────── */

function aplicarCampoReconciliado(
  op: OperationWithClient,
  campo: OpCampo,
  valor: string,
  cambios: Partial<Record<OpCampo, string>>,
): void {
  const previo = String(op[campo] ?? "").trim();
  if (previo !== valor) cambios[campo] = valor;
}

function normValorReconciliacion(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Solo aplica resolución IA si el valor elegido coincide exactamente con un candidato leído. */
function puedeAplicarResolucionIA(
  elegido: ValorElegidoIA,
  candidatos: string[],
  tipoConflicto: "ocr_variante" | "valores_distintos",
): boolean {
  if (!elegido.valor?.trim()) return false;
  if (elegido.naturaleza === "ilegible" || elegido.naturaleza === "real") {
    return false;
  }
  if (elegido.naturaleza !== "ocr" || tipoConflicto === "valores_distintos") {
    return false;
  }
  const v = normValorReconciliacion(elegido.valor);
  return candidatos.some((c) => normValorReconciliacion(c) === v);
}

async function resolverConflictosConCache(
  op: OperationWithClient,
  conflictos: ConflictoDocumentoBatch[],
): Promise<Map<string, ValorElegidoIA | null>> {
  const out = new Map<string, ValorElegidoIA | null>();
  if (conflictos.length === 0) return out;

  const cache = parseResolucionesConflictos(op.resoluciones_conflictos);
  const pendientes: ConflictoDocumentoBatch[] = [];

  for (const c of conflictos) {
    const fp = fingerprintConflicto(c.id, c.candidatos);
    const hit = cache[fp];
    if (hit) {
      out.set(c.id, {
        valor: hit.valor,
        naturaleza: hit.naturaleza,
        motivo: hit.motivo,
        documento: "",
      });
    } else {
      pendientes.push(c);
    }
  }

  if (pendientes.length === 0) return out;

  const resIa = await resolverConflictosDocumentosBatch(pendientes);
  const nuevas: Record<string, ResolucionConflictoPersistida> = {};

  for (const c of pendientes) {
    const r = resIa.get(c.id) ?? null;
    out.set(c.id, r);
    if (r) {
      nuevas[fingerprintConflicto(c.id, c.candidatos)] = {
        valor: r.valor,
        naturaleza: r.naturaleza,
        motivo: r.motivo,
        candidatos: [...c.candidatos],
        at: new Date().toISOString(),
      };
    }
  }

  if (Object.keys(nuevas).length > 0) {
    await mergeResolucionesConflictos(op.user_id, op.id, nuevas);
  }

  return out;
}

/**
 * Cruza documentos con valor legal usando extraccion_ia (sin releer PDFs salvo
 * caché ausente). Conflictos nuevos → IA; los ya resueltos → caché persistida.
 */
export async function reconciliarDocumentosOperacion(
  op: OperationWithClient,
  opts?: ReconciliarOpts,
): Promise<ResultadoReconciliacionDocumentos> {
  const alertas: string[] = [];
  const cambios: Partial<Record<OpCampo, string>> = {};
  let cantidadContenedores = 0;
  let contenedorLista: string | null = null;

  if (!iaDocsDisponible()) {
    return { cambios, alertas, cantidadContenedores: 0, contenedorLista: null };
  }

  const entradas = opts?.entradas ?? (await cargarDocumentosOperacion(op));
  if (entradas.length === 0) {
    return { cambios, alertas, cantidadContenedores: 0, contenedorLista: null };
  }

  const porDoc = await cargarDatosDocumentos(entradas, op, opts);
  if (porDoc.length === 0) {
    return { cambios, alertas, cantidadContenedores: 0, contenedorLista: null };
  }

  const conflictosPendientes: ConflictoDocumentoBatch[] = [];
  const metaConflictos = new Map<string, MetaConflicto>();

  for (const def of CAMPOS_ESCALARES) {
    const det = detectarCampoEscalar(def, porDoc, opts);
    if (det.kind === "vacio") continue;
    if (det.kind === "conflicto") {
      conflictosPendientes.push(det.item);
      metaConflictos.set(det.item.id, {
        label: def.label,
        unicos: det.unicos,
        campo: def.campo,
        tipoConflicto: det.item.tipoConflicto,
      });
      continue;
    }
    const previo = String(op[def.campo] ?? "").trim();
    if (previo !== det.valor) cambios[def.campo] = det.valor;
  }

  // Fecha inválida preexistente (ej. basura manual) y sin lectura nueva → limpiar.
  if (!cambios.eta && fechaCampoInvalida(op.eta)) {
    cambios.eta = "";
  }

  const detContenedores = reconciliarContenedores(porDoc, opts);
  let itemsContenedor: string[] = [];
  let contenedorResueltoPorIA = false;

  if (detContenedores.kind === "valor") {
    itemsContenedor = detContenedores.items;
    if (detContenedores.alertaIncremental) {
      alertas.push(detContenedores.alertaIncremental);
    }
  } else if (detContenedores.kind === "conflicto") {
    conflictosPendientes.push(detContenedores.item);
    metaConflictos.set(detContenedores.item.id, {
      label: CAMPO_LISTA_CONTENEDORES.label,
      unicos: detContenedores.unicos,
      campo: "contenedor",
      esLista: true,
      tipoConflicto: detContenedores.item.tipoConflicto,
    });
  }

  if (conflictosPendientes.length > 0) {
    if (opts?.sinIA) {
      for (const [, m] of metaConflictos) {
        if (m.unicos.length > 0) {
          alertas.push(
            `${m.label} (${m.unicos.join(" / ")}): cruce pendiente entre documentos restantes.`,
          );
        }
      }
    } else {
    const docsMeta = await getDocumentsByOperation(op.id, op.user_id);
    const metaPorId = new Map(docsMeta.map((d) => [d.id, d]));
    await asegurarPdfsConflictos(
      op.user_id,
      porDoc,
      metaPorId,
      conflictosPendientes,
    );
    const resoluciones = await resolverConflictosConCache(
      op,
      conflictosPendientes,
    );

    for (const [id, m] of metaConflictos) {
      const elegido = resoluciones.get(id);

      if (elegido?.naturaleza === "real") {
        alertas.push(
          `${m.label} (${m.unicos.join(" / ")}): valores distintos entre documentos. ` +
            (elegido.motivo || "Revisar en mesa."),
        );
        continue;
      }

      if (
        m.tipoConflicto === "valores_distintos" &&
        (!elegido || elegido.naturaleza !== "ocr")
      ) {
        alertas.push(
          `${m.label} (${m.unicos.join(" / ")}): valores distintos entre documentos. ` +
            (elegido?.motivo ?? "Los documentos muestran valores de negocio distintos."),
        );
        continue;
      }

      if (!elegido?.valor || elegido.naturaleza === "ilegible") {
        if (m.unicos.length > 0) {
          alertas.push(
            `${m.label} (${m.unicos.join(" / ")}): ` +
              "no se pudo leer con certeza; verificar manualmente.",
          );
        }
        continue;
      }

      if (!puedeAplicarResolucionIA(elegido, m.unicos, m.tipoConflicto)) {
        alertas.push(
          `${m.label} (${m.unicos.join(" / ")}): resolución IA no aplicada — ` +
            "revisar en mesa (" +
            (elegido.motivo || "valor no coincide con candidatos leídos") +
            ").",
        );
        continue;
      }

      alertas.push(
        `${m.label}: ${m.unicos.join(" / ")} → ${elegido.valor} (${elegido.motivo}).`,
      );
      if (m.esLista) {
        const items = extraerCodigosContenedor(elegido.valor);
        if (items.length > 0) {
          const { lista, cantidad } = CAMPO_LISTA_CONTENEDORES.persistir(
            items,
            op,
          );
          contenedorLista = lista;
          cantidadContenedores = cantidad;
          contenedorResueltoPorIA = true;
          if (lista && op.contenedor !== lista) cambios.contenedor = lista;
          if (cantidad > 0) {
            const cant = String(cantidad);
            if (op.cantidad_contenedores !== cant) {
              cambios.cantidad_contenedores = cant;
            }
          }
        }
        continue;
      }
      const previo = String(op[m.campo] ?? "").trim();
      if (previo !== elegido.valor) cambios[m.campo] = elegido.valor;
    }
    }
  }

  if (itemsContenedor.length > 0 && !contenedorResueltoPorIA) {
    const { lista, cantidad } = CAMPO_LISTA_CONTENEDORES.persistir(
      itemsContenedor,
      op,
    );
    contenedorLista = lista;
    cantidadContenedores = cantidad;
    if (lista && op.contenedor !== lista) cambios.contenedor = lista;
    if (cantidad > 0) {
      const cant = String(cantidad);
      if (op.cantidad_contenedores !== cant) {
        cambios.cantidad_contenedores = cant;
      }
    }
  }

  aplicarCamposDerivadosPago(op, cambios);
  aplicarOrigenFusionado(op, porDoc, cambios);

  if (Object.keys(cambios).length > 0) {
    await updateOperationCampos(op.user_id, op.id, cambios);
  }

  const docsMeta = await getDocumentsByOperation(op.id, op.user_id);
  await setReconciliacionMeta(
    op.user_id,
    op.id,
    fingerprintDocumentosReconciliacion(docsMeta),
  );

  return { cambios, alertas, cantidadContenedores, contenedorLista };
}

const CAMPOS_EXTRA_DOCUMENTALES: OpCampo[] = [
  "contenedor",
  "cantidad_contenedores",
  "gastos_destino",
  "gastos_origen",
  "puerto_transbordo",
  "tipo_carga",
];

const DOCS_TRANSPORTE = new Set<DocType>([
  "transporte",
  "transporte_borrador",
  "declaracion_transbordo",
]);

function camposRespaldoDocumental(): OpCampo[] {
  const campos = new Set<OpCampo>([
    ...CAMPOS_ESCALARES.map((d) => d.campo),
    ...CAMPOS_EXTRA_DOCUMENTALES,
  ]);
  return [...campos];
}

function docAportaGastosLocales(p: DocConDatos): boolean {
  if (p.docType !== "factura_gastos" && p.docType !== "cotizacion_forwarder") {
    return false;
  }
  const vf = p.datos.comercial?.valor_factura;
  return vf != null && String(vf).trim() !== "" && String(vf).trim() !== "0";
}

function tieneRespaldoEscalar(
  def: DefCampoEscalar,
  porDoc: DocConDatos[],
): boolean {
  return porDoc.some((p) => {
    const v = valorNormalizadoEscalar(def, p);
    return v != null && v !== "";
  });
}

/**
 * Tras borrar documentos: limpia del resumen de la operación todo campo que ya
 * no tenga respaldo en la extracción cacheada de los PDFs que quedan, y vuelve
 * a reconciliar desde esos documentos.
 */
export async function sincronizarOperacionDesdeDocumentosRestantes(
  op: OperationWithClient,
): Promise<ResultadoReconciliacionDocumentos> {
  const entradas = await cargarDocumentosOperacion(op);
  const porDoc =
    entradas.length > 0
      ? await cargarDatosDocumentos(entradas, op)
      : [];

  const limpiar: Partial<Record<OpCampo, string | null>> = {};

  if (porDoc.length === 0) {
    for (const c of camposRespaldoDocumental()) {
      if (String(op[c] ?? "").trim()) limpiar[c] = null;
    }
  } else {
    for (const def of CAMPOS_ESCALARES) {
      const actual = String(op[def.campo] ?? "").trim();
      if (!actual) continue;
      if (!tieneRespaldoEscalar(def, porDoc)) limpiar[def.campo] = null;
    }

    if (String(op.contenedor ?? "").trim()) {
      const hayCont = porDoc.some(
        (p) => CAMPO_LISTA_CONTENEDORES.extraerLista(p.datos).length > 0,
      );
      if (!hayCont) {
        limpiar.contenedor = null;
        limpiar.cantidad_contenedores = null;
      }
    }

    if (String(op.gastos_destino ?? "").trim()) {
      if (!porDoc.some(docAportaGastosLocales)) limpiar.gastos_destino = null;
    }
    if (String(op.gastos_origen ?? "").trim()) {
      if (!porDoc.some(docAportaGastosLocales)) limpiar.gastos_origen = null;
    }

    if (String(op.puerto_transbordo ?? "").trim()) {
      const hayTrans = porDoc.some((p) => DOCS_TRANSPORTE.has(p.docType));
      if (!hayTrans) limpiar.puerto_transbordo = null;
    }

    if (String(op.tipo_carga ?? "").trim()) {
      const hayLog = porDoc.some((p) => {
        const l = p.datos.logistica;
        return Boolean(l?.tipo_contenedor?.trim() || l?.contenedor?.trim());
      });
      if (!hayLog) limpiar.tipo_carga = null;
    }
  }

  if (Object.keys(limpiar).length > 0) {
    await updateOperationCampos(op.user_id, op.id, limpiar);
  }

  if (porDoc.length === 0) {
    const docsMeta = await getDocumentsByOperation(op.id, op.user_id);
    await setReconciliacionMeta(
      op.user_id,
      op.id,
      fingerprintDocumentosReconciliacion(docsMeta),
    );
    return RECON_VACIA;
  }

  const opFresh = (await getOperationById(op.id)) ?? op;
  const recon = await reconciliarDocumentosOperacion(opFresh, { sinIA: true });

  try {
    await leerYAplicarCostosForwarder(opFresh, { soloCache: true });
  } catch {
    /* best-effort */
  }

  return recon;
}
