import "server-only";

import {
  getDocumentsByOperation,
  getOperationById,
  parseHallazgosIA,
  setChecklistItem,
  type OperationWithClient,
  alcanceDelDueno,
} from "@/lib/data";
import { documentoValidoSegunIA, documentoCierraFaltante } from "@/lib/validacion-documento-legal";
import {
  documentosConValorLegal,
  esDocumentoComercialPreliminar,
  pareceBorrador,
  type DocType,
} from "@/lib/docs";
import type { DocumentacionIA } from "@/lib/ia-documentos";
import { claveSubtarea } from "@/lib/workflow";

type EntradaDoc = {
  doc_type: DocType;
  file_name: string;
  extraccion_ia?: string | null;
};

type DestinoChecklist = { etapa: string; subId: string };

/**
 * Documento con valor legal → ítem(s) del checklist que cumple.
 * Un mismo tipo puede tachar más de una etapa (ej. factura comercial en apertura y paso 2).
 */
const DOC_A_CHECKLIST: Partial<Record<DocType, DestinoChecklist[]>> = {
  pedido_compra: [{ etapa: "apertura", subId: "doc_comercial" }],
  proforma: [{ etapa: "apertura", subId: "doc_comercial" }],
  cotizacion_forwarder: [{ etapa: "apertura", subId: "doc_comercial" }],
  factura_comercial: [
    { etapa: "apertura", subId: "doc_comercial" },
    { etapa: "documentacion", subId: "factura" },
  ],
  catalogo: [{ etapa: "apertura", subId: "ficha" }],
  packing_list: [{ etapa: "documentacion", subId: "packing" }],
  certificado_origen: [{ etapa: "documentacion", subId: "origen" }],
  seguro: [{ etapa: "documentacion", subId: "seguro" }],
  transporte: [{ etapa: "embarque", subId: "transporte" }],
  liberacion_transporte: [{ etapa: "embarque", subId: "bl_liberado" }],
  declaracion_transbordo: [{ etapa: "embarque", subId: "transbordo" }],
  factura_gastos: [
    { etapa: "embarque", subId: "aviso_arribo" },
    { etapa: "retiro", subId: "gastos_terminal" },
  ],
  despacho: [{ etapa: "oficializacion", subId: "despacho" }],
  remito: [{ etapa: "retiro", subId: "entregado" }],
};

/** ¿El documento clasificado es el definitivo/legal para tachar el checklist? */
export function documentoAptoParaChecklist(
  docType: DocType,
  fileName: string,
): boolean {
  if (docType === "transporte_borrador" || docType === "otro") return false;

  if (docType === "transporte" && pareceBorrador(fileName)) return false;

  // Preliminares no cierran la factura definitiva del paso 2.
  if (esDocumentoComercialPreliminar(docType)) return true;

  return Boolean(DOC_A_CHECKLIST[docType]?.length);
}

function destinosChecklist(
  docType: DocType,
  fileName: string,
): DestinoChecklist[] {
  const raw = DOC_A_CHECKLIST[docType] ?? [];
  if (esDocumentoComercialPreliminar(docType)) {
    return raw.filter(
      (d) => !(d.etapa === "documentacion" && d.subId === "factura"),
    );
  }
  if (docType === "transporte" && pareceBorrador(fileName)) return [];
  return raw;
}

async function marcar(
  userId: string,
  operationId: string,
  etapa: string,
  subId: string,
  autor: string | null,
  marcados: Set<string>,
): Promise<void> {
  const clave = claveSubtarea(etapa, subId);
  if (marcados.has(clave)) return;
  await setChecklistItem(userId, operationId, clave, true, autor);
  marcados.add(clave);
}

/**
 * Tacha ítems del checklist según documentos con valor legal presentes.
 * Respeta borradores vs definitivos (documentosConValorLegal).
 */
