import "server-only";

import { arancelPorNcm } from "@/lib/clasificador/motor";
import { paisOrigenEfectivo } from "@/lib/cotizador";
import {
  autocertificacionOrigen,
  contextoAutocertIA,
} from "@/lib/origen-mercosur";
import type { OperationRow } from "@/lib/data";
import {
  contextoDestinoImportacionIA,
  DESTINO_IMPORTACION,
  esOperacionExportacion,
} from "@/lib/operacion-aduana";
import {
  combinarSenales,
  recuperarMarcoNormativo,
  senalesDesdeOperacion,
} from "@/lib/normas-retrieval";
import {
  antidumpingPorNcmPais,
  contextoAntidumpingVuceIA,
  contextoIntervencionesVuceIA,
  contextoTributosVuceIA,
  fichaPosicion,
} from "@/lib/vuce";

type OpParquet = Pick<
  OperationRow,
  | "ncm"
  | "pais_origen"
  | "pais_procedencia"
  | "pais_destino"
  | "tipo"
  | "via"
  | "forma_pago"
  | "mercaderia"
  | "incoterm"
  | "unidad"
  | "tipo_embalaje"
>;

export function contextoOperacionIA(op: OpParquet): string {
  const esExpo = esOperacionExportacion(op.tipo);
  const destinoImpo = op.pais_destino?.trim() || DESTINO_IMPORTACION;
  return [
    `Operación ${esExpo ? "EXPORTACIÓN" : "IMPORTACIÓN"} · vía ${op.via ?? "s/d"} · NCM ${op.ncm ?? "s/d"}`,
    op.mercaderia ? `Mercadería: ${op.mercaderia}` : "",
    op.pais_origen ? `País origen: ${op.pais_origen}` : "",
    op.pais_procedencia ? `País procedencia: ${op.pais_procedencia}` : "",
    esExpo && op.pais_destino ? `País destino: ${op.pais_destino}` : "",
    !esExpo ? `País destino aduanero: ${destinoImpo}` : "",
    contextoDestinoImportacionIA(op.tipo, destinoImpo),
    op.incoterm ? `Incoterm: ${op.incoterm}` : "",
    op.unidad ? `Unidad: ${op.unidad}` : "",
    op.tipo_embalaje ? `Embalaje: ${op.tipo_embalaje}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const cacheContextoValidacion = new Map<
  string,
  { texto: string; at: number }
>();
const TTL_CONTEXTO_MS = 10 * 60 * 1000;

function claveCacheContextoValidacion(
  op: OpParquet,
  senales: string[],
  compacto?: boolean,
): string {
  return [
    compacto ? "c" : "f",
    op.tipo,
    op.ncm ?? "",
    op.via ?? "",
    op.pais_origen ?? "",
    op.pais_procedencia ?? "",
    op.pais_destino ?? "",
    op.forma_pago ?? "",
    op.incoterm ?? "",
    op.unidad ?? "",
    op.tipo_embalaje ?? "",
    [...senales].sort().join(","),
  ].join("|");
}

export function invalidarCacheContextoValidacion(_op?: OpParquet): void {
  cacheContextoValidacion.clear();
}

/**
 * Parquets operativos (VUCE + nomenclador) filtrados por NCM/origen.
 * Una sola lectura de fichaPosicion por llamada.
 */
export async function contextoDatosOficialesParquet(op: OpParquet): Promise<string> {
  const lineas: string[] = [
    "DATOS OFICIALES (parquets; cruzá SOLO después de leer documentos):",
  ];

  if (!op.ncm?.trim()) {
    lineas.push("- Sin NCM: no hay intervenciones VUCE ni arancel del nomenclador.");
    return lineas.join("\n");
  }

  const esExpo = op.tipo.toLowerCase().startsWith("exp");
  const paisRelevante = esExpo ? op.pais_destino : paisOrigenEfectivo(op);

  const [arancel, ficha, antidumpingOrigen] = await Promise.all([
    arancelPorNcm(op.ncm),
    fichaPosicion(op.ncm),
    antidumpingPorNcmPais(op.ncm, paisRelevante),
  ]);

  if (arancel) {
    const partes = [
      `- Tributación aplicable (VUCE + nomenclador): ${arancel.codigo}`,
      `DIE extrazona ${arancel.di}%`,
    ];
    if (arancel.aec != null && arancel.aec !== arancel.di) {
      partes.push(`AEC ${arancel.aec}%`);
    }
    if (arancel.dii != null) partes.push(`DII ${arancel.dii}%`);
    if (arancel.te != null) partes.push(`TE ${arancel.te}%`);
    if (arancel.iva != null) partes.push(`IVA ${arancel.iva}%`);
    if (arancel.dieRegimen) partes.push(arancel.dieRegimen);
    if (arancel.de > 0) partes.push(`DE exportación ${arancel.de}%`);
    if (arancel.adicional > 0) partes.push(`adicional ${arancel.adicional}%`);
    lineas.push(partes.join(" · "));
  } else {
    lineas.push("- Nomenclador: sin match para la NCM cargada.");
  }

  const intervTexto = contextoIntervencionesVuceIA({
    ncm8: ficha.ncm8,
    intervenciones: ficha.intervenciones,
    regimenes: ficha.regimenes,
  });
  if (intervTexto) {
    lineas.push(
      "LISTADO VUCE (referencia por NCM; confirmar en documentos leídos antes de exigir trámite):\n" +
        intervTexto,
    );
  } else {
    lineas.push("- Intervenciones VUCE: sin registros para esta NCM.");
  }

  const tribTexto = contextoTributosVuceIA(ficha.tributos);
  if (tribTexto) lineas.push(tribTexto);

  const medidas =
    antidumpingOrigen.medidas.length > 0
      ? antidumpingOrigen.medidas
      : ficha.antidumping.filter(
          (m) => !paisRelevante || m.pais === antidumpingOrigen.pais,
        );
  const adTexto = contextoAntidumpingVuceIA(
    medidas,
    antidumpingOrigen.pais ?? paisRelevante,
  );
  if (adTexto) lineas.push(adTexto);

  return lineas.join("\n");
}

async function armarContextoValidacionDocumental(
  op: OpParquet,
  senalesExtra: string[] = [],
  opts?: { compacto?: boolean },
): Promise<string> {
  const senales = combinarSenales(senalesDesdeOperacion(op), senalesExtra);

  const [{ contexto: marco }, datosParquet] = await Promise.all([
    recuperarMarcoNormativo(senales, {
      limiteExtraSenales: opts?.compacto ? 4 : 8,
      compacto: opts?.compacto,
    }),
    contextoDatosOficialesParquet(op),
  ]);

  const partes: string[] = [];
  if (senales.length) {
    partes.push(`SEÑALES ACTIVAS (recuperación normativa): ${senales.join(", ")}`);
  }

  const origen = paisOrigenEfectivo(op);
  const auto = autocertificacionOrigen(origen);
  if (auto.esMercosur) {
    partes.push(contextoAutocertIA(auto));
  } else if (origen?.trim()) {
    partes.push(
      `ORIGEN (${origen}): el Régimen de Origen Mercosur (ROM / ACE 18) no aplica a este origen. ` +
        "No exijas certificado de origen MERCOSUR ni autocertificación ROM salvo que los documentos " +
        "indiquen explícitamente otro acuerdo preferencial aplicable.",
    );
  }

  if (marco) partes.push(marco);
  partes.push(datosParquet);

  return partes.filter(Boolean).join("\n\n");
}

export async function contextoValidacionDocumental(
  op: OpParquet,
  senalesExtra: string[] = [],
  opts?: { compacto?: boolean },
): Promise<string> {
  const senales = combinarSenales(senalesDesdeOperacion(op), senalesExtra);
  const clave = claveCacheContextoValidacion(op, senales, opts?.compacto);
  const hit = cacheContextoValidacion.get(clave);
  if (hit && Date.now() - hit.at < TTL_CONTEXTO_MS) return hit.texto;

  const texto = await armarContextoValidacionDocumental(op, senalesExtra, opts);
  cacheContextoValidacion.set(clave, { texto, at: Date.now() });
  return texto;
}

export async function contextoNormativoSubida(
  op: OpParquet,
  senalesExtra: string[] = [],
): Promise<string> {
  return contextoValidacionDocumental(op, senalesExtra);
}
