import "server-only";

import { paisOrigenEfectivo } from "@/lib/cotizador";
import { DOC_LABELS } from "@/lib/docs";
import type { OperationRow } from "@/lib/data";
import type { FaltanteIA } from "@/lib/ia-documentos";
import { autocertificacionOrigen, ROM } from "@/lib/origen-mercosur";
import { requisitosOperacion } from "@/lib/requisitos";

/**
 * Documentación exigida por la operación (NCM, origen, VUCE, ROM).
 * No depende del cruce IA: se calcula en cuanto hay datos reconciliados.
 */
export async function derivarFaltantesOperacion(
  op: OperationRow,
): Promise<FaltanteIA[]> {
  const faltantes: FaltanteIA[] = [];
  const esExpo = op.tipo.toLowerCase().startsWith("exp");

  const req = await requisitosOperacion(op);
  for (const r of req.requisitos) {
    faltantes.push({
      doc: r.titulo,
      motivo: r.detalle,
      ref:
        r.tipo === "antidumping"
          ? "VUCE · Antidumping"
          : "VUCE · Intervención",
    });
  }

  if (!esExpo) {
    const origen = paisOrigenEfectivo(op);
    const auto = autocertificacionOrigen(origen);
    if (auto.esMercosur) {
      const adjunto = auto.vigente
        ? "Adjuntá certificado de origen por entidad habilitada o declaración de origen en documento comercial firmado (Ap. V/VI ROM)."
        : "Adjuntá certificado de origen emitido por entidad habilitada (este origen no acepta autocertificación aún).";
      faltantes.push({
        doc: DOC_LABELS.certificado_origen,
        motivo: `${auto.nota} ${adjunto}`,
        ref: `ROM · ${ROM.articuloPrueba}`,
      });
    }
  }

  if (!op.ncm?.trim()) {
    faltantes.push({
      doc: "Clasificación arancelaria (NCM)",
      motivo:
        "Sin NCM específica no se pueden determinar intervenciones, antidumping ni tributos. Confirmá la posición antes de oficializar.",
      ref: "CA · Art. 40",
    });
  }

  return faltantes;
}

const REF_DETERMINISTICO = /^(VUCE\s·|ROM\s·|CA\s·\sArt\.\s40)/;

/** Faltante generado por derivarFaltantesOperacion (VUCE/ROM/NCM), no por cruce IA. */
export function esFaltanteDeterministico(f: { ref?: string | null }): boolean {
  const ref = f.ref?.trim() ?? "";
  return REF_DETERMINISTICO.test(ref);
}

export function quitarFaltantesDeterministicos<T extends { ref?: string | null }>(
  faltantes: T[],
): T[] {
  return faltantes.filter((f) => !esFaltanteDeterministico(f));
}
