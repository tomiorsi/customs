import "server-only";
import {
  addEvento,
  getDocumentsByOperation,
  getOperationById,
  parseHallazgosIA,
  parseValidacionIA,
  removeHallazgosDocumento,
  clearResolucionesConflictos,
  resolverHallazgosIA,
  setValidacionIA,
  setValidacionEtapa,
  updateOperationEtapa,
  type OperationWithClient,
} from "@/lib/data";
import {
  iaDocsDisponible,
  type Alerta,
  type DocumentacionIA,
  type IntervencionIA,
} from "@/lib/ia-documentos";
import { intervencionesPorNcm, type IntervencionVuce } from "@/lib/vuce";
import {
  docLabelDe,
  docTypeCubreFaltante,
  docsRelevantesIA,
  documentosConValorLegal,
  etapasDocsIA,
  faltantePerteneceSoloEmbarque,
  type DocType,
} from "@/lib/docs";
import { leerYAplicarCostosForwarder } from "@/lib/costos-forwarder-extract";
import { limpiarProvisionalLogistica } from "@/lib/valores-comercial";
import { etapaDef } from "@/lib/workflow";
import { formatRutaOperacion } from "@/lib/ruta-operacion";
import {
  reconciliarDocumentosSiCambio,
  sincronizarOperacionDesdeDocumentosRestantes,
  RECON_VACIA,
  type ResultadoReconciliacionDocumentos,
} from "@/lib/resolucion-documentos";
import {
  cruzarDocumentacionEtapaTexto,
  fusionarCruceEnResultado,
  necesitaCruceTexto,
} from "@/lib/cruce-texto";
import { sanearFaltantesIA } from "@/lib/alertas-validacion";
import { deduplicarFaltantesPorConcepto } from "@/lib/cruce-compatibilidad";
import {
  derivarFaltantesOperacion,
  quitarFaltantesDeterministicos,
} from "@/lib/faltantes-operacion";
import { iaFin, iaInicio } from "@/lib/ia-estado";
import { actualizarChecklistAutomatico, desmarcarChecklistPorDocumentoEliminado } from "@/lib/checklist-documentos";
import { ncmEsPosicionEspecifica } from "@/lib/clasificador/motor";
import {
  documentoCierraFaltante,
  documentoSatisfaceRequisito,
  documentoValidoSegunIA,
} from "@/lib/validacion-documento-legal";

export type EtapaDocumental = "documentacion" | "embarque";

export type ResultadoValidacion =
  | {
      ok: true;
      resultado: DocumentacionIA;
      avanzo?: boolean;
      etapa?: string;
      /** Vista inicial del Paso 3 (faltantes heredados del 2 + transporte). */
      resultadoEmbarque?: DocumentacionIA;
    }
  | { ok: false; error: string; status: number };

type FaltanteDoc = DocumentacionIA["faltantes"][number];

type DocOp = Awaited<ReturnType<typeof getDocumentsByOperation>>[number];

function normFaltante(s: string): string {
  return s.trim().toLowerCase();
}

function fusionarFaltantes(
  base: FaltanteDoc[],
  extra: FaltanteDoc[],
): FaltanteDoc[] {
  const out = [...base];
  for (const f of extra) {
    const nd = normFaltante(f.doc);
    const dup = out.some(
      (x) =>
        normFaltante(x.doc) === nd ||
        normFaltante(x.doc).includes(nd) ||
        nd.includes(normFaltante(x.doc)),
    );
    if (!dup) out.push(f);
  }
  return out;
}

async function ajustarSemaforo(
  op: OperationWithClient,
  etapa: EtapaDocumental,
  resultado: DocumentacionIA,
  docs: DocOp[],
): Promise<void> {
  if (resultado.inconsistencias.length > 0) {
    resultado.estado = "inconsistente";
    resultado.listo_para_oficializar = false;
    return;
  }
  if (etapa === "documentacion") {
    const coreOk = await documentacionCoreLista(op, docs);
    const pendientes = resultado.faltantes.length > 0;
    resultado.listo_para_oficializar =
      coreOk &&
      !pendientes &&
      resultado.inconsistencias.length === 0;
    if (resultado.inconsistencias.length > 0) {
      resultado.estado = "inconsistente";
    } else if (!coreOk || pendientes) {
      resultado.estado = "incompleta";
    } else {
      resultado.estado = "completa";
    }
    return;
  }
  if (resultado.faltantes.length > 0) {
    resultado.estado = "incompleta";
    resultado.listo_para_oficializar = false;
  } else {
    resultado.estado = "completa";
    resultado.listo_para_oficializar = true;
  }
}

