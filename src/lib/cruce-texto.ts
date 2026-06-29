import "server-only";

import { parseReconciliacionMeta, type OperationWithClient } from "@/lib/data";
import {
  docLabelDe,
  docsRelevantesIA,
  documentosConValorLegal,
  transporteLabel,
} from "@/lib/docs";
import {
  contextoOperacionIA,
  contextoValidacionDocumental,
} from "@/lib/marco-validacion";
import { fingerprintDocumentosReconciliacion } from "@/lib/resolucion-documentos";
import {
  senalesDesdeDocumento,
} from "@/lib/normas-retrieval";
import { rawDatosDesdeCache } from "@/lib/extraccion-doc-cache";
import type { DocType } from "@/lib/docs";
import {
  iaDocsDisponible,
  invocarIATexto,
  normalizarDatosDocumentoOperacion,
  type Alerta,
  type DocumentacionIA,
} from "@/lib/ia-documentos";
import { contextoDocumentosParaCruce } from "@/lib/ia-extraccion";
import { contextoFechaReferenciaIA } from "@/lib/fechas";
import { filtrarInconsistenciasRuido } from "@/lib/equivalencias-campo";
import {
  sanearFaltantesIA,
  sanearInconsistenciasIA,
} from "@/lib/alertas-validacion";
import { sanearSalidaCruceIA } from "@/lib/cruce-compatibilidad";
import {
  filtrarHallazgosFundamentados,
  refNormativaValida,
  textoConRef,
} from "@/lib/ia-guardrails";

export type CruceTextoParcial = Pick<
  DocumentacionIA,
  "faltantes" | "inconsistencias" | "alertas" | "mensaje_cliente" | "resumen"
>;

type DocOp = Awaited<
  ReturnType<typeof import("@/lib/data").getDocumentsByOperation>
>[number];

function normalizarCruceTexto(raw: Record<string, unknown>): CruceTextoParcial {
  const faltantes = Array.isArray(raw.faltantes)
    ? raw.faltantes
        .map((f) => {
          if (!f || typeof f !== "object") return null;
          const o = f as { doc?: string; motivo?: string; ref?: string };
          const doc = String(o.doc ?? "").trim();
          const ref = String(o.ref ?? "").trim();
          if (!doc || !refNormativaValida(ref)) return null;
          const motivo = String(o.motivo ?? "").trim();
          if (!motivo) return null;
          return {
            doc,
            motivo: textoConRef({ texto: motivo, ref }),
            ref,
          };
        })
        .filter((x): x is { doc: string; motivo: string; ref: string } => x != null)
    : [];

  const inconsistencias = filtrarInconsistenciasRuido(
    sanearInconsistenciasIA(
      Array.isArray(raw.inconsistencias)
        ? raw.inconsistencias
            .map((s) => String(s ?? "").trim())
            .filter(Boolean)
        : [],
    ),
  );

  const alertas: Alerta[] = [];
  if (Array.isArray(raw.alertas)) {
    const crudas: Alerta[] = [];
    for (const a of raw.alertas) {
      if (!a || typeof a !== "object") continue;
      const o = a as { nivel?: string; texto?: string; ref?: string };
      const nivel = o.nivel === "error" || o.nivel === "warn" ? o.nivel : "ok";
      const texto = String(o.texto ?? "").trim();
      const ref = String(o.ref ?? "").trim();
      if (!texto) continue;
      crudas.push({
        nivel,
        texto: refNormativaValida(ref) ? textoConRef({ texto, ref }) : texto,
        ...(refNormativaValida(ref) ? { ref } : {}),
      } as Alerta & { ref?: string });
    }
    for (const h of filtrarHallazgosFundamentados(
      crudas.map((a) => ({
        nivel: a.nivel,
        texto: a.texto,
        ref: (a as Alerta & { ref?: string }).ref,
      })),
    )) {
      alertas.push({ nivel: h.nivel as Alerta["nivel"], texto: h.texto });
    }
  }

  return {
    faltantes: sanearFaltantesIA(faltantes),
    inconsistencias,
    alertas,
    mensaje_cliente: String(raw.mensaje_cliente ?? "").trim(),
    resumen: String(raw.resumen ?? "").trim(),
  };
}

/** ¿Conviene correr el cruce texto-only? (docs nuevos o forzado tras subida). */
export function necesitaCruceTexto(
  op: OperationWithClient,
  docs: DocOp[],
  opts?: { forzar?: boolean },
): boolean {
  if (opts?.forzar) return true;
  const fp = fingerprintDocumentosReconciliacion(docs);
  const prev = parseReconciliacionMeta(op.reconciliacion_meta);
  return prev?.fingerprint !== fp;
}

