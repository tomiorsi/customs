import "server-only";

import { paisOrigenEfectivo } from "@/lib/cotizador";
import type { OperationRow } from "@/lib/data";
import type { DatosDocumentoOperacion } from "@/lib/ia-documentos";
import { autocertificacionOrigen } from "@/lib/origen-mercosur";

/** Datos mínimos por documento para reglas de compatibilidad (sin releer PDFs). */
export type DocDatosMin = {
  docType: string;
  datos: DatosDocumentoOperacion;
};

export type FaltanteValidacion = { doc: string; motivo?: string };

const STOPWORDS = new Set([
  "de",
  "la",
  "el",
  "y",
  "en",
  "del",
  "los",
  "las",
  "the",
  "and",
  "for",
  "size",
  "regular",
]);

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokensSignificativos(s: string): string[] {
  return norm(s)
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function parseNum(v: string | null | undefined): number | null {
  if (v == null || !String(v).trim()) return null;
  const n = parseFloat(String(v).replace(/[^\d.,-]/g, "").replace(/,/g, "."));
  return Number.isFinite(n) ? n : null;
}

function resumenMencionaInconsistencias(texto: string): boolean {
  return /(inconsisten|contradic|divergen|cr[ií]tic)/i.test(texto);
}

function resumenMencionaFaltantes(texto: string): boolean {
  return /(faltan|faltante|pendient|no se adjunta|no se presenta|falta\b)/i.test(texto);
}

function resumirCruceSanitizado<T extends {
  faltantes: FaltanteValidacion[];
  inconsistencias: string[];
  alertas: { nivel: string; texto: string }[];
  resumen?: string;
}>(cruce: T): string {
  const resumen = String(cruce.resumen ?? "").trim();
  if (!resumen) return resumen;

  const hayIncons = cruce.inconsistencias.length > 0;
  const hayFalt = cruce.faltantes.length > 0;
  const hayAlertas = cruce.alertas.some((a) => a.nivel === "warn" || a.nivel === "error");
  const contradiceIncons = !hayIncons && resumenMencionaInconsistencias(resumen);
  const contradiceFalt = !hayFalt && resumenMencionaFaltantes(resumen);
  if (!contradiceIncons && !contradiceFalt) return resumen;

  if (!hayIncons && !hayFalt) {
    return hayAlertas
      ? "No se detectan inconsistencias ni faltantes en los documentos presentes. Quedan alertas u observaciones para revisar."
      : "No se detectan inconsistencias ni faltantes en los documentos presentes.";
  }
  if (!hayIncons) {
    return `No se detectan inconsistencias entre los documentos presentes. Quedan ${cruce.faltantes.length} faltante(s) por regularizar.`;
  }
  if (!hayFalt) {
    return hayAlertas
      ? `Se detectan ${cruce.inconsistencias.length} inconsistencia(s) entre los documentos presentes. Además hay alertas u observaciones para revisar.`
      : `Se detectan ${cruce.inconsistencias.length} inconsistencia(s) entre los documentos presentes.`;
  }
  return `Se detectan ${cruce.inconsistencias.length} inconsistencia(s) y ${cruce.faltantes.length} faltante(s) en los documentos presentes.`;
}

/** Misma línea comercial: distinto nivel de detalle en la descripción. */
export function mercaderiasCompatibles(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const ta = tokensSignificativos(a);
  const tb = tokensSignificativos(b);
  if (!ta.length || !tb.length) return false;

  const setB = new Set(tb);
  return ta.some((t) => setB.has(t));
}

export function mercaderiasTodasCompatibles(valores: string[]): boolean {
  if (valores.length < 2) return true;
  const ref = valores[0]!;
  return valores.every((v) => mercaderiasCompatibles(ref, v));
}

/** Misma partida: cantidad (y peso si hay) alineados entre documentos. */
export function mismaPartidaComercial(docs: DocDatosMin[]): boolean {
  if (docs.length < 2) return false;

  const cantidades = docs
    .map((d) => parseNum(d.datos.mercaderia?.cantidad))
    .filter((n): n is number => n != null);
  if (cantidades.length < 2) return false;
  const cantUnica = new Set(cantidades.map((c) => Math.round(c * 1000)));
  if (cantUnica.size !== 1) return false;

  const pesos = docs
    .map((d) => parseNum(d.datos.mercaderia?.peso_neto))
    .filter((n): n is number => n != null);
  if (pesos.length >= 2) {
    const max = Math.max(...pesos);
    const min = Math.min(...pesos);
    if (max > 0 && min / max < 0.9) return false;
  }

  return true;
}

export function elegirMercaderiaPreferida(valores: string[]): string {
  return [...valores].sort((a, b) => b.length - a.length)[0]!;
}

export function esUnidadMasa(u: string): boolean {
  return /\b(mt|mts|m\.?t\.?|tm|tn|ton|tonelada|tons?|kg|kgs|kilos?)\b/i.test(u);
}

export function esUnidadBulto(u: string): boolean {
  return /\b(bag|bags|bolsa|bolsas|bulto|bultos|sack|sacks|pallet|pallets|drum|drums)\b/i.test(
    u,
  );
}

/** Unidad de venta (masa) y unidad de embalaje en documentos distintos, cantidades coherentes. */
export function unidadesCompatiblesEntreDocs(docs: DocDatosMin[]): boolean {
  const filas = docs
    .map((d) => ({
      unidad: String(d.datos.mercaderia?.unidad ?? "").trim(),
      cantidad: parseNum(d.datos.mercaderia?.cantidad),
      bultos: parseNum(d.datos.mercaderia?.bultos),
    }))
    .filter((f) => f.unidad);

  if (filas.length < 2) return false;

  const masa = filas.filter((f) => esUnidadMasa(f.unidad));
  const bulto = filas.filter((f) => esUnidadBulto(f.unidad));
  if (!masa.length || !bulto.length) return false;

  const numsMasa = masa.map((f) => f.cantidad).filter((n): n is number => n != null);
  const numsBulto = bulto
    .map((f) => f.bultos ?? f.cantidad)
    .filter((n): n is number => n != null);

  if (numsMasa.length && numsBulto.length) {
    return numsMasa.some((m) =>
      numsBulto.some((b) => Math.abs(m - b) < 0.05),
    );
  }

  return true;
}

export function elegirUnidadPreferida(valores: string[]): string {
  return valores.find((u) => esUnidadMasa(u)) ?? valores[0]!;
}

/** Dedup textual de faltantes (sin agrupar por conceptos hardcodeados). */
export function deduplicarFaltantesPorConcepto<T extends FaltanteValidacion>(
  faltantes: T[],
): T[] {
  const out: T[] = [];
  for (const f of faltantes) {
    const nd = norm(f.doc);
    const dup = out.some(
      (x) =>
        norm(x.doc) === nd ||
        norm(x.doc).includes(nd) ||
        nd.includes(norm(x.doc)),
    );
    if (!dup) out.push(f);
  }
  return out;
}

/**
 * La IA puede aportar faltantes fundamentados en el marco normativo recuperado.
 */
export function filtrarFaltantesCruceIA<T extends FaltanteValidacion & { ref?: string }>(
  faltantes: T[],
  op: Pick<OperationRow, "tipo" | "pais_origen" | "pais_procedencia">,
  docsPresentes: string[],
  tiposDocumento?: string[],
): T[] {
  const esExpo = op.tipo.toLowerCase().startsWith("exp");
  if (esExpo) return faltantes;

  const origen = paisOrigenEfectivo(op);
  const auto = autocertificacionOrigen(origen);
  const presentes = docsPresentes.map((d) => norm(d));
  const tipos = new Set((tiposDocumento ?? []).map((t) => norm(t)));
  const tieneCertificadoOrigen =
    tipos.has("certificado_origen") ||
    presentes.some(
      (p) =>
        p.includes("certificado de origen") ||
        p.includes("certificate of origin"),
    );

  return faltantes.filter((f) => {
    const ref = String(f.ref ?? "").trim();
    if (ref.startsWith("ROM") && !auto.esMercosur) return false;

    const docNorm = norm(f.doc);
    const motivoNorm = norm(f.motivo ?? "");
    const texto = `${docNorm} ${motivoNorm}`;
    if (
      /certificado de origen|prueba de origen|declaracion de origen/.test(texto) &&
      presentes.some(
        (p) =>
          p.includes("certificado de origen") ||
          p.includes("certificate of origin") ||
          p.includes("origen"),
      )
    ) {
      return false;
    }

    if (tieneCertificadoOrigen && ref.startsWith("ROM")) {
      if (
        /art\.?\s*4|art\.?\s*18|art\.?\s*19|expedicion directa|tercer operador|calificacion de origen|cumplimiento.*origen|ap\.?\s*ii|documentacion de cumplimiento|comprobante de expedicion/i.test(
          texto,
        )
      ) {
        return false;
      }
    }

    return true;
  });
}

export function sanearSalidaCruceIA<
  T extends {
    faltantes: FaltanteValidacion[];
    inconsistencias: string[];
    alertas: { nivel: string; texto: string }[];
    resumen?: string;
  },
>(
  cruce: T,
  op?: Pick<OperationRow, "tipo" | "pais_origen" | "pais_procedencia">,
  docsPresentes?: string[],
  tiposDocumento?: string[],
): T {
  let faltantes = deduplicarFaltantesPorConcepto(cruce.faltantes);
  if (op) {
    faltantes = filtrarFaltantesCruceIA(
      faltantes,
      op,
      docsPresentes ?? [],
      tiposDocumento,
    );
  }
  return {
    ...cruce,
    faltantes,
    resumen: resumirCruceSanitizado({ ...cruce, faltantes }),
  };
}
