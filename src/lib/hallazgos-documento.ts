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
  "3. No exijas otros documentos (certificado, BL, packing, CO, etc.): eso es cruce posterior.\n" +
  "4. No apliques requisitos de prueba de origen (ROM) a un packing list, factura, transporte " +
  "o gastos en aislamiento salvo que el documento SEA la declaración/certificado de origen.\n" +
  "5. No marques error por roles comerciales distintos (productor ≠ importador) si es habitual.\n" +
  "6. No inventes datos que no estén en la transcripción.\n";

function filtrarHallazgosEvaluacionAislada(
  hallazgos: HallazgoItem[],
  docType: DocType,
): HallazgoItem[] {
  const sinRomNiOtrosDocs = new Set<DocType>([
    "transporte",
    "transporte_borrador",
    "packing_list",
    "factura_comercial",
    "proforma",
    "factura_gastos",
    "remito",
    "liberacion_transporte",
    "cotizacion_forwarder",
  ]);
  if (!sinRomNiOtrosDocs.has(docType)) return hallazgos;

  return hallazgos.filter((h) => {
    const ref = String(h.ref ?? "").trim().toUpperCase();
    if (ref.startsWith("ROM")) return false;
    const t = h.texto.toLowerCase();
    if (
      /certificado de origen|prueba de origen|declaraci[oó]n de origen|autocertific|sin prueba de origen/.test(
        t,
      )
    ) {
      return false;
    }
    if (
      /adjunt[aeá]\s+(el\s+)?(certificado|co\b|packing|bl\b|conocimiento|origen)/i.test(
        t,
      )
    ) {
      return false;
    }
    return true;
  });
}

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
    // Los descartes de "interpretación" son limpieza interna del motor
    // (p. ej. campos inventados/no anclados). Ayudan a depurar la extracción,
    // pero no aportan al operador al subir el documento y generan ruido.
    if (String(v.donde ?? "").trim().toLowerCase() === "interpretación") return false;
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

function parseNumeroFlexible(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).replace(/[^\d.,-]/g, "").trim();
  if (!s) return null;
  const tieneComa = s.includes(",");
  const tienePunto = s.includes(".");
  if (tieneComa && tienePunto) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (tieneComa) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function ncm8(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "").slice(0, 8);
}

function incotermCodigo(raw: string | null | undefined): string {
  const v = (raw ?? "").trim().toUpperCase();
  const m = v.match(/\b([A-Z]{3})\b/);
  return m?.[1] ?? v.slice(0, 3);
}

function esUnidadPiezas(raw: string): boolean {
  return /\b(PC|PIEZA|PÇ|PZ|PCS|PEÇA|PEÇAS)\b/i.test(raw);
}

function esUnidadPeso(raw: string): boolean {
  return /\b(KG|KILO|KILOGRAMO|KGS|TON|TO|MT)\b/i.test(raw);
}

function esEmbalajeFisico(raw: string): boolean {
  return /\b(BULTO|BULTOS|COLIS|PACKAGE|BAG|ROLL|ROLLS|PALLET)\b/i.test(raw);
}

/** Bultos físicos (camión, pallet, etc.), no piezas comerciales (270 PC). */
function numeroBultosFisicos(raw: string | null | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (esUnidadPiezas(s) && !esEmbalajeFisico(s)) return null;
  const m = s.match(/^(\d+)/);
  if (m) return Number(m[1]);
  const n = parseNumeroFlexible(s);
  return n != null && n <= 999 ? n : null;
}

function numerosEquivalentes(
  a: string,
  b: string,
  tolPct = 0.01,
): boolean {
  const na = parseNumeroFlexible(a);
  const nb = parseNumeroFlexible(b);
  if (na == null || nb == null) return false;
  const tol = Math.max(1, Math.abs(na) * tolPct);
  if (Math.abs(na - nb) <= tol) return true;
  // Punto decimal perdido en extracción (5002 ↔ 50,02).
  if (na >= 100 && nb < 1000 && Math.abs(na / 100 - nb) <= tol) return true;
  if (nb >= 100 && na < 1000 && Math.abs(nb / 100 - na) <= tol) return true;
  return false;
}