/** Saca de faltantes lo que ya está cargado Y es legalmente válido. */
function sincronizarFaltantesConDocumentos(
  resultado: DocumentacionIA,
  docs: DocOp[],
  op: OperationWithClient,
): void {
  const legales = documentosConValorLegal(docs);
  const hallazgosMap = parseHallazgosIA(op.hallazgos_ia);

  resultado.faltantes = resultado.faltantes.filter((f) => {
    for (const d of legales) {
      if (
        !docTypeCubreFaltante(d.doc_type, f, op.via, {
          excluirBorradorSiPideDefinitivo: d.doc_type === "transporte_borrador",
        })
      ) {
        continue;
      }
      if (!documentoCierraFaltante(d.doc_type, docs, hallazgosMap, op.via).valido) {
        continue;
      }
      return false;
    }
    return true;
  });
}

/** Quita faltantes del Paso 3 cuando la etapa es documentación comercial. */
function sanearFaltantesDocumentacion(
  resultado: DocumentacionIA,
  via: string | null,
): void {
  resultado.faltantes = resultado.faltantes.filter(
    (f) => !faltantePerteneceSoloEmbarque(f, via),
  );
}

/** Pendientes comerciales a arrastrar al Paso 3 (desde snapshot del Paso 2). */
async function faltantesComercialesDesdePaso2(
  op: OperationWithClient,
  docResult: DocumentacionIA,
  docs: DocOp[],
): Promise<FaltanteDoc[]> {
  const cruce = quitarFaltantesDeterministicos(docResult.faltantes ?? []);
  const base = structuredClone(docResult) as DocumentacionIA;
  base.faltantes = cruce;

  const derivados = await derivarFaltantesOperacion(op);
  base.faltantes = fusionarFaltantes(derivados, cruce);

  if (!base.intervenciones?.length) {
    const vuce = await intervencionesPorNcm(op.ncm);
    base.intervenciones = vuce.intervenciones.map(aIntervencionIA);
    base.regimenes = vuce.regimenes.map(aIntervencionIA);
    base.intervenciones_fuente = vuce.ncm8 ? "vuce" : "sin_ncm";
  }

  sanearFaltantesDocumentacion(base, op.via);
  sincronizarFaltantesConDocumentos(base, docs, op);
  sanearFaltantesDocumentacion(base, op.via);
  return sanearFaltantesIA(base.faltantes);
}

/** @deprecated Usar faltantesComercialesDesdePaso2 con el resultado del Paso 2. */
async function faltantesComercialesPendientes(
  op: OperationWithClient,
  docs: DocOp[],
): Promise<FaltanteDoc[]> {
  const prevDoc = parseValidacionIA(op.validacion_ia).documentacion
    ?.resultado as DocumentacionIA | undefined;
  if (!prevDoc) return [];
  return faltantesComercialesDesdePaso2(op, prevDoc, docs);
}

/**
 * Re-evalúa qué documentos satisfacen requisitos pendientes (requiere_doc).
 * El CO inválido NO resuelve alertas de otros documentos.
 */
export async function resolverHallazgosDocumentos(
  op: OperationWithClient,
): Promise<void> {
  const docs = await getDocumentsByOperation(op.id, op.user_id);
  const hallazgosMap = parseHallazgosIA(op.hallazgos_ia);
  await resolverHallazgosIA(
    op.user_id,
    op.id,
    docs.map((d) => d.doc_type),
    {
      esValido: (docType) =>
        documentoSatisfaceRequisito(docType, docs, hallazgosMap),
    },
  );
}

/**
 * Tras analizar un PDF: validación inmediata desde caché + cruce texto (Haiku).
 * @deprecated No usar en subida; el cruce es manual vía validarEtapaDocumental.
 */
export async function refrescarValidacionInmediataTrasAnalisis(
  op: OperationWithClient,
  docType: DocType,
): Promise<DocumentacionIA | null> {
  const etapas = etapasValidacionAfectadas(docType);
  let ultima: DocumentacionIA | null = null;
  for (const etapa of etapas) {
    ultima = await actualizarValidacionEtapaDesdeCache(op, etapa, {
      persistir: true,
      forzarCruce: true,
    });
  }
  return ultima;
}