export async function sincronizarChecklistPorDocumentos(
  userId: string,
  operationId: string,
  docs: EntradaDoc[],
  autor: string | null = "ia",
  opts?: {
    op?: Pick<
      OperationWithClient,
      | "pais_origen"
      | "pais_procedencia"
      | "pais_adquisicion"
      | "hallazgos_ia"
      | "via"
    >;
    /** Documento recién analizado (prioridad si trae hallazgos). */
    recienSubido?: {
      docType: DocType;
      fileName: string;
      hallazgos?: { nivel: string; texto: string }[];
    };
  },
): Promise<string[]> {
  const marcados = new Set<string>();
  const legales = documentosConValorLegal(docs);
  const hallazgosMap = parseHallazgosIA(opts?.op?.hallazgos_ia);

  const procesar = async (docType: DocType, fileName: string) => {
    if (!documentoAptoParaChecklist(docType, fileName)) return;

    if (opts?.op) {
      const validez =
        docType === "despacho"
          ? documentoCierraFaltante(
              docType,
              docs,
              hallazgosMap,
              opts.op.via,
            )
          : documentoValidoSegunIA(
              docType,
              docs,
              hallazgosMap,
              opts.op.via,
            );
      if (!validez.valido) {
        for (const d of destinosChecklist(docType, fileName)) {
          await setChecklistItem(
            userId,
            operationId,
            claveSubtarea(d.etapa, d.subId),
            false,
            null,
          );
        }
        return;
      }
    }

    for (const d of destinosChecklist(docType, fileName)) {
      await marcar(userId, operationId, d.etapa, d.subId, autor, marcados);
    }
  };

  if (opts?.recienSubido) {
    const r = opts.recienSubido;
    await procesar(r.docType, r.fileName);
  }

  for (const d of legales) {
    await procesar(d.doc_type, d.file_name);
  }

  return [...marcados];
}

/** Desmarca ítems del checklist que el documento eliminado cubría (si ya no hay reemplazo). */
export async function desmarcarChecklistPorDocumentoEliminado(
  userId: string,
  operationId: string,
  docType: DocType,
  fileName: string,
  docsRestantes: EntradaDoc[],
): Promise<void> {
  const candidatos = destinosChecklist(docType, fileName);
  for (const { etapa, subId } of candidatos) {
    const clave = claveSubtarea(etapa, subId);
    const sigueCubierto = docsRestantes.some((d) =>
      destinosChecklist(d.doc_type, d.file_name).some(
        (x) => claveSubtarea(x.etapa, x.subId) === clave,
      ),
    );
    if (!sigueCubierto) {
      await setChecklistItem(userId, operationId, clave, false, null);
    }
  }
}

/** Campos de operación y validación IA que también cierran ítems del checklist. */
export async function sincronizarChecklistDerivados(
  op: OperationWithClient,
  resultado: DocumentacionIA | null | undefined,
  autor: string | null = "ia",
): Promise<string[]> {
  const marcados = new Set<string>();
  const marcarOp = (etapa: string, subId: string) =>
    marcar(op.user_id, op.id, etapa, subId, autor, marcados);

  if (op.ncm?.trim()) {
    await marcarOp("documentacion", "ncm");
  }

  if (op.incoterm?.trim()) {
    await marcarOp("apertura", "incoterm");
  }

  const docs = await getDocumentsByOperation(op.id, op.user_id);

  if (resultado) {
    if (
      resultado.logistica?.declaracion_transbordo ||
      docs.some((d) => d.doc_type === "declaracion_transbordo")
    ) {
      await marcarOp("embarque", "transbordo");
    }
  }

  return [...marcados];
}

/** Punto único: documentos + derivados de operación/validación. */
export async function actualizarChecklistAutomatico(
  op: OperationWithClient,
  opts?: {
    recienSubido?: {
      docType: DocType;
      fileName: string;
      hallazgos?: { nivel: string; texto: string }[];
    };
    resultadoValidacion?: DocumentacionIA | null;
    autor?: string | null;
  },
): Promise<string[]> {
  const autor = opts?.autor ?? "ia";
  const docs = await getDocumentsByOperation(op.id, op.user_id);
  const porDocs = await sincronizarChecklistPorDocumentos(
    op.user_id,
    op.id,
    docs.map((d) => ({
      doc_type: d.doc_type,
      file_name: d.file_name,
      extraccion_ia: d.extraccion_ia,
    })),
    autor,
    { recienSubido: opts?.recienSubido, op },
  );
  const derivados = await sincronizarChecklistDerivados(
    (await getOperationById(op.id, alcanceDelDueno(op.user_id))) ?? op,
    opts?.resultadoValidacion,
    autor,
  );
  return [...new Set([...porDocs, ...derivados])];
}
