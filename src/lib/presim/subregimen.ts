import "server-only";

import { DESTINACIONES } from "@/lib/destinaciones";
import { existe } from "@/lib/presim/tablas";

/**
 * Qué subrégimen del SIM corresponde a una destinación.
 *
 * Elegir mal el subrégimen es presentar mal la declaración, así que acá no se
 * adivina: el código se **compone** con las dos reglas de la RG 4200 (Anexo II)
 * y después se verifica contra `STA`. Si no da, se devuelve el motivo en vez de
 * un código plausible.
 *
 * ## Regla 1 — el último dígito es la situación de arribo
 *
 * Vale para todas las familias de importación, y no es una lectura mía: el
 * Anexo II lo dice para cada código. Verificado además contra las 24
 * descripciones de la tabla del Kit que mencionan la situación: **24 de 24**.
 *
 * | Dígito | Situación | Qué dice el Anexo II |
 * |---|---|---|
 * | 1 | sin documento de transporte | «que arribe sin documento de transporte por la vía postal y aquella que lo hace por sus propios medios» |
 * | 4 | con documento de transporte | «cuya solicitud de destinación es efectuada con posterioridad al arribo del medio de transporte» |
 * | 5 | directo a plaza (DAP) | «efectuada con anterioridad al arribo del medio de transporte para su despacho directo a plaza» |
 * | 6 | sobre depósito de almacenamiento | «previamente sometida a la destinación suspensiva de depósito de almacenamiento» |
 *
 * Las únicas tres que no siguen el dígito —IC07, IT07, IT17— son del régimen
 * automotriz, que es un eje aparte y no una excepción a la regla.
 *
 * **`DAP` acá es «Despacho Directo A Plaza» (art. 278 del Código Aduanero), no
 * el Incoterm DAP (*Delivered At Place*).** Son cosas sin relación y el sistema
 * tiene un campo `incoterm` que puede valer «DAP»: confundirlos cambiaría el
 * subrégimen por el término de entrega pactado con el proveedor.
 *
 * ## Regla 2 — la transformación decide la decena, y la fija el motivo
 *
 * En la temporaria de importación el motivo (`CDDTMOT`) y el subrégimen tienen
 * que ser coherentes, porque los dos salen del mismo artículo:
 *
 * - **Art. 31, punto 1** del Dto. 1.001/82 (motivos `I31.1x`): la mercadería
 *   vuelve *en el mismo estado* → `IT0x`.
 * - **Art. 31, apartado 3** (motivo `I31.3`, «transformación, elaboración,
 *   combinación, mezcla o reparación») → `IT1x`, que el Anexo II describe
 *   justamente como «en el marco del Art. 31, Ap. 3, del Dto. 1.001/82».
 *
 * En exportación temporaria la numeración va al revés —`ET01` es **con**
 * transformación y `ET02` **sin**—, así que no se puede trasladar la intuición
 * de importación.
 */

/** Cómo llegó la mercadería, que es lo que fija el último dígito. */
export type SituacionArribo =
  /** Vía postal o por sus propios medios: no hay documento de transporte. */
  | "sin_documento"
  /** Lo habitual: se destina después de que arribó el medio de transporte. */
  | "con_documento"
  /** Se destina antes del arribo, para despacho directo a plaza (art. 278 CA). */
  | "directo_a_plaza"
  /** Ya estaba en depósito de almacenamiento bajo destinación suspensiva. */
  | "sobre_deposito";

const DIGITO: Record<SituacionArribo, string> = {
  sin_documento: "1",
  con_documento: "4",
  directo_a_plaza: "5",
  sobre_deposito: "6",
};

/**
 * Motivos del art. 31 que implican transformación.
 *
 * Del Anexo III de la RG 4200: los `I31.1x` son las temporarias que vuelven en
 * el mismo estado (muestras, ferias, envases, pallets, material científico) y
 * `I31.3` es «mercadería para transformación/elaboración/combinación/mezcla o
 * reparación». La familia se lee del código, así que un motivo nuevo del
 * apartado 3 entra solo.
 */
export function motivoImplicaTransformacion(motivo: string | null | undefined): boolean {
  return /^I31\.3/i.test((motivo ?? "").trim());
}

/**
 * Prefijo del subrégimen por destinación.
 *
 * `null` donde la tabla local no alcanza para decidir, y el porqué está en el
 * comentario: es preferible no emitir a emitir un código que suena bien.
 */