async function consolidarFaltantesEmbarque(
  op: OperationWithClient,
  resultado: DocumentacionIA,
  docs: DocOp[],
  docPaso2?: DocumentacionIA,
): Promise<void> {
  const comercial = docPaso2
    ? await faltantesComercialesDesdePaso2(op, docPaso2, docs)
    : await faltantesComercialesPendientes(op, docs);
  resultado.faltantes = fusionarFaltantes(comercial, resultado.faltantes);
}

/**
 * Punto único: faltantes y semáforo coherentes. Faltantes legales vienen de la IA
 * (cruce normas); sincronizarFaltantesConDocumentos solo tacha lo ya cargado y válido.
 */
async function normalizarResultadoValidacion(
  op: OperationWithClient,
  etapa: EtapaDocumental,
  resultado: DocumentacionIA,
  docs: DocOp[],
  docPaso2?: DocumentacionIA,
): Promise<void> {
  const derivados = await derivarFaltantesOperacion(op);
  resultado.faltantes = quitarFaltantesDeterministicos(resultado.faltantes);
  resultado.faltantes = fusionarFaltantes(derivados, resultado.faltantes);

  if (etapa === "documentacion") {
    sanearFaltantesDocumentacion(resultado, op.via);
  }

  sincronizarFaltantesConDocumentos(resultado, docs, op);

  if (etapa === "documentacion") {
    sanearFaltantesDocumentacion(resultado, op.via);
  }

  if (etapa === "embarque") {
    await consolidarFaltantesEmbarque(op, resultado, docs, docPaso2);
    sincronizarFaltantesConDocumentos(resultado, docs, op);
  }

  resultado.faltantes = sanearFaltantesIA(resultado.faltantes);
  resultado.faltantes = deduplicarFaltantesPorConcepto(resultado.faltantes);

  await ajustarSemaforo(op, etapa, resultado, docs);
}

/** Arma la vista inicial del Paso 3 desde el análisis comercial del Paso 2. */
async function prepararValidacionEmbarqueInicial(
  op: OperationWithClient,
  docResult: DocumentacionIA,
): Promise<DocumentacionIA> {
  const docs = await getDocumentsByOperation(op.id, op.user_id);
  const vuce = await intervencionesPorNcm(op.ncm);
  const comercial = await faltantesComercialesDesdePaso2(op, docResult, docs);

  const out = structuredClone(docResult) as DocumentacionIA;
  out.faltantes = comercial;
  out.intervenciones = vuce.intervenciones.map(aIntervencionIA);
  out.regimenes = vuce.regimenes.map(aIntervencionIA);
  out.intervenciones_fuente = vuce.ncm8 ? "vuce" : "sin_ncm";

  await normalizarResultadoValidacion(op, "embarque", out, docs, docResult);
  if (!out.resumen.trim()) {
    out.resumen =
      "Pendientes de la carpeta (comercial + transporte). Subí cada documento y se irán tachando.";
  }
  return out;
}

/** Factura definitiva + packing + NCM específica (8 díg.): listo para pasar al Paso 3. */
async function documentacionCoreLista(
  op: OperationWithClient,
  docs: Awaited<ReturnType<typeof getDocumentsByOperation>>,
): Promise<boolean> {
  if (!op.ncm?.trim()) return false;
  const ncmOk = await ncmEsPosicionEspecifica(op.ncm);
  if (!ncmOk.ok) return false;
  const legales = documentosConValorLegal(docs);
  const tieneFactura = legales.some((d) => d.doc_type === "factura_comercial");
  const tienePacking = legales.some((d) => d.doc_type === "packing_list");
  return tieneFactura && tienePacking;
}

/** Avanza solo desde documentación cuando el núcleo comercial está cerrado. */
async function avanzarDocumentacionAEmbarque(
  op: OperationWithClient,
): Promise<boolean> {
  if (op.etapa !== "documentacion") return false;
  const docs = await getDocumentsByOperation(op.id, op.user_id);
  if (!(await documentacionCoreLista(op, docs))) return false;

  await limpiarProvisionalLogistica(op.user_id, op.id);
  await updateOperationEtapa(op.user_id, op.id, "embarque");

  const def = etapaDef("embarque", op.tipo);
  await addEvento({
    operationId: op.id,
    userId: op.user_id,
    tipo: "nota",
    titulo: `Avanzó a la etapa: ${def.label}`,
    detalle:
      "Factura, packing y NCM validados: paso automático al transporte y arribo.",
    autor: "ia",
    interno: true,
  });

  return true;
}

