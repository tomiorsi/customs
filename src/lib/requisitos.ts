import "server-only";

import { antidumpingPorNcmPais, fichaPosicion } from "@/lib/vuce";
import { paisOrigenEfectivo } from "@/lib/cotizador";
import type { OperationRow } from "@/lib/data";

/**
 * Datos oficiales de parquets (VUCE, antidumping) por NCM/origen.
 * Los requisitos documentales salen del cruce con normas.parquet vía IA;
 * acá solo tablas oficiales, sin reglas de negocio hardcodeadas.
 */

export type RequisitoTipo = "intervencion" | "antidumping";

export type RequisitoTramite = { nombre: string | null; link: string | null };

export type Requisito = {
  id: string;
  tipo: RequisitoTipo;
  titulo: string;
  detalle: string;
  nivel: "requerido" | "verificar";
  organismo?: string | null;
  tramites?: RequisitoTramite[];
};

export type RequisitosResult = {
  ncm: string | null;
  requisitos: Requisito[];
};

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function detalleIntervencion(i: {
  organismo: string;
  regimen: string | null;
  resumen: string | null;
  estados: string[];
  validada: boolean;
}): string {
  const partes: string[] = [];
  if (i.resumen) partes.push(i.resumen);
  if (i.regimen) partes.push(`Régimen: ${i.regimen}`);
  if (i.estados.length) partes.push(`Estados mercadería: ${i.estados.join(", ")}`);
  partes.push(
    i.validada
      ? "Intervención validada en VUCE."
      : "Intervención a verificar en VUCE.",
  );
  return partes.join(" · ");
}

export async function requisitosOperacion(
  op: OperationRow,
): Promise<RequisitosResult> {
  const requisitos: Requisito[] = [];
  const esExpo = op.tipo.toLowerCase().startsWith("exp");
  const paisRelevante = esExpo ? op.pais_destino : paisOrigenEfectivo(op);

  if (op.ncm) {
    try {
      const ficha = await fichaPosicion(op.ncm);
      for (const i of ficha.intervenciones) {
        requisitos.push({
          id: `interv_${slug(i.organismo)}_${slug(i.regimen ?? "")}`,
          tipo: "intervencion",
          titulo: i.regimen ?? `Intervención ${i.organismo}`,
          detalle: detalleIntervencion(i),
          nivel: i.validada ? "requerido" : "verificar",
          organismo: i.organismo,
          tramites: i.tramites?.map((t) => ({
            nombre: t.nombre,
            link: t.link,
          })),
        });
      }
    } catch {
      /* sin VUCE */
    }

    try {
      const ad = await antidumpingPorNcmPais(op.ncm, paisRelevante);
      if (ad.medidas.length > 0) {
        const principal = ad.medidas[0];
        const medida = [principal.tipoMedida, principal.medidaAplicada]
          .filter(Boolean)
          .join(" · ");
        requisitos.push({
          id: "antidumping",
          tipo: "antidumping",
          titulo: "Posible antidumping",
          detalle:
            `Medidas vigentes para ${ad.pais ?? "este origen"}` +
            (medida ? ` (${medida})` : "") +
            ". Confirmá el derecho antes de avanzar.",
          nivel: "verificar",
        });
      }
    } catch {
      /* sin VUCE */
    }
  }

  return { ncm: op.ncm ?? null, requisitos };
}