function prefijo(
  destinacion: string,
  conTransformacion: boolean,
): { prefijo: string } | { falta: string } {
  switch (destinacion) {
    case "impo_consumo":
      return { prefijo: "IC0" };

    // Las dos temporarias de importación se distinguen por el apartado del
    // art. 31, no por el nombre del régimen.
    case "impo_temp_1001":
      return conTransformacion
        ? { falta: "La temporaria de bienes de capital vuelve en el mismo estado: con transformación corresponde perfeccionamiento industrial (IT1x), no esta destinación." }
        : { prefijo: "IT0" };
    case "impo_temp_1330":
      return { prefijo: "IT1" };

    case "impo_transito":
      return { prefijo: "TR0" };

    // IDA solo tiene IDA2 e IDA4, así que no sigue el dígito de arribo, y las
    // descripciones del Kit no dicen qué separa a una de otra.
    case "impo_deposito":
      return { falta: "El depósito de almacenamiento usa IDA2 o IDA4 y la tabla local no dice qué las separa." };

    // Zona franca tiene ZFI1 a ZFI8 y ZFE1 a ZFE7 sin descripción en la base
    // local: el criterio no se puede sostener con lo que hay.
    case "impo_zona_franca":
      return { falta: "Zona franca tiene ocho subregímenes de ingreso (ZFI1-ZFI8) sin descripción en la base local." };
    case "expo_zona_franca":
      return { falta: "Zona franca tiene siete subregímenes de egreso (ZFE1-ZFE7) sin descripción en la base local." };

    // En exportación no hay «arribo», así que el dígito no significa lo mismo y
    // el código va entero.
    case "expo_consumo":
      return { prefijo: "EC01" };
    case "expo_temporaria":
      // Ojo: acá la numeración va al revés que en importación.
      return { prefijo: conTransformacion ? "ET01" : "ET02" };

    case "expo_transito":
      return { falta: "El tránsito de exportación no tiene familia propia en la tabla local." };

    default:
      return { falta: `Destinación desconocida: ${destinacion}.` };
  }
}

export type ResultadoSubregimen =
  | { subregimen: string; motivo?: string }
  | { subregimen: null; porque: string };

/**
 * Destinación del sistema → subrégimen del SIM.
 *
 * `motivo` es el `CDDTMOT` de la temporaria de importación: de él sale si hay
 * transformación, así que conviene pasarlo antes que el flag.
 */
export function subregimenPara(opts: {
  destinacion: string;
  situacion: SituacionArribo;
  /** Motivo de la suspensiva. Manda sobre `conTransformacion` si viene. */
  motivo?: string | null;
  conTransformacion?: boolean;
  fecha?: Date;
}): ResultadoSubregimen {
  const { destinacion, situacion, fecha } = opts;

  const conTransformacion = opts.motivo
    ? motivoImplicaTransformacion(opts.motivo)
    : (opts.conTransformacion ?? false);

  const p = prefijo(destinacion, conTransformacion);
  if ("falta" in p) return { subregimen: null, porque: p.falta };

  // Los códigos de exportación vienen completos: no llevan dígito de arribo.
  const codigo = p.prefijo.length === 4 ? p.prefijo : p.prefijo + DIGITO[situacion];

  // La última palabra la tiene la tabla del SIM, no esta función: si el código
  // compuesto no existe o no regía en esa fecha, no se emite.
  if (!existe("STA", codigo, fecha)) {
    return {
      subregimen: null,
      porque: `${codigo} no existe en STA o no regía en esa fecha.`,
    };
  }

  return { subregimen: codigo, motivo: opts.motivo ?? undefined };
}

/** Las destinaciones que hoy se pueden resolver, para mostrarlas en pantalla. */
export function destinacionesResolubles(fecha?: Date): {
  destinacion: string;
  label: string;
  subregimenes: Partial<Record<SituacionArribo, string>>;
  porque?: string;
}[] {
  return DESTINACIONES.map((d) => {
    const subregimenes: Partial<Record<SituacionArribo, string>> = {};
    let porque: string | undefined;
    for (const s of Object.keys(DIGITO) as SituacionArribo[]) {
      const r = subregimenPara({ destinacion: d.id, situacion: s, fecha });
      if (r.subregimen === null) porque ??= r.porque;
      else subregimenes[s] = r.subregimen;
    }
    return { destinacion: d.id, label: d.label, subregimenes, porque };
  });
}