/** Convierte una intervención oficial de VUCE al shape que usa la UI. */
function aIntervencionIA(iv: IntervencionVuce): IntervencionIA {
  return {
    organismo: iv.organismo,
    motivo: iv.regimen ?? "",
    nivel: iv.validada ? "requerida" : "verificar",
    resumen: iv.resumen,
    tramites: iv.tramites.map((t) => ({ nombre: t.nombre, link: t.link })),
  };
}

/** Sincroniza comercial/logística/pago desde la operación ya reconciliada. */
function sincronizarCamposDesdeOperacion(
  op: OperationWithClient,
  resultado: DocumentacionIA,
): void {
  const logPrev = resultado.logistica;
  if (op.via) resultado.via = op.via as DocumentacionIA["via"];
  resultado.comercial = {
    valor_factura: op.valor_factura ?? undefined,
    valor_fob: op.valor_fob ?? undefined,
    valor_cif: op.valor_cif ?? undefined,
    flete: op.flete ?? undefined,
    seguro: op.seguro ?? undefined,
    incoterm: op.incoterm ?? undefined,
    moneda: op.moneda ?? undefined,
  };
  const escala = op.puerto_transbordo ?? logPrev?.puerto_transbordo;
  resultado.logistica = {
    ...logPrev,
    tipo_contenedor: op.tipo_contenedor ?? logPrev?.tipo_contenedor,
    cantidad_contenedores:
      op.cantidad_contenedores ?? logPrev?.cantidad_contenedores,
    volumen_cbm: op.volumen_cbm ?? logPrev?.volumen_cbm,
    contenedor: op.contenedor ?? logPrev?.contenedor,
    puerto_transbordo: escala ?? undefined,
    transbordo: logPrev?.transbordo,
    ruta_transbordo:
      logPrev?.ruta_transbordo ??
      formatRutaOperacion({
        origen: op.puerto_origen,
        destino: op.puerto_destino,
        escala: escala ?? op.paso_frontera,
        rutaPreformateada: null,
      }) ??
      undefined,
  };
  resultado.pago = {
    forma_pago: op.forma_pago ?? undefined,
    liberacion_doc: op.liberacion_doc ?? undefined,
    fecha_factura: op.fecha_factura ?? undefined,
    plazo_pago_dias: op.plazo_pago_dias ?? undefined,
  };
}

async function aplicarEnriquecimientoReconciliacion(
  op: OperationWithClient,
  etapa: EtapaDocumental,
  resultado: DocumentacionIA,
  recon: ResultadoReconciliacionDocumentos,
  opts?: { soloCache?: boolean },
): Promise<void> {
  const vuce = await intervencionesPorNcm(op.ncm);
  resultado.intervenciones = vuce.intervenciones.map(aIntervencionIA);
  resultado.regimenes = vuce.regimenes.map(aIntervencionIA);
  resultado.intervenciones_fuente = vuce.ncm8 ? "vuce" : "sin_ncm";

  for (const texto of recon.alertas) {
    if (!resultado.alertas.some((a) => a.texto === texto)) {
      resultado.alertas.push({ nivel: "ok", texto });
    }
  }

  if (etapa === "embarque") {
    try {
      const costos = await leerYAplicarCostosForwarder(op, {
        soloCache: opts?.soloCache,
      });
      if (costos?.campos.gastos_destino || costos?.campos.gastos_origen) {
        const opCostos = (await getOperationById(op.id)) ?? op;
        sincronizarCamposDesdeOperacion(opCostos, resultado);
      }
      const monto =
        costos?.campos.gastos_destino ?? costos?.campos.gastos_origen ?? null;
      if (costos && monto) {
        const moneda = costos.resultado.moneda ?? op.moneda ?? "USD";
        const txt =
          `Aviso/factura de gastos leído: se cargaron gastos reales ` +
          `${moneda} ${monto}. El subtotal de logística usa este dato y ` +
          "reemplaza la estimación.";
        if (!resultado.alertas.some((a) => a.texto === txt)) {
          resultado.alertas.push({ nivel: "ok", texto: txt });
        }
      }
    } catch {
      const txt =
        "No pude leer automáticamente el aviso/factura de gastos. Revisá el monto manualmente antes de cobrar la logística al cliente.";
      if (!resultado.alertas.some((a) => a.texto === txt)) {
        resultado.alertas.push({ nivel: "warn", texto: txt });
      }
    }
  }
}

