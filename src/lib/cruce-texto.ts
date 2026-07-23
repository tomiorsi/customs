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
import {
  filtrarInconsistenciasRuido,
  separarDescripcionesGenericasTransporte,
} from "@/lib/equivalencias-campo";
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

  const inconsistenciasBase = filtrarInconsistenciasRuido(
    sanearInconsistenciasIA(
      Array.isArray(raw.inconsistencias)
        ? raw.inconsistencias
            .map((s) => String(s ?? "").trim())
            .filter(Boolean)
        : [],
    ),
  );
  const { mantener: inconsistencias, redirigir: descripcionesGenericas } =
    separarDescripcionesGenericasTransporte(inconsistenciasBase);

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

  // Descripción genérica de transporte: no es contradicción material pero el operador
  // debe verla como observación (warn) antes de oficializar.
  for (const texto of descripcionesGenericas) {
    if (!alertas.some((a) => a.texto === texto)) {
      alertas.push({ nivel: "warn", texto });
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
  const legalesRelevantes = legales.filter((d) => relevantes.has(d.doc_type));
  const hayAlgo = legalesRelevantes.length > 0;
  if (!hayAlgo) return null;

  const esEmbarque = etapa === "embarque";
  const transporteNombre = transporteLabel(op.via);
  const docsPresentes = [
    ...new Set(
      legalesRelevantes.map((d) => docLabelDe(d.doc_type, op.via)),
    ),
  ];
  const tiposDocumento = [
    ...new Set(legalesRelevantes.map((d) => d.doc_type)),
  ];
  const docsComparables = legalesRelevantes.length;

  const senalesDocs = senalesDesdeDocumentosCargados(legalesRelevantes);
  const contexto = await contextoValidacionDocumental(op, senalesDocs, {
    compacto: true,
  });

  const extraccion = contextoDocumentosParaCruce(legalesRelevantes);

  const etapaLabel = esEmbarque ? "embarque/transporte" : "documentación comercial";

  const system =
    "Cruzá los documentos comerciales/aduaneros usando solo la extracción cacheada y el marco normativo.\n\n" +
    "INCONSISTENCIAS (solo contradicciones REALES entre documentos):\n" +
    "- Dos valores distintos para el mismo dato (NCM, peso, moneda, contraparte…).\n" +
    "- MT, TO, TM, ton, tonelada = misma unidad de masa; no reportar diferencia solo por abreviatura.\n" +
    "- Tolerancia decimal ±0,02 en montos y pesos; redondeos no son inconsistencia.\n" +
    "- Nº de factura, nº de certificado de origen y nº de CRT/BL/AWB son identificadores distintos: no marques inconsistencia solo por formatos diferentes.\n" +
    "- Varias facturas comerciales en el expediente son documentos independientes: no compares sus totales entre sí.\n" +
    "- Ship To / forward / c/o en hub logístico (Miami, etc.) no es inconsistencia con consignatario aduanero en Argentina en importación.\n" +
    "- Cantidad en kg, piezas o bultos puede expresar dimensiones distintas del mismo embarque: no es contradicción de peso.\n" +
    "- Peso neto/cantidad de mercadería vs peso bruto total del documento de transporte: no es inconsistencia.\n" +
    "- Documento de transporte sin valor comercial propio (NVD/NCV, as per invoice) o con cargo/flete del carrier: no lo compares con valor de factura.\n" +
    "- El flete/cargo del documento de transporte puede ser parcial o propio del carrier; no lo compares automáticamente con el flete comercial de la factura ni con FOB/CIF del despacho.\n" +
    "- Shipper/remitente en transporte puede ser forwarder o transportista distinto del Seller en factura: no es inconsistencia.\n" +
    "- El país del shipper/remitente o del hub logístico en transporte no reemplaza al país de origen de la mercadería declarado en factura/despacho.\n" +
    "- Un AWB/BL/CRT puede describir la carga en forma genérica o resumida; no exijas que repita cada línea de todas las facturas si no hay contradicción material del tipo de mercadería.\n" +
    "- Si la descripción del transporte es más genérica que la factura pero compatible con el tipo de bien, usá ALERTA/WARN por baja especificidad; no lo reportes como inconsistencia.\n" +
    "- Un mismo AWB/BL/CRT puede amparar varias facturas comerciales; no exijas consolidación explícita ni suma de valores si el documento de transporte no declara valor comercial propio.\n" +
    "- Si hay varias facturas de distintos sellers/proveedores, el shipper/remitente del transporte puede corresponder solo a uno de ellos o a un consolidador/forwarder; eso no es inconsistencia por sí solo.\n" +
    "- Forwarder/agent/hub logístico (ej. forward to, ship to, authorized agent) puede variar por documento sin ser inconsistencia si el consignatario/importador y destino aduanero son coherentes.\n" +
    "- Ceros a la izquierda o prefijos de sistema en números de AWB/BL/CRT/SIM no son inconsistencia si refieren al mismo identificador base.\n" +
    "- Incoterm comercial (CFR, FOB) vs término operativo del transporte (CY/CY, FIO, franco frontera): no son el mismo campo.\n" +
    "- FCA con punto logístico (ej. FCA Miami) no contradice un transporte aéreo/marítimo posterior: define punto de entrega comercial, no el modo total del embarque.\n" +
    "- Observaciones comerciales normales (productor ≠ importador, misma fecha de emisión) NO son inconsistencias.\n" +
    "- Con menos de 2 documentos presentes en esta etapa NO generes inconsistencias: solo faltantes y/o alertas.\n" +
    "- No cites norma si el hecho no activa ese artículo; no especules sobre documentos faltantes aquí.\n\n" +
    "FALTANTES: documentos o trámites exigidos por el marco o VUCE que NO figuran en " +
    "\"Documentos presentes en esta etapa\". Si un documento ya está en carpeta pero incompleto " +
    "o con observaciones, usá ALERTAS (warn), no faltantes.\n" +
    "- ROM / certificado de origen MERCOSUR: solo si el origen es país del Mercosur (ACE 18) " +
    "según el bloque ORIGEN del marco. Para orígenes extrazona (China, EE.UU., etc.) NO pidas ROM.\n" +
    "- Cada faltante con ref normativa (ROM/CA/VUCE) solo cuando corresponda al origen y NCM.\n" +
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
    const cruce = normalizarCruceTexto(raw);
    if (docsComparables < 2) {
      cruce.inconsistencias = [];
    }
    return sanearSalidaCruceIA(cruce, op, docsPresentes, tiposDocumento);
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
