import "server-only";

import type { OperationWithClient } from "@/lib/data";
import { DOC_LABELS, type DocType } from "@/lib/docs";
import type { VacioInterpretacion } from "@/lib/ia-extraccion";
import {
  iaDocsDisponible,
  invocarIATexto,
  MODELO,
  type DatosDocumentoOperacion,
  type HallazgoItem,
} from "@/lib/ia-documentos";
import { contextoOperacionIA, contextoValidacionDocumental } from "@/lib/marco-validacion";
import { senalesDesdeDocumento } from "@/lib/normas-retrieval";
import { serializarDatosDocumento } from "@/lib/interpretacion-documento";
import {
  filtrarHallazgosFundamentados,
  refNormativaValida,
  textoConRef,
} from "@/lib/ia-guardrails";

const MAX_TOKENS = 1536;

const SYSTEM_EVALUAR =
  "Sos despachante de aduana argentino. Evaluás UN solo documento ya transcrito " +
  "(sin cruzar con otros PDFs de la operación).\n\n" +
  "Devolvé SIEMPRE al menos un hallazgo en el array.\n" +
  'JSON: {"hallazgos":[{"nivel":"ok|warn|error","texto":"...","ref":"NORMA · Art. N"}]}\n\n' +
  "REGLAS GLOBALES:\n" +
  "1. Fundamentá warn/error SOLO con artículos del MARCO provisto (ref obligatoria).\n" +
  "2. ok: documento legible y, en aislamiento, sin defecto legal evidente — sé concreto.\n" +
  "3. No exijas otros documentos (certificado, BL, etc.): eso es cruce posterior.\n" +
  "4. No apliques requisitos de prueba de origen (ROM) a un packing list o factura " +
  "en aislamiento salvo que el documento SEA la declaración/certificado de origen.\n" +
  "5. No marques error por roles comerciales distintos (productor ≠ importador) si es habitual.\n" +
  "6. No inventes datos que no estén en la transcripción.\n";

function parseHallazgos(raw: Record<string, unknown>): HallazgoItem[] {
  if (!Array.isArray(raw.hallazgos)) return [];

  const items: HallazgoItem[] = [];
  for (const h of raw.hallazgos) {
    if (!h || typeof h !== "object") continue;
    const o = h as Record<string, unknown>;
    const nivel =
      o.nivel === "error" || o.nivel === "warn" || o.nivel === "ok"
        ? o.nivel
        : "ok";
    const texto = String(o.texto ?? "").trim();
    if (!texto) continue;
    const ref = String(o.ref ?? "").trim();
    const item: HallazgoItem = {
      nivel,
      texto: refNormativaValida(ref) ? textoConRef({ texto, ref }) : texto,
      ...(refNormativaValida(ref) ? { ref } : {}),
    };
    if (Array.isArray(o.requiereDoc)) {
      item.requiereDoc = o.requiereDoc
        .map((x) => String(x ?? "").trim())
        .filter(Boolean) as DocType[];
    }
    items.push(item);
  }

  return filtrarHallazgosFundamentados(items) as HallazgoItem[];
}

export function vaciosVisiblesUsuario(
  vacios: VacioInterpretacion[] | undefined,
): VacioInterpretacion[] {
  return (vacios ?? []).filter((v) => {
    if (v.campo === "lectura_dual") return false;
    const m = `${v.donde} ${v.motivo}`.toLowerCase();
    return !/capa|visi[oó]n|arbitraje|embebida|py\s*mupdf/.test(m);
  });
}

function hallazgoDesdeVacios(vacios: VacioInterpretacion[]): HallazgoItem[] {
  const relevantes = vaciosVisiblesUsuario(vacios);
  if (!relevantes.length) return [];
  return relevantes.map((v) => ({
    nivel: "warn" as const,
    texto: `${v.donde}: ${v.motivo}`,
  }));
}

function hallazgoMinimo(
  docType: DocType,
  fileName: string,
  motivo: string,
  nivel: HallazgoItem["nivel"] = "warn",
): HallazgoItem[] {
  return [
    {
      nivel,
      texto: `${DOC_LABELS[docType] ?? docType} (${fileName}): ${motivo}`,
    },
  ];
}

export type EvaluarHallazgosInput = {
  docType: DocType;
  fileName: string;
  lectura: string;
  datos: DatosDocumentoOperacion;
  vacios?: VacioInterpretacion[];
};

/**
 * Hallazgos legales/técnicos de UN documento (siempre ≥1 ítem).
 */
export async function evaluarHallazgosDocumentoSubido(
  op: OperationWithClient,
  input: EvaluarHallazgosInput,
): Promise<HallazgoItem[]> {
  const lectura = input.lectura.trim();
  const vaciosHallazgos = hallazgoDesdeVacios(input.vacios ?? []);

  if (!lectura || lectura.length < 40) {
    return vaciosHallazgos.length
      ? vaciosHallazgos
      : hallazgoMinimo(
          input.docType,
          input.fileName,
          "lectura insuficiente; revisar PDF o reintentar.",
        );
  }

  if (!iaDocsDisponible()) {
    return [
      {
        nivel: "ok",
        texto: `${DOC_LABELS[input.docType] ?? input.docType}: lectura completada (sin evaluación legal — falta API).`,
      },
      ...vaciosHallazgos,
    ];
  }

  try {
    const senales = senalesDesdeDocumento(input.docType, input.datos);
    const marco = await contextoValidacionDocumental(op, senales, {
      compacto: true,
    });
    const label = DOC_LABELS[input.docType] ?? input.docType;
    const datosStr = serializarDatosDocumento(input.datos);

    const userText = [
      contextoOperacionIA(op),
      "",
      marco,
      "",
      `Documento: ${label} (${input.docType})`,
      `Archivo: ${input.fileName}`,
      "",
      "TRANSCRIPCIÓN:",
      "---",
      lectura.slice(0, 14_000),
      "---",
      "",
      datosStr ? `DATOS INTERPRETADOS:\n${datosStr}` : "",
      vaciosHallazgos.length
        ? `\nVacíos de lectura:\n${vaciosVisiblesUsuario(input.vacios).map((v) => `${v.donde}: ${v.motivo}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const raw = await invocarIATexto(SYSTEM_EVALUAR, userText, MAX_TOKENS, {
      etiqueta: "doc.evaluar-hallazgos",
      detalle: input.fileName,
      modelo: MODELO,
    });

    let hallazgos = parseHallazgos(raw);
    if (!hallazgos.length) {
      hallazgos = [
        {
          nivel: "ok",
          texto: `${label}: documento leído; sin observaciones legales en evaluación aislada.`,
        },
      ];
    }
    for (const v of vaciosHallazgos) {
      if (!hallazgos.some((h) => h.texto.includes(v.texto.slice(0, 40)))) {
        hallazgos.push(v);
      }
    }
    return hallazgos;
  } catch (err) {
    console.error(`[doc.evaluar-hallazgos] ${input.fileName}:`, err);
    return [
      ...vaciosHallazgos,
      {
        nivel: "warn",
        texto: `${DOC_LABELS[input.docType] ?? input.docType}: no se pudo evaluar con IA; revisar manualmente.`,
      },
    ];
  }
}