function construirMensajeCliente(faltantes: FaltanteDoc[]): string {
  if (faltantes.length === 0) return "";
  const lineas = faltantes.map((f) => {
    const motivo = f.motivo?.trim();
    return motivo ? `· ${f.doc}: ${motivo}` : `· ${f.doc}`;
  });
  return (
    "Para avanzar con el despacho, necesitamos que nos envíes o completes:\n" +
    lineas.join("\n")
  );
}

function construirResumenValidacion(
  resultado: DocumentacionIA,
  etapa: EtapaDocumental,
): string {
  if (resultado.inconsistencias.length > 0) {
    return `${resultado.inconsistencias.length} inconsistencia(s) entre documentos; revisar en mesa.`;
  }
  if (resultado.faltantes.length > 0) {
    return `${resultado.faltantes.length} pendiente(s) en ${etapa === "embarque" ? "transporte/arribo" : "documentación comercial"}.`;
  }
  if (resultado.listo_para_oficializar) {
    return etapa === "embarque"
      ? "Carpeta de transporte completa y coherente."
      : "Carpeta comercial cerrada; listo para pasar a transporte.";
  }
  return "Revisá alertas y documentos cargados.";
}

function vacioValidacion(): DocumentacionIA {
  return {
    estado: "incompleta",
    listo_para_oficializar: false,
    resumen: "",
    faltantes: [],
    inconsistencias: [],
    intervenciones: [],
    alertas: [],
    mensaje_cliente: "",
  };
}

/** Etiquetas para detectar menciones al documento borrado en textos persistidos. */
function etiquetasDocumentoBorrado(
  docType: DocType,
  via: string | null,
  fileName?: string,
): string[] {
  const label = docLabelDe(docType, via);
  const raw = [label, docType, docType.replace(/_/g, " ")];
  if (fileName?.trim()) raw.push(fileName.trim());
  return [...new Set(raw.map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 3))];
}

function textoMencionaDocumento(texto: string, etiquetas: string[]): boolean {
  const t = texto.trim().toLowerCase();
  if (!t) return false;
  return etiquetas.some((e) => t.includes(e));
}

/** Saca del resultado de validación cualquier rastro del documento eliminado. */
function purgarResultadoValidacionDeDocumento(
  resultado: DocumentacionIA,
  etiquetas: string[],
): DocumentacionIA {
  const out = structuredClone(resultado) as DocumentacionIA;
  out.faltantes = out.faltantes.filter(
    (f) =>
      !textoMencionaDocumento(f.doc, etiquetas) &&
      !textoMencionaDocumento(f.motivo ?? "", etiquetas),
  );
  out.inconsistencias = out.inconsistencias.filter(
    (s) => !textoMencionaDocumento(s, etiquetas),
  );
  out.alertas = out.alertas.filter((a) => !textoMencionaDocumento(a.texto, etiquetas));
  if (textoMencionaDocumento(out.mensaje_cliente ?? "", etiquetas)) {
    out.mensaje_cliente = "";
  }
  if (textoMencionaDocumento(out.resumen ?? "", etiquetas)) {
    out.resumen = "";
  }
  return out;
}

/** Elimina validación de etapas del doc y purga menciones en el resto. */
async function purgarValidacionOperacionDeDocumento(
  ownerId: string,
  operationId: string,
  docType: DocType,
  via: string | null,
  fileName: string,
  quedaMismoTipo: boolean,
): Promise<void> {
  const op = await getOperationById(operationId);
  if (!op) return;

  const mapa = parseValidacionIA(op.validacion_ia);
  const etiquetas = etiquetasDocumentoBorrado(
    docType,
    via,
    quedaMismoTipo ? fileName : undefined,
  );
  let cambio = false;

  if (!quedaMismoTipo) {
    for (const etapa of etapasValidacionAfectadas(docType)) {
      if (etapa in mapa) {
        delete mapa[etapa];
        cambio = true;
      }
    }
  }

  for (const [etapa, entry] of Object.entries(mapa)) {
    const prev = entry?.resultado as DocumentacionIA | undefined;
    if (!prev) continue;
    const antes = JSON.stringify(prev);
    const limpio = purgarResultadoValidacionDeDocumento(prev, etiquetas);
    const huboCambio = JSON.stringify(limpio) !== antes;
    const vacio =
      limpio.faltantes.length === 0 &&
      limpio.inconsistencias.length === 0 &&
      limpio.alertas.length === 0 &&
      !limpio.mensaje_cliente?.trim() &&
      !limpio.resumen?.trim();
    if (vacio) {
      delete mapa[etapa];
      cambio = true;
    } else if (huboCambio) {
      mapa[etapa] = { ...entry, resultado: limpio };
      cambio = true;
    }
  }

  if (cambio) {
    await setValidacionIA(ownerId, operationId, mapa);
  }
}

