/**
 * ¿Un documento subido cierra un requisito? Solo según hallazgos_ia (IA al subir).
 * warn y error bloquean validez; solo ok cierra requisitos.
 */

import { docLabelDe, documentosConValorLegal, type DocType } from "@/lib/docs";
import type { HallazgoDocItem, HallazgosIA } from "@/lib/data";
import { extraccionDocVigente, parseExtraccionDoc } from "@/lib/data";

export type ResultadoValidacionDoc = {
  valido: boolean;
  motivo?: string;
};

export type DocEntrada = {
  doc_type: DocType;
  file_name: string;
  extraccion_ia?: string | null;
  stored_name?: string;
  size?: number | null;
};

function cacheTieneLectura(cache: ReturnType<typeof parseExtraccionDoc>): boolean {
  const bruta = cache?.lectura_bruta;
  if (!bruta || typeof bruta !== "object") return false;
  const o = bruta as { texto?: string; pares?: unknown[]; tablas?: unknown[] };
  if (String(o.texto ?? "").trim().length > 20) return true;
  if (Array.isArray(o.pares) && o.pares.length > 0) return true;
  if (Array.isArray(o.tablas) && o.tablas.length > 0) return true;
  return false;
}

function evaluarHallazgosIA(
  hallazgos?: HallazgoDocItem[],
  doc?: DocEntrada,
  opts?: { warnBloquea?: boolean },
): ResultadoValidacionDoc {
  const warnBloquea = opts?.warnBloquea !== false;
  if (!hallazgos?.length) {
    if (doc?.extraccion_ia) {
      const cache = parseExtraccionDoc(doc.extraccion_ia);
      if (
        extraccionDocVigente(
          { stored_name: doc.stored_name ?? "", size: doc.size ?? null },
          cache,
        ) &&
        (cache?.datos != null || cacheTieneLectura(cache))
      ) {
        return { valido: true };
      }
    }
    return {
      valido: false,
      motivo: "Documento cargado: pendiente análisis.",
    };
  }
  const error = hallazgos.find((h) => h.nivel === "error");
  if (error) {
    return { valido: false, motivo: error.texto };
  }
  if (warnBloquea) {
    const warn = hallazgos.find((h) => h.nivel === "warn");
    if (warn) {
      return { valido: false, motivo: warn.texto };
    }
  }
  return { valido: true };
}

/** ¿El documento de este tipo fue analizado por IA sin errores ni observaciones bloqueantes? */
export function documentoValidoSegunIA(
  docType: DocType,
  docs: DocEntrada[],
  hallazgosMap?: HallazgosIA,
  via?: string | null,
): ResultadoValidacionDoc {
  const legales = documentosConValorLegal(docs);
  const doc = legales.find((d) => d.doc_type === docType);
  if (!doc) {
    return {
      valido: false,
      motivo: `Falta ${docLabelDe(docType, via ?? null)}.`,
    };
  }
  return evaluarHallazgosIA(hallazgosMap?.[docType]?.hallazgos, doc, {
    warnBloquea: true,
  });
}

/**
 * ¿El documento subido alcanza para tachar un ítem de "documentación faltante"?
 * Solo error bloquea; warn queda en hallazgos pero no mantiene el pendiente.
 */
export function documentoCierraFaltante(
  docType: DocType,
  docs: DocEntrada[],
  hallazgosMap?: HallazgosIA,
  via?: string | null,
): ResultadoValidacionDoc {
  const legales = documentosConValorLegal(docs);
  const doc = legales.find((d) => d.doc_type === docType);
  if (!doc) {
    return {
      valido: false,
      motivo: `Falta ${docLabelDe(docType, via ?? null)}.`,
    };
  }
  return evaluarHallazgosIA(hallazgosMap?.[docType]?.hallazgos, doc, {
    warnBloquea: false,
  });
}

/** ¿Este tipo satisface requisitos pendientes de otros docs (requiere_doc)? */
export function documentoSatisfaceRequisito(
  docType: string,
  docs: DocEntrada[],
  hallazgosMap?: HallazgosIA,
): boolean {
  const dt = docType as DocType;
  if (!docs.some((d) => d.doc_type === dt)) return false;
  return documentoValidoSegunIA(dt, docs, hallazgosMap).valido;
}