function normalizarDocTransporte(raw: string): string {
  return raw.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function docsTransporteEquivalentes(
  carpeta: string,
  sim: string,
): boolean {
  const na = normalizarDocTransporte(carpeta);
  const nb = normalizarDocTransporte(sim);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.endsWith(nb) || nb.endsWith(na)) return true;
  return na.includes(nb) || nb.includes(na);
}

function pareceReferenciaFactura(raw: string): boolean {
  const n = normalizarDocTransporte(raw);
  return /^\d{7,14}$/.test(n);
}

function pareceDocumentoTransporte(raw: string): boolean {
  return /[A-Z]{2,}/i.test(raw);
}

/** Paso 5: cruce despacho SIM vs carpeta; no revalida intervenciones VUCE. */
function evaluarHallazgosDespachoContraCarpeta(
  op: OperationWithClient,
  input: EvaluarHallazgosInput,
): HallazgoItem[] {
  const hallazgos: HallazgoItem[] = [];
  const vaciosHallazgos = hallazgoDesdeVacios(input.vacios ?? []);
  const d = input.datos;

  const compararTexto = (
    label: string,
    carpeta: string | null | undefined,
    sim: string | null | undefined,
  ) => {
    const a = (carpeta ?? "").trim();
    const b = (sim ?? "").trim();
    if (!a || !b) return;
    if (a.toLowerCase() === b.toLowerCase()) return;
    hallazgos.push({
      nivel: "warn",
      texto: `${label}: carpeta «${a}» · SIM «${b}».`,
    });
  };

  const compararNumero = (
    label: string,
    carpeta: string | null | undefined,
    sim: string | null | undefined,
  ) => {
    const a = (carpeta ?? "").trim();
    const b = (sim ?? "").trim();
    if (!a || !b) return;
    if (numerosEquivalentes(a, b)) return;
    hallazgos.push({
      nivel: "warn",
      texto: `${label}: carpeta ${a} · SIM ${b}.`,
    });
  };

  const compararNcm = (
    carpeta: string | null | undefined,
    sim: string | null | undefined,
  ) => {
    const a = ncm8(carpeta);
    const b = ncm8(sim);
    if (!a || !b) return;
    if (a === b) return;
    hallazgos.push({
      nivel: "warn",
      texto: `NCM: carpeta ${carpeta?.trim()} · SIM ${sim?.trim()}.`,
    });
  };

  const compararIncoterm = (
    carpeta: string | null | undefined,
    sim: string | null | undefined,
  ) => {
    const a = incotermCodigo(carpeta);
    const b = incotermCodigo(sim);
    if (!a || !b) return;
    if (a === b) return;
    hallazgos.push({
      nivel: "warn",
      texto: `Incoterm: carpeta ${carpeta?.trim()} · SIM ${sim?.trim()}.`,
    });
  };

  const compararBultosFisicos = () => {
    const nbCarpeta = numeroBultosFisicos(op.bultos);
    const nbSim = numeroBultosFisicos(d.mercaderia?.bultos);
    if (nbCarpeta == null || nbSim == null) return;
    if (nbCarpeta === nbSim) return;
    hallazgos.push({
      nivel: "warn",
      texto: `Bultos físicos: carpeta ${op.bultos?.trim()} · SIM ${d.mercaderia?.bultos?.trim()}.`,
    });
  };

  const compararCantidadOPeso = () => {
    const simCant = (d.mercaderia?.cantidad ?? "").trim();
    const simPeso = (d.mercaderia?.peso_neto ?? "").trim();
    const carpetaCant = (op.cantidad ?? "").trim();
    const carpetaPeso = (op.peso_neto ?? "").trim();
    const carpetaUnidad = (op.unidad ?? "").trim();

    // SIM declara cantidad estadística en kg → comparar peso neto, no piezas.
    if (esUnidadPeso(simCant) || esUnidadPeso(simPeso)) {
      const refSim = simPeso || simCant;
      if (carpetaPeso && refSim) {
        compararNumero("Peso neto (cant. estadística SIM)", carpetaPeso, refSim);
      }
      return;
    }

    if (
      esUnidadPiezas(carpetaCant) ||
      esUnidadPiezas(carpetaUnidad) ||
      esUnidadPiezas(op.bultos ?? "")
    ) {
      return;
    }

    if (carpetaCant && simCant) {
      compararNumero("Cantidad", carpetaCant, simCant);
    }
  };

  const compararDocumentoTransporte = () => {
    const carpeta = (op.transporte_doc_nro ?? "").trim();
    const sim = (d.transporte?.transporte_doc_nro ?? "").trim();
    if (!carpeta || !sim) return;
    if (docsTransporteEquivalentes(carpeta, sim)) return;
    // Carpeta con nro de factura y SIM con CRT: no es contradicción del despacho.
    if (pareceReferenciaFactura(carpeta) && pareceDocumentoTransporte(sim)) {
      return;
    }
    compararTexto("Documento de transporte", carpeta, sim);
  };

  compararNcm(op.ncm, d.mercaderia?.ncm);
  compararNumero("Peso neto", op.peso_neto, d.mercaderia?.peso_neto);
  compararNumero("Peso bruto", op.peso_bruto, d.mercaderia?.peso_bruto);
  compararBultosFisicos();
  compararCantidadOPeso();
  compararNumero("FOB", op.valor_fob, d.comercial?.valor_fob);
  compararNumero("Flete", op.flete, d.comercial?.flete);
  compararNumero("Seguro", op.seguro, d.comercial?.seguro);
  compararNumero("Valor en aduana (CIF)", op.valor_cif, d.comercial?.valor_cif);
  compararIncoterm(op.incoterm, d.comercial?.incoterm);
  compararDocumentoTransporte();
  compararTexto("País de origen", op.pais_origen, d.origen?.pais_origen);
  compararTexto(
    "País de procedencia",
    op.pais_procedencia,
    d.origen?.pais_procedencia,
  );

  if (hallazgos.length === 0) {
    return [
      {
        nivel: "ok",
        texto:
          "Despacho oficializado coherente con la carpeta en NCM, pesos, bultos, valoración y transporte.",
      },
      ...vaciosHallazgos,
    ];
  }
  return [...hallazgos, ...vaciosHallazgos];
}