/**
 * Arma la validación de una etapa SIN releer PDFs: hallazgos_ia,
 * extraccion_ia, cruce texto (Haiku) y requisitos de checklist en código.
 */
export async function actualizarValidacionEtapaDesdeCache(
  op: OperationWithClient,
  etapa: EtapaDocumental,
  opts?: {
    recon?: ResultadoReconciliacionDocumentos;
    persistir?: boolean;
    forzarCruce?: boolean;
    /** Sin llamada cruce-texto (p. ej. tras borrar un documento). */
    sinCruce?: boolean;
    /** No reutilizar validación previa (p. ej. tras borrar un documento). */
    desdeCero?: boolean;
  },
): Promise<DocumentacionIA> {
  const docs = await getDocumentsByOperation(op.id, op.user_id);

  const prev =
    opts?.desdeCero || opts?.forzarCruce
      ? undefined
      : (parseValidacionIA(op.validacion_ia)[etapa]
          ?.resultado as DocumentacionIA | undefined);
  const resultado = prev ? structuredClone(prev) : vacioValidacion();
  resultado.inconsistencias = [];
  resultado.alertas = [];
  resultado.faltantes = [];
  if (opts?.forzarCruce || opts?.desdeCero) {
    resultado.estado = "incompleta";
    resultado.listo_para_oficializar = false;
  }

  const recon =
    opts?.recon ??
    (await reconciliarDocumentosSiCambio(op)).recon;

  if (
    !opts?.sinCruce &&
    opts?.forzarCruce
  ) {
    const cruce = await cruzarDocumentacionEtapaTexto(op, etapa, docs);
    if (cruce) fusionarCruceEnResultado(resultado, cruce);
  }

  let opFresh = (await getOperationById(op.id)) ?? op;
  await aplicarEnriquecimientoReconciliacion(opFresh, etapa, resultado, recon, {
    soloCache: true,
  });
  opFresh = (await getOperationById(op.id)) ?? opFresh;
  sincronizarCamposDesdeOperacion(opFresh, resultado);

  const docPaso2 = parseValidacionIA(op.validacion_ia).documentacion
    ?.resultado as DocumentacionIA | undefined;
  await normalizarResultadoValidacion(
    opFresh,
    etapa,
    resultado,
    docs,
    docPaso2,
  );

  resultado.mensaje_cliente = construirMensajeCliente(resultado.faltantes);
  resultado.resumen = construirResumenValidacion(resultado, etapa);

  if (opts?.persistir !== false) {
    try {
      await setValidacionEtapa(op.user_id, op.id, etapa, resultado);
    } catch {
      /* best-effort */
    }
  }

  return resultado;
}

const CAMPOS_DISPARAN_PENDIENTES = new Set([
  "ncm",
  "pais_origen",
  "pais_procedencia",
  "pais_destino",
]);

/**
 * Recalcula faltantes VUCE/ROM/NCM sin cruce IA ($0 extra).
 * Llamar al confirmar NCM u origen en Paso 2.
 */
export async function refrescarPendientesOperacion(
  op: OperationWithClient,
): Promise<DocumentacionIA | null> {
  const docs = await getDocumentsByOperation(op.id, op.user_id);
  const prev = parseValidacionIA(op.validacion_ia).documentacion
    ?.resultado as DocumentacionIA | undefined;
  const resultado = prev ? structuredClone(prev) : vacioValidacion();

  const vuce = await intervencionesPorNcm(op.ncm);
  resultado.intervenciones = vuce.intervenciones.map(aIntervencionIA);
  resultado.regimenes = vuce.regimenes.map(aIntervencionIA);
  resultado.intervenciones_fuente = vuce.ncm8 ? "vuce" : "sin_ncm";

  await normalizarResultadoValidacion(op, "documentacion", resultado, docs);
  resultado.mensaje_cliente = construirMensajeCliente(resultado.faltantes);
  resultado.resumen = construirResumenValidacion(resultado, "documentacion");

  try {
    await setValidacionEtapa(op.user_id, op.id, "documentacion", resultado);
    await actualizarChecklistAutomatico(
      (await getOperationById(op.id)) ?? op,
      { resultadoValidacion: resultado },
    );
  } catch {
    /* best-effort */
  }

  return resultado;
}

