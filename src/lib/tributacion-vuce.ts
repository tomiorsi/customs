import "server-only";
import path from "node:path";
import { leerFilas } from "@/lib/parquet-store";

/**
 * Tributación aplicable por posición SIM (VUCE / Decreto 557/2023 y anexos).
 *
 * El nomenclador ARCA (ncm.parquet, ar3) trae el AEC o la tarifa de referencia;
 * el DIE que se paga en la práctica (p. ej. 2% BK Anexo III) viene del endpoint
 * de tributaciones VUCE, agrupado por posicion_query (código SIM completo).
 */

const TRIB_PATH = path.join(process.cwd(), "data", "VUCE", "tributacion.parquet");
const DETALLE_PATH = path.join(
  process.cwd(),
  "data",
  "VUCE",
  "clean",
  "posicion_detalle.parquet",
);

const TRIB_COLS = ["posicion_query", "descripcion", "valor", "subcluster"] as const;
const DET_COLS = ["posicion", "bk"] as const;

/** Subcluster VUCE: BK con DIE 2% (Anexo III Dec. 557/2023). */
export const SUBCLUSTER_BK_ANEXO_III = "5073";

export type TributacionPosicion = {
  posicionQuery: string;
  /** Arancel Externo Común (referencia Mercosur). */
  aec: number | null;
  /** Derecho de Importación extrazona aplicable (el que se paga). */
  die: number | null;
  /** Derecho de Importación intrazona (Mercosur con CO). */
  dii: number | null;
  te: number | null;
  iva: number | null;
  ivaAdicional: number | null;
  ganancias: number | null;
  iibb: number | null;
  dieSubcluster: string | null;
  bk: boolean;
};

type IndiceTributacion = Map<string, TributacionPosicion>;

let indicePromesa: Promise<IndiceTributacion> | null = null;
let bkPromesa: Promise<Map<string, boolean>> | null = null;

function aNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** "8430.10.00.100C" → "84301000100C" (posicion_query VUCE). */
export function simCodigo(codigo: string | null | undefined): string {
  return (codigo ?? "").replace(/\./g, "").trim();
}

function etiquetaRegimenDie(t: TributacionPosicion): string | null {
  if (t.dieSubcluster === SUBCLUSTER_BK_ANEXO_III) {
    return "BK Anexo III (DIE diferencial)";
  }
  if (
    t.bk &&
    t.die != null &&
    t.aec != null &&
    t.die < t.aec
  ) {
    return "BK (DIE diferencial)";
  }
  return null;
}

async function construirIndiceBk(): Promise<Map<string, boolean>> {
  const idx = new Map<string, boolean>();
  try {
    const filas = await leerFilas(DETALLE_PATH, DET_COLS);
    for (const f of filas) {
      const pos = f["posicion"];
      if (!pos) continue;
      const bk = f["bk"];
      idx.set(
        String(pos),
        bk === "1" || bk === "true" || bk === "True",
      );
    }
  } catch {
    // posicion_detalle opcional si aún no corrió clean_vuce_data
  }
  return idx;
}

function getIndiceBk(): Promise<Map<string, boolean>> {
  if (!bkPromesa) bkPromesa = construirIndiceBk();
  return bkPromesa;
}

async function construirIndice(): Promise<IndiceTributacion> {
  const [filas, bkIdx] = await Promise.all([
    leerFilas(TRIB_PATH, TRIB_COLS),
    getIndiceBk(),
  ]);

  type Parcial = {
    posicionQuery: string;
    aec?: number;
    die?: number;
    dii?: number;
    te?: number;
    iva?: number;
    ivaAdicional?: number;
    ganancias?: number;
    iibb?: number;
    dieSubcluster?: string | null;
  };

  const parciales = new Map<string, Parcial>();

  for (const f of filas) {
    const q = f["posicion_query"];
    if (!q) continue;
    let p = parciales.get(q);
    if (!p) {
      p = { posicionQuery: q };
      parciales.set(q, p);
    }

    const concepto = (f["descripcion"] ?? "").trim();
    const val = aNum(f["valor"]);
    if (val == null) continue;

    switch (concepto) {
      case "AEC":
        p.aec = val;
        break;
      case "DIE":
        p.die = val;
        p.dieSubcluster = f["subcluster"] ?? null;
        break;
      case "DII":
        p.dii = val;
        break;
      case "TE":
        p.te = val;
        break;
      case "IVA":
        p.iva = val;
        break;
      case "IVA AD":
        p.ivaAdicional = val;
        break;
      case "Ganancias":
        p.ganancias = val;
        break;
      case "IIBB":
        p.iibb = val;
        break;
    }
  }

  const idx: IndiceTributacion = new Map();
  for (const [q, p] of parciales) {
    idx.set(q, {
      posicionQuery: q,
      aec: p.aec ?? null,
      die: p.die ?? null,
      dii: p.dii ?? null,
      te: p.te ?? null,
      iva: p.iva ?? null,
      ivaAdicional: p.ivaAdicional ?? null,
      ganancias: p.ganancias ?? null,
      iibb: p.iibb ?? null,
      dieSubcluster: p.dieSubcluster ?? null,
      bk: bkIdx.get(q) ?? false,
    });
  }
  return idx;
}

function getIndice(): Promise<IndiceTributacion> {
  if (!indicePromesa) indicePromesa = construirIndice();
  return indicePromesa;
}

export async function tributacionPorSim(
  sim: string | null | undefined,
): Promise<TributacionPosicion | null> {
  const key = simCodigo(sim);
  if (!key) return null;
  const idx = await getIndice();
  return idx.get(key) ?? null;
}

export async function tributacionPorCodigoNcm(
  codigo: string | null | undefined,
): Promise<TributacionPosicion | null> {
  return tributacionPorSim(simCodigo(codigo));
}

/** DIE extrazona aplicable: VUCE primero, nomenclador (ar3) como respaldo. */
export function dieAplicable(
  trib: TributacionPosicion | null,
  ar3Nominal: number,
): number {
  if (trib?.die != null) return trib.die;
  if (trib?.aec != null) return trib.aec;
  return ar3Nominal;
}

export type ArancelEnriquecido = {
  /** DIE extrazona que se aplica en Argentina. */
  di: number;
  /** Tarifa nominal del nomenclador ARCA (ar3), suele coincidir con AEC. */
  diNominal: number;
  aec: number | null;
  dii: number | null;
  te: number | null;
  iva: number | null;
  ivaAdicional: number | null;
  bk: boolean;
  dieRegimen: string | null;
  /** true si el DIE aplicable viene de tributacion VUCE. */
  dieDesdeVuce: boolean;
};

/** Cruza nomenclador ARCA con tributación VUCE para la posición SIM. */
export async function enriquecerArancelImportacion(
  codigoNomenclador: string,
  ar3Nominal: number,
  ivaFallback: number,
): Promise<ArancelEnriquecido> {
  const trib = await tributacionPorCodigoNcm(codigoNomenclador);
  const di = dieAplicable(trib, ar3Nominal);
  return {
    di,
    diNominal: ar3Nominal,
    aec: trib?.aec ?? (ar3Nominal > 0 ? ar3Nominal : null),
    dii: trib?.dii ?? null,
    te: trib?.te ?? null,
    iva: trib?.iva ?? ivaFallback,
    ivaAdicional: trib?.ivaAdicional ?? null,
    bk: trib?.bk ?? false,
    dieRegimen: trib ? etiquetaRegimenDie(trib) : null,
    dieDesdeVuce: trib?.die != null,
  };
}
