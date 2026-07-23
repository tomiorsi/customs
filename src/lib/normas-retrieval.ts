import "server-only";

import { paisOrigenEfectivo } from "@/lib/cotizador";
import type { DatosDocumentoOperacion } from "@/lib/ia-documentos";
import type { DocType } from "@/lib/docs";
import { REF_DOCUMENTACION } from "@/lib/normas-registro";
import {
  buscarArticulosPorSenales,
  contextoArticulosIA,
  listarTemasDisponibles,
  type RefArticulo,
} from "@/lib/normas";

type OpSenales = {
  tipo: string;
  via?: string | null;
  ncm?: string | null;
  pais_origen?: string | null;
  pais_procedencia?: string | null;
  pais_destino?: string | null;
  incoterm?: string | null;
  forma_pago?: string | null;
  unidad?: string | null;
  tipo_embalaje?: string | null;
};

const PAISES_MERCOSUR = new Set([
  "argentina",
  "brasil",
  "paraguay",
  "uruguay",
  "bolivia",
]);

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function esMercosur(pais: string | null | undefined): boolean {
  if (!pais?.trim()) return false;
  return PAISES_MERCOSUR.has(norm(pais));
}

function claveRef(r: RefArticulo): string {
  return `${r.norma}::${r.art}`;
}

/** Señales base desde la operación (sin inferir requisitos: solo datos cargados). */
export function senalesDesdeOperacion(op: OpSenales): string[] {
  const out = new Set<string>();
  const esExpo = op.tipo.toLowerCase().startsWith("exp");
  out.add(esExpo ? "exportacion" : "importacion");

  const origen = paisOrigenEfectivo({
    pais_origen: op.pais_origen,
    pais_procedencia: op.pais_procedencia,
  });
  if (origen) {
    out.add("pais_origen");
    if (esMercosur(origen)) out.add("pais_mercosur");
  }
  if (
    op.pais_procedencia?.trim() &&
    origen &&
    norm(op.pais_procedencia) !== norm(origen)
  ) {
    out.add("pais_procedencia_distinto");
  }

  const via = norm(op.via ?? "");
  if (/maritim|ocean|bl|sea/.test(via)) out.add("via_maritima");
  if (/aere|air|awb/.test(via)) out.add("via_aerea");
  if (/terrest|road|crt|truck/.test(via)) out.add("via_terrestre");

  if (op.incoterm?.trim()) out.add("incoterm");
  if (op.ncm?.trim()) out.add("ncm");
  if (op.forma_pago?.trim()) out.add("forma_pago");

  const unidad = norm(op.unidad ?? "");
  if (/\b(ton|tonelada|toneladas|mt|tm|tn)\b/.test(unidad)) {
    out.add("unidad_tonelada");
  }
  const emb = norm(op.tipo_embalaje ?? "");
  if (/granel|bulk|big bag|bigbag|sack|bolsa/.test(emb)) {
    out.add("embalaje_granel");
  }

  return [...out];
}

/** Señales desde tipo de documento y datos extraídos al leer un PDF. */
export function senalesDesdeDocumento(
  docType: DocType | string,
  datos?: DatosDocumentoOperacion | null,
): string[] {
  const out = new Set<string>([String(docType)]);

  if (!datos) return [...out];

  const merc = datos.mercaderia;
  if (merc?.peso_neto?.trim()) out.add("peso_neto");
  if (merc?.peso_bruto?.trim()) out.add("peso_bruto");
  const u = norm(merc?.unidad ?? "");
  if (/\b(ton|tonelada|mt|tm|tn)\b/.test(u)) out.add("unidad_tonelada");
  if (/bag|bolsa|sack|granel|bulk/.test(norm(merc?.tipo_embalaje ?? ""))) {
    out.add("embalaje_granel");
  }
  const com = datos.comercial;
  if (com?.incoterm?.trim()) out.add("incoterm");
  if (com?.valor_factura?.trim()) out.add("valor_factura");
  if (com?.flete?.trim()) out.add("flete");
  if (com?.seguro?.trim()) out.add("seguro");
  const orig = datos.origen;
  if (orig?.pais_origen?.trim() && esMercosur(orig.pais_origen)) {
    out.add("pais_mercosur");
  }
  if (
    orig?.pais_adquisicion?.trim() &&
    orig?.pais_origen?.trim() &&
    norm(orig.pais_adquisicion) !== norm(orig.pais_origen)
  ) {
    out.add("triangulacion");
    out.add("tercer_operador");
  }
  if (datos.via?.trim()) out.add("transporte");

  return [...out];
}

/** Une señales de operación + documentos cacheados para el cruce multi-doc. */
export function combinarSenales(
  operacion: string[],
  ...extras: string[][]
): string[] {
  return [...new Set([...operacion, ...extras.flat()])];
}

export type ResultadoRecuperacionNormas = {
  senales: string[];
  refs: RefArticulo[];
  contexto: string;
  temasDisponibles: string[];
};

/**
 * Recupera artículos del parquet por señales y arma el bloque MARCO NORMATIVO.
 * Siempre incluye REF_DOCUMENTACION (baseline legal) + artículos adicionales
 * que matcheen keywords/dispara_si/temas.
 */
export async function recuperarMarcoNormativo(
  senales: string[],
  opts: { limiteExtraSenales?: number; compacto?: boolean } = {},
): Promise<ResultadoRecuperacionNormas> {
  const limiteExtra = opts.limiteExtraSenales ?? (opts.compacto ? 4 : 8);
  const porSenales = await buscarArticulosPorSenales(senales, {
    limite: limiteExtra,
  });

  const refsMap = new Map<string, RefArticulo>();
  const baseline = senales.includes("pais_mercosur")
    ? REF_DOCUMENTACION
    : REF_DOCUMENTACION.filter((r) => r.norma !== "ROM");
  for (const r of baseline) refsMap.set(claveRef(r), r);
  for (const a of porSenales) {
    refsMap.set(`${a.normaId}::${a.articulo}`, {
      norma: a.normaId,
      art: a.articulo,
    });
  }
  const refs = [...refsMap.values()];

  const contexto = await contextoArticulosIA(refs, {
    maxCharsPorArticulo: opts.compacto ? 500 : 900,
    maxCharsPorApendice: opts.compacto ? 3500 : 12000,
    incluirIndice: !opts.compacto,
  });
  const temasDisponibles = await listarTemasDisponibles();
  return { senales, refs, contexto, temasDisponibles };
}