export function camposDisparanPendientes(
  campos: Partial<Record<string, string | null>>,
): boolean {
  return Object.keys(campos).some((k) => CAMPOS_DISPARAN_PENDIENTES.has(k));
}

/** Refresca la validación cruzada de una etapa (sin releer PDFs). Corre automáticamente al subir. */
export async function validarEtapaDocumental(
  op: OperationWithClient,
  etapa: EtapaDocumental,
): Promise<ResultadoValidacion> {
  const docs = await getDocumentsByOperation(op.id, op.user_id);
  if (docs.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "Todavía no hay documentos cargados en la operación.",
    };
  }

  const relevantes = docsRelevantesIA(etapa);
  const hayRelevantes = documentosConValorLegal(docs).some((d) =>
    relevantes.has(d.doc_type),
  );
  if (!hayRelevantes && etapa === "documentacion") {
    return {
      ok: false,
      status: 400,
      error:
        "Todavía no hay documentos de clasificación (factura, packing, origen) para analizar en esta etapa.",
    };
  }

  const resultado = await actualizarValidacionEtapaDesdeCache(op, etapa, {
    forzarCruce: true,
  });

  try {
    const opFresh = await getOperationById(op.id);
    if (opFresh) {
      await actualizarChecklistAutomatico(opFresh, {
        resultadoValidacion: resultado,
      });
    }
  } catch {
    /* best-effort */
  }

  return {
    ok: true,
    resultado,
  };
}

/** Deriva la etapa documental a validar a partir de la etapa interna actual. */
export function etapaDocumentalDe(etapaInterna: string): EtapaDocumental {
  return etapaInterna === "embarque" ? "embarque" : "documentacion";
}

/**
 * Borra el resultado de cruce guardado cuando entra un documento nuevo, para que
 * el paso 2 no muestre faltantes/inconsistencias de una validación anterior.
 */
export async function invalidarValidacionCruzadaPorSubida(
  userId: string,
  operationId: string,
  docType: DocType,
): Promise<void> {
  const op = await getOperationById(operationId);
  if (!op) return;
  const mapa = parseValidacionIA(op.validacion_ia);
  let cambio = false;
  for (const etapa of etapasValidacionAfectadas(docType)) {
    if (mapa[etapa]) {
      delete mapa[etapa];
      cambio = true;
    }
  }
  if (cambio) await setValidacionIA(userId, operationId, mapa);
}

export function etapasValidacionAfectadas(docType: DocType): EtapaDocumental[] {
  return etapasDocsIA(docType).filter(
    (e): e is EtapaDocumental => e === "documentacion" || e === "embarque",
  );
}

/**
 * Post-subida: reconcilia campos, checklist y cruce normativo automático.
 */
export async function procesarPostSubidaDocumento(
  op: OperationWithClient,
  docRecienSubidoId: string,
): Promise<void> {
  const docs = await getDocumentsByOperation(op.id, op.user_id);
  const subido = docs.find((d) => d.id === docRecienSubidoId);
  if (!subido) return;

  if (iaDocsDisponible()) {
    try {
      await reconciliarDocumentosSiCambio(op, { docRecienSubidoId });
    } catch {
      /* best-effort */
    }
  }

  try {
    await leerYAplicarCostosForwarder(op, { soloCache: true });
  } catch {
    /* best-effort */
  }

  if (iaDocsDisponible()) {
    const etapas = etapasValidacionAfectadas(subido.doc_type);
    for (const etapa of etapas) {
      try {
        await validarEtapaDocumental(op, etapa);
      } catch {
        /* best-effort */
      }
    }
  }

  try {
    const opCheck = (await getOperationById(op.id)) ?? op;
    await actualizarChecklistAutomatico(opCheck);
  } catch {
    /* best-effort */
  }
}

const postSubidaPendiente = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; docId: string }
>();

/** Cancela el debounce de post-subida (p. ej. si borraron el documento). */
export function cancelarPostSubidaPendiente(operationId: string): void {
  const previo = postSubidaPendiente.get(operationId);
  if (previo) {
    clearTimeout(previo.timer);
    postSubidaPendiente.delete(operationId);
  }
}