/** Texto breve del cruce post-oficialización (reemplaza el resumen narrativo largo). */
export function resumenCruceDespacho(hallazgos: HallazgoItem[]): string {
  const difs = hallazgos.filter((h) => h.nivel === "warn" || h.nivel === "error");
  if (difs.length === 0) {
    return "Cruce post-oficialización: el SIM coincide con la carpeta en los campos clave.";
  }
  return `Cruce post-oficialización: ${difs.length} diferencia${difs.length === 1 ? "" : "s"} contra la carpeta (ver abajo).`;
}

/**
 * Hallazgos legales/técnicos de UN documento (siempre ≥1 ítem).
 */
export async function evaluarHallazgosDocumentoSubido(
  op: OperationWithClient,
  input: EvaluarHallazgosInput,
): Promise<HallazgoItem[]> {
  const lectura = input.lectura.trim();
  const vaciosHallazgos = hallazgoDesdeVacios(input.vacios ?? []);

  if (input.docType === "despacho") {
    if (!lectura || lectura.length < 40) {
      return vaciosHallazgos.length
        ? vaciosHallazgos
        : hallazgoMinimo(
            input.docType,
            input.fileName,
            "lectura insuficiente; revisar PDF o reintentar.",
          );
    }
    return evaluarHallazgosDespachoContraCarpeta(op, input);
  }

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
    hallazgos = filtrarHallazgosEvaluacionAislada(hallazgos, input.docType);
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
