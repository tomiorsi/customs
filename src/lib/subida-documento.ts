import "server-only";

import {
  getDocumentById,
  getOperationById,
  setDocumentExtraccion,
  setHallazgosDocumento,
  updateDocumentTipo,
  type OperationWithClient,
  alcanceDelDueno,
} from "@/lib/data";
import {
  DOC_ETAPA_DE,
  docLabelDe,
  type DocType,
} from "@/lib/docs";
import {
  analizarDocumentoSubidoCompleto,
  type ArchivoIA,
} from "@/lib/ia-documentos";
import { iaFin, iaInicio } from "@/lib/ia-estado";
import { contextoOperacionIA } from "@/lib/marco-validacion";
import { esOperacionExportacion } from "@/lib/operacion-aduana";
import { evaluarHallazgosDocumentoSubido, resumenCruceDespacho, vaciosVisiblesUsuario } from "@/lib/hallazgos-documento";
import { clasificarDocumentoPorContenido } from "@/lib/clasificar-documento";
import { lecturaTieneContenido } from "@/lib/ia-extraccion";
import { actualizarChecklistAutomatico } from "@/lib/checklist-documentos";
import { invalidarCacheContextoValidacion } from "@/lib/marco-validacion";
import {
  resolverHallazgosDocumentos,
  procesarPostSubidaDocumento,
} from "@/lib/validacion-doc";

export type ContextoSubidaDocumento = {
  operationId: string;
  docId: string;
  userId: string;
  storedName: string;
  fileName: string;
  fileSize: number;
  mediaType: string;
  base64: string;
  docTypeProvisional: DocType;
  tipoManual: DocType | null;
};

export function encolarAnalisisDocumentoSubido(
  op: OperationWithClient,
  ctx: ContextoSubidaDocumento,
): void {
  // No usar solo after(): en dev a veces no corre y la UI queda con caché vieja.
  void procesarAnalisisDocumentoSubido(op, ctx).catch((err) => {
    console.error(
      `[IA] analisis post-subida falló · op=${ctx.operationId} · ${ctx.fileName}:`,
      err,
    );
  });
}

/** Subida: lectura + interpretación por documento. Sin cruce normativo. */
export async function procesarAnalisisDocumentoSubido(
  op: OperationWithClient,
  ctx: ContextoSubidaDocumento,
): Promise<void> {
  const token = `doc:${ctx.docId}`;
  iaInicio(op.id, token);

  try {
    const archivo: ArchivoIA = {
      rol: "documento a clasificar",
      nombre: ctx.fileName,
      mediaType: ctx.mediaType,
      base64: ctx.base64,
    };

    const analisis = await analizarDocumentoSubidoCompleto(archivo, {
      tipoConocido: ctx.tipoManual,
      contextoOperacion: contextoOperacionIA(op),
      esImportacion: !esOperacionExportacion(op.tipo),
    });

    const docVivo = await getDocumentById(ctx.docId, alcanceDelDueno(ctx.userId));
    if (!docVivo) return;

    const docTypeManual = ctx.tipoManual;
    let docType = docVivo.doc_type;

    if (!docTypeManual) {
      const textoLeido =
        typeof analisis.lectura_bruta === "object" &&
        analisis.lectura_bruta &&
        "texto" in analisis.lectura_bruta
          ? String(analisis.lectura_bruta.texto ?? "")
          : "";
      if (lecturaTieneContenido({ texto: textoLeido, pares: [], tablas: [] })) {
        const clasificado = await clasificarDocumentoPorContenido({
          texto: textoLeido,
          nombreArchivo: ctx.fileName,
          resumen: analisis.resumen,
        });
        if (clasificado !== "otro") {
          docType = clasificado;
          await updateDocumentTipo(ctx.userId, ctx.docId, docType);
        }
      }
    } else {
      docType = docTypeManual;
    }

    try {
      await setDocumentExtraccion(
        ctx.userId,
        ctx.docId,
        ctx.storedName,
        ctx.fileSize,
        {
          datos: analisis.datos,
          lectura_bruta: analisis.lectura_bruta,
          vacios_interpretacion: analisis.vacios_interpretacion,
          tipo: docType,
          resumen: analisis.resumen,
        },
      );
      invalidarCacheContextoValidacion();
    } catch {
      /* best-effort */
    }

    const textoLeido =
      typeof analisis.lectura_bruta === "object" &&
      analisis.lectura_bruta &&
      "texto" in analisis.lectura_bruta
        ? String(analisis.lectura_bruta.texto ?? "")
        : "";

    const hallazgosFinales = await evaluarHallazgosDocumentoSubido(
      op,
      {
        docType,
        fileName: ctx.fileName,
        lectura: textoLeido,
        datos: analisis.datos,
        vacios: vaciosVisiblesUsuario(analisis.vacios_interpretacion),
      },
    );

    await setHallazgosDocumento(ctx.userId, op.id, docType, {
      doc: docLabelDe(docType, op.via),
      etapa: DOC_ETAPA_DE[docType] ?? "documentacion",
      resumen:
        docType === "despacho"
          ? resumenCruceDespacho(hallazgosFinales)
          : analisis.resumen,
      at: new Date().toISOString(),
      hallazgos: hallazgosFinales,
    });

    const opHallazgos = await getOperationById(op.id, alcanceDelDueno(op.user_id));
    if (opHallazgos) {
      await resolverHallazgosDocumentos(opHallazgos);
    }

    const opChecklist = await getOperationById(op.id, alcanceDelDueno(op.user_id));
    if (opChecklist) {
      await actualizarChecklistAutomatico(opChecklist, {
        recienSubido: {
          docType,
          fileName: ctx.fileName,
          hallazgos: hallazgosFinales,
        },
      }).catch(() => {});
    }

    const opPost = await getOperationById(op.id, alcanceDelDueno(op.user_id));
    if (opPost) {
      await procesarPostSubidaDocumento(opPost, ctx.docId).catch(() => {});
    }
  } catch (err) {
    console.error(
      `[IA] procesarAnalisisDocumentoSubido · op=${op.id} · ${ctx.fileName}:`,
      err,
    );
  } finally {
    iaFin(op.id, token);
  }
}