/** Debounce ~3s tras subir: reconciliar campos + checklist. Sin cruce IA. */
export function programarPostSubidaDocumento(
  op: OperationWithClient,
  docRecienSubidoId: string,
  opts?: { delayMs?: number },
): void {
  if (!iaDocsDisponible()) return;
  const clave = op.id;
  const delayMs = opts?.delayMs ?? 3000;
  const previo = postSubidaPendiente.get(clave);
  if (previo) clearTimeout(previo.timer);
  const token = "reconciliar-docs";
  iaInicio(op.id, token);
  const operationId = op.id;
  const t = setTimeout(() => {
    postSubidaPendiente.delete(clave);
    void (async () => {
      try {
        const fresh = await getOperationById(operationId);
        if (fresh) await procesarPostSubidaDocumento(fresh, docRecienSubidoId);
      } catch {
        /* best-effort */
      } finally {
        iaFin(operationId, token);
      }
    })();
  }, delayMs);
  if (typeof t.unref === "function") t.unref();
  postSubidaPendiente.set(clave, { timer: t, docId: docRecienSubidoId });
}

/**
 * Elimina todo rastro del documento borrado y recalcula desde lo que queda (sin IA).
 */
export async function procesarEliminacionDocumento(args: {
  ownerId: string;
  operationId: string;
  docType: DocType;
  fileName: string;
}): Promise<void> {
  cancelarPostSubidaPendiente(args.operationId);

  const docs = await getDocumentsByOperation(args.operationId, args.ownerId);
  const quedaMismoTipo = docs.some((d) => d.doc_type === args.docType);

  if (!quedaMismoTipo) {
    await removeHallazgosDocumento(
      args.ownerId,
      args.operationId,
      args.docType,
    );
  }

  const opResolucion = await getOperationById(args.operationId);
  if (opResolucion) {
    await resolverHallazgosDocumentos(opResolucion);
  }

  await clearResolucionesConflictos(args.ownerId, args.operationId);

  let op = await getOperationById(args.operationId);
  if (!op) return;

  await purgarValidacionOperacionDeDocumento(
    args.ownerId,
    args.operationId,
    args.docType,
    op.via,
    args.fileName,
    quedaMismoTipo,
  );

  op = (await getOperationById(args.operationId)) ?? op;

  try {
    await desmarcarChecklistPorDocumentoEliminado(
      args.ownerId,
      args.operationId,
      args.docType,
      args.fileName,
      docs.map((d) => ({ doc_type: d.doc_type, file_name: d.file_name })),
    );
  } catch {
    /* best-effort */
  }

  let recon: ResultadoReconciliacionDocumentos = RECON_VACIA;
  try {
    recon = await sincronizarOperacionDesdeDocumentosRestantes(op);
  } catch {
    /* best-effort */
  }

  op = (await getOperationById(args.operationId)) ?? op;

  const etapas = new Set<EtapaDocumental>([
    etapaDocumentalDe(op.etapa),
    ...etapasValidacionAfectadas(args.docType).filter(
      (e): e is EtapaDocumental => e === "documentacion" || e === "embarque",
    ),
  ]);

  for (const etapa of etapas) {
    try {
      await actualizarValidacionEtapaDesdeCache(op, etapa, {
        recon,
        sinCruce: true,
        desdeCero: true,
      });
    } catch {
      /* best-effort */
    }
    op = (await getOperationById(args.operationId)) ?? op;
  }

  try {
    const val = parseValidacionIA(op.validacion_ia);
    const etapaVista = etapaDocumentalDe(op.etapa);
    const resultado = val[etapaVista]?.resultado as DocumentacionIA | undefined;
    await actualizarChecklistAutomatico(op, { resultadoValidacion: resultado });
  } catch {
    /* best-effort */
  }

  if (etapasDocsIA(args.docType).includes("apertura")) {
    try {
      await leerYAplicarCostosForwarder(op, { soloCache: true });
    } catch {
      /* best-effort */
    }
  }
}

/** @deprecated Usar actualizarValidacionEtapaDesdeCache. */
export async function actualizarValidacionTrasSubida(
  op: OperationWithClient,
): Promise<void> {
  const etapa = etapaDocumentalDe(op.etapa);
  await actualizarValidacionEtapaDesdeCache(op, etapa);
}