function senalesDesdeDocumentosCargados(docs: DocOp[]): string[] {
  const senales: string[] = [];
  for (const d of documentosConValorLegal(docs)) {
    const raw = rawDatosDesdeCache(d);
    const datos =
      raw && typeof raw === "object"
        ? normalizarDatosDocumentoOperacion({ datos: raw })
        : null;
    senales.push(...senalesDesdeDocumento(d.doc_type as DocType, datos));
  }
  return senales;
}

/**
 * Cruce multi-documento solo texto: extraccion_ia + hallazgos_ia + marco
 * normativo recuperado por señales + VUCE. Sin PDFs (Haiku).
 */
export async function cruzarDocumentacionEtapaTexto(
  op: OperationWithClient,
  etapa: "documentacion" | "embarque",
  docs: DocOp[],
): Promise<CruceTextoParcial | null> {
  if (!iaDocsDisponible()) return null;

  const legales = documentosConValorLegal(docs);
  const relevantes = docsRelevantesIA(etapa);
  const hayAlgo = legales.some((d) => relevantes.has(d.doc_type));
  if (!hayAlgo) return null;

  const esEmbarque = etapa === "embarque";
  const transporteNombre = transporteLabel(op.via);
  const docsPresentes = [
    ...new Set(
      legales
        .filter((d) => relevantes.has(d.doc_type))
        .map((d) => docLabelDe(d.doc_type, op.via)),
    ),
  ];

  const senalesDocs = senalesDesdeDocumentosCargados(docs);
  const contexto = await contextoValidacionDocumental(op, senalesDocs, {
    compacto: true,
  });

  const extraccion = contextoDocumentosParaCruce(docs);

  const etapaLabel = esEmbarque ? "embarque/transporte" : "documentación comercial";

  const system =
    "Cruzá los documentos comerciales/aduaneros usando solo la extracción cacheada y el marco normativo.\n\n" +
    "INCONSISTENCIAS (solo contradicciones REALES entre documentos):\n" +
    "- Dos valores distintos para el mismo dato (NCM, peso, moneda, contraparte…).\n" +
    "- MT, TO, TM, ton, tonelada = misma unidad de masa; no reportar diferencia solo por abreviatura.\n" +
    "- Tolerancia decimal ±0,02 en montos y pesos; redondeos no son inconsistencia.\n" +
    "- Observaciones comerciales normales (productor ≠ importador, misma fecha de emisión) NO son inconsistencias.\n" +
    "- No cites norma si el hecho no activa ese artículo; no especules sobre documentos faltantes aquí.\n\n" +
    "FALTANTES: documentos o trámites exigidos por el marco o por VUCE que NO " +
    "figuran en la carpeta (prueba de origen MERCOSUR, certificados de intervención, " +
    "antidumping a verificar, etc.). Cada faltante con ref normativa (ROM/CA/VUCE).\n" +
    "ALERTAS: observaciones útiles (ok/warn/error) con ref normativa en warn/error.\n\n" +
    'JSON: {"resumen":"...","faltantes":[{"doc":"...","motivo":"...","ref":"NORMA · Art. N"}],' +
    '"inconsistencias":["..."],' +
    '"alertas":[{"nivel":"ok|warn|error","texto":"...","ref":"NORMA · Art. N"}],"mensaje_cliente":""}.';

  const userText = [
    contextoFechaReferenciaIA(),
    contextoOperacionIA(op),
    esEmbarque ? `Transporte esperado: ${transporteNombre}` : "",
    `Documentos presentes en esta etapa: ${docsPresentes.join(", ") || "ninguno"}`,
    "",
    contexto,
    "",
    extraccion ?? "(Sin extracción cacheada aún.)",
    "",
    "Usá solo la extracción anterior.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await invocarIATexto(system, userText, 2000, {
      etiqueta: "validacion.cruce-texto",
      detalle: `etapa=${etapa} · op=${op.id}`,
    });
    return sanearSalidaCruceIA(normalizarCruceTexto(raw));
  } catch {
    return null;
  }
}

export function fusionarCruceEnResultado(
  resultado: DocumentacionIA,
  cruce: CruceTextoParcial,
): void {
  for (const f of cruce.faltantes) {
    const nd = f.doc.trim().toLowerCase();
    const dup = resultado.faltantes.some(
      (x) =>
        x.doc.trim().toLowerCase() === nd ||
        x.doc.toLowerCase().includes(nd) ||
        nd.includes(x.doc.toLowerCase()),
    );
    if (!dup) resultado.faltantes.push(f);
  }

  for (const s of cruce.inconsistencias) {
    if (!resultado.inconsistencias.includes(s)) {
      resultado.inconsistencias.push(s);
    }
  }

  for (const a of cruce.alertas) {
    if (!resultado.alertas.some((x) => x.texto === a.texto)) {
      resultado.alertas.push(a);
    }
  }

  if (cruce.mensaje_cliente && !resultado.mensaje_cliente) {
    resultado.mensaje_cliente = cruce.mensaje_cliente;
  }
  if (cruce.resumen && !resultado.resumen) {
    resultado.resumen = cruce.resumen;
  }
}
