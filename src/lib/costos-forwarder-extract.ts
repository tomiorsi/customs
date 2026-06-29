import "server-only";

import {
  getDocumentsByOperation,
  updateOperationCampos,
  type DocumentRow,
  type OpCampo,
  type OperationRow,
} from "@/lib/data";
import { documentosConValorLegal, type DocType } from "@/lib/docs";
import { rawDatosDesdeCache } from "@/lib/extraccion-doc-cache";
import {
  iaDocsDisponible,
  normalizarDatosDocumentoOperacion,
  type CostosForwarderIA,
  type DatosDocumentoOperacion,
} from "@/lib/ia-documentos";

function fmt(n: number | null | undefined): string | null {
  return n != null && Number.isFinite(n) && n > 0 ? String(n) : null;
}

function sumar(...xs: Array<number | null | undefined>): number {
  return xs.reduce<number>(
    (s, x) => s + (x != null && Number.isFinite(x) ? x : 0),
    0,
  );
}

function parseMonto(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  let s = String(v).replace(/[^\d.,-]/g, "").trim();
  if (!s) return null;
  const coma = s.includes(",");
  const punto = s.includes(".");
  if (coma && punto) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (coma) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function docTieneMontosComerciales(docType: DocType, datos: DatosDocumentoOperacion): boolean {
  const c = datos.comercial;
  const tieneFleteSeguro = !!(parseMonto(c?.flete) || parseMonto(c?.seguro));
  const totalGastos =
    docType === "factura_gastos" || docType === "cotizacion_forwarder"
      ? parseMonto(c?.valor_factura)
      : null;
  return tieneFleteSeguro || totalGastos != null;
}

export type CostosForwarderAplicado = {
  resultado: CostosForwarderIA;
  campos: Partial<Record<OpCampo, string | null>>;
  desdeCache?: boolean;
};

function camposDesdeResultado(
  op: OperationRow,
  resultado: CostosForwarderIA,
): Partial<Record<OpCampo, string | null>> {
  const esExpo = op.tipo.toLowerCase().startsWith("exp");
  const campos: Partial<Record<OpCampo, string | null>> = {};

  if (resultado.via !== "desconocida" && !op.via) campos.via = resultado.via;
  if (resultado.incoterm && !op.incoterm) campos.incoterm = resultado.incoterm;
  if (resultado.moneda && !op.moneda) campos.moneda = resultado.moneda;

  const flete = fmt(resultado.flete);
  if (flete) campos.flete = flete;

  const seguro = fmt(resultado.seguro);
  if (seguro) campos.seguro = seguro;

  const gastosLocales =
    resultado.totalGastosLocales && resultado.totalGastosLocales > 0
      ? resultado.totalGastosLocales
      : esExpo
        ? sumar(
            resultado.gastosOrigen,
            resultado.gastosDocumentales,
            resultado.ivaGastos,
          )
        : sumar(
            resultado.gastosDestino,
            resultado.gastosDocumentales,
            resultado.ivaGastos,
          );

  if (gastosLocales > 0) {
    if (esExpo) campos.gastos_origen = String(gastosLocales);
    else campos.gastos_destino = String(gastosLocales);
  }

  return campos;
}

function costosDesdeCacheDocumentos(
  op: OperationRow,
  docs: DocumentRow[],
  porDoc: Map<string, DatosDocumentoOperacion>,
): CostosForwarderIA | null {
  const ordenados = [...docs]
    .filter((d) => {
      const datos = porDoc.get(d.id);
      return datos && docTieneMontosComerciales(d.doc_type, datos);
    })
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  if (ordenados.length === 0) return null;

  const esExpo = op.tipo.toLowerCase().startsWith("exp");
  let flete: number | null = null;
  let seguro: number | null = null;
  let incoterm: string | null = null;
  let moneda: string | null = null;
  let via: CostosForwarderIA["via"] = "desconocida";
  let tipoDoc: CostosForwarderIA["tipo_documento"] = "desconocido";
  let gastosDestino: number | null = null;
  let gastosOrigen: number | null = null;
  const resumenes: string[] = [];

  for (const doc of ordenados) {
    const datos = porDoc.get(doc.id);
    if (!datos) continue;
    const c = datos.comercial;
    if (tipoDoc === "desconocido") {
      tipoDoc =
        doc.doc_type === "factura_gastos"
          ? "factura_gastos"
          : doc.doc_type === "cotizacion_forwarder"
            ? "cotizacion_forwarder"
            : doc.doc_type === "seguro"
              ? "seguro"
              : "desconocido";
    }
    if (c?.flete != null && flete == null) flete = parseMonto(c.flete);
    if (c?.seguro != null && seguro == null) seguro = parseMonto(c.seguro);
    if (c?.incoterm && !incoterm) incoterm = c.incoterm.trim() || null;
    if (c?.moneda && !moneda) moneda = c.moneda.trim() || null;
    if (datos.via && via === "desconocida") {
      via = datos.via as CostosForwarderIA["via"];
    }

    const totalDoc =
      doc.doc_type === "factura_gastos" || doc.doc_type === "cotizacion_forwarder"
        ? parseMonto(c?.valor_factura)
        : null;
    if (totalDoc != null) {
      if (esExpo) gastosOrigen = (gastosOrigen ?? 0) + totalDoc;
      else gastosDestino = (gastosDestino ?? 0) + totalDoc;
      resumenes.push(`${doc.file_name}: total ${totalDoc}`);
    } else if (c?.flete || c?.seguro) {
      resumenes.push(
        `${doc.file_name} (${doc.doc_type}): flete=${c?.flete ?? "—"} seguro=${c?.seguro ?? "—"}`,
      );
    }
  }

  const totalGastosLocales = esExpo ? gastosOrigen : gastosDestino;
  const tieneAlgo =
    flete != null ||
    seguro != null ||
    incoterm ||
    moneda ||
    (totalGastosLocales != null && totalGastosLocales > 0);
  if (!tieneAlgo) return null;

  return {
    tipo_documento: tipoDoc,
    resumen: `Costos desde extracción al subir (${resumenes.join("; ")})`,
    direccion: esExpo ? "exportacion" : "importacion",
    via,
    incoterm,
    moneda,
    flete,
    seguro,
    seguroIncluido: seguro != null,
    seguroNoIncluido: false,
    gastosOrigen,
    gastosDestino,
    gastosDocumentales: null,
    ivaGastos: null,
    totalGastosLocales,
    lineas: [],
    contingencias: [],
    alertas: [
      {
        nivel: "ok",
        texto: "Costos tomados de extraccion_ia cacheada (sin releer PDF).",
      },
    ],
  };
}

/**
 * Aplica costos logísticos desde extraccion_ia de cualquier documento con montos.
 * No relee PDFs: la extracción al subir es la fuente única.
 */
export async function leerYAplicarCostosForwarder(
  op: OperationRow,
  _opts?: { soloCache?: boolean },
): Promise<CostosForwarderAplicado | null> {
  if (!iaDocsDisponible()) return null;

  const docs = documentosConValorLegal(
    await getDocumentsByOperation(op.id, op.user_id),
  );
  if (docs.length === 0) return null;

  const porDoc = new Map<string, DatosDocumentoOperacion>();
  for (const d of docs) {
    const raw = rawDatosDesdeCache(d);
    if (raw) {
      porDoc.set(d.id, normalizarDatosDocumentoOperacion({ datos: raw }));
    }
  }

  const resultado = costosDesdeCacheDocumentos(op, docs, porDoc);
  if (!resultado) return null;

  const campos = camposDesdeResultado(op, resultado);
  if (Object.keys(campos).length > 0) {
    await updateOperationCampos(op.user_id, op.id, campos);
  }

  return {
    resultado,
    campos,
    desdeCache: true,
  };
}
