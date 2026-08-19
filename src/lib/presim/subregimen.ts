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
 * Motivos que implican transformación.
 *
 * Son **dos vías distintas**, no una:
 *
 * - **`I31.3`** — Dto. 1.001/82, art. 31 ap. 3: «mercadería para
 *   transformación, elaboración, combinación, mezcla o reparación». Los
 *   `I31.1x` del mismo decreto son los que vuelven en el mismo estado.
 * - **`D1330/04-Ax`** — Decreto 1.330/04, el régimen de perfeccionamiento
 *   industrial. La tabla `MOT` tiene los artículos 6, 7 y 8, con plazos de
 *   360, 720 y 2160 días.
 *
 * La segunda faltaba y la trajo una declaración real: el IT14 del estudio lleva
 * `CDDTMOT=D1330/04-A6`. Sin esto, un IT14 legítimo cargado sobre la
 * destinación de bienes de capital pasaba como si no transformara.
 *
 * Se leen por familia y no por lista cerrada, así que un artículo nuevo del
 * 1330/04 entra solo.
 */
export function motivoImplicaTransformacion(motivo: string | null | undefined): boolean {
  const m = (motivo ?? "").trim();
  return /^I31\.3/i.test(m) || /^D1330\/04/i.test(m);
}

/* ─────────────────────────── zona franca ─────────────────────────── */

/**
 * Zona franca no usa el dígito de arribo: sus subregímenes se cruzan por dos
 * ejes propios, y así los describe la RG 1452 (`subregimenes.json`).
 *
 * **Ingreso** — de dónde viene × para qué entra:
 *
 * | | del territorio aduanero | del exterior |
 * |---|---|---|
 * | bienes de capital, radicación definitiva | ZFI1 | ZFI3 |
 * | almacenamiento / comercialización / reparación | ZFI4 | ZFI5 |
 * | insumos para proceso productivo | ZFI7 | ZFI8 |
 *
 * **Egreso** — a dónde va × qué sale:
 *
 * | | al territorio aduanero | al exterior |
 * |---|---|---|
 * | en el mismo estado | ZFE1 | ZFE2 |
 * | producto de un proceso productivo | ZFE3 | ZFE4 |
 * | residuo con valor comercial | ZFE5 | ZFE6 |
 *
 * Un detalle que conviene tener presente: el **régimen arancelario del egreso
 * depende del destino**, no de que sea una salida. ZFE1 y ZFE3 son `IMPCON`
 * —salir de la zona franca hacia el territorio aduanero es una importación— y
 * ZFE2 y ZFE4 son `EXPCON`. La zona franca no es territorio aduanero general.
 */
export type OrigenZonaFranca = "exterior" | "territorio_aduanero";
export type FinalidadZonaFranca = "bienes_capital" | "almacenamiento" | "insumos";
export type SalidaZonaFranca = "mismo_estado" | "producto_proceso" | "residuo";

const ZF_INGRESO: Record<FinalidadZonaFranca, Record<OrigenZonaFranca, string>> = {
  bienes_capital: { territorio_aduanero: "ZFI1", exterior: "ZFI3" },
  almacenamiento: { territorio_aduanero: "ZFI4", exterior: "ZFI5" },
  insumos: { territorio_aduanero: "ZFI7", exterior: "ZFI8" },
};

const ZF_EGRESO: Record<SalidaZonaFranca, Record<OrigenZonaFranca, string>> = {
  mismo_estado: { territorio_aduanero: "ZFE1", exterior: "ZFE2" },
  producto_proceso: { territorio_aduanero: "ZFE3", exterior: "ZFE4" },
  residuo: { territorio_aduanero: "ZFE5", exterior: "ZFE6" },
};

/* ─────────────────────────── resolución ─────────────────────────── */

type Resuelto = { codigo: string } | { falta: string };

/**
 * El subrégimen de cada destinación.
 *
 * Devuelve el código entero cuando la familia no usa el dígito de arribo
 * (exportación, zona franca) y el prefijo cuando sí, para que lo complete
 * `subregimenPara`.
 */
function resolver(
  destinacion: string,
  conTransformacion: boolean,
  zf: { origen?: OrigenZonaFranca; finalidad?: FinalidadZonaFranca; salida?: SalidaZonaFranca },
  situacion: SituacionArribo,
): Resuelto {
  switch (destinacion) {
    case "impo_consumo":
      return { codigo: "IC0" + DIGITO[situacion] };

    // Las dos temporarias de importación se distinguen por el apartado del
    // art. 31, no por el nombre del régimen.
    case "impo_temp_1001":
      return conTransformacion
        ? { falta: "La temporaria de bienes de capital vuelve en el mismo estado: con transformación corresponde perfeccionamiento industrial (IT1x), no esta destinación." }
        : { codigo: "IT0" + DIGITO[situacion] };
    case "impo_temp_1330":
      return { codigo: "IT1" + DIGITO[situacion] };

    case "impo_transito":
      return { codigo: "TR0" + DIGITO[situacion] };

    /**
     * Depósito de almacenamiento: la familia tiene solo IDA2 e IDA4 y no sigue
     * el dígito de arribo en las cuatro posiciones.
     *
     * IDA4 es el que corresponde con documento de transporte —dígito 4, la
     * misma regla que el resto— y es además el único que el estudio usa: 203
     * despachos contra ninguno de IDA2 en los 13.671 de `link_caratula.csv`.
     * IDA2 es el que figura en la RG 1452; IDA4 nació en 2006, después de esa
     * resolución, y por eso no está en el anexo.
     */
    case "impo_deposito":
      return situacion === "con_documento"
        ? { codigo: "IDA4" }
        : { falta: "El depósito de almacenamiento solo tiene IDA2 e IDA4: fuera de «con documento de transporte» no hay código que le corresponda." };

    case "impo_zona_franca": {
      if (!zf.finalidad || !zf.origen) {
        return { falta: "El ingreso a zona franca necesita saber de dónde viene la mercadería y para qué entra: son los dos ejes que eligen entre ZFI1, ZFI3, ZFI4, ZFI5, ZFI7 y ZFI8." };
      }
      return { codigo: ZF_INGRESO[zf.finalidad][zf.origen] };
    }

    case "expo_zona_franca": {
      if (!zf.salida || !zf.origen) {
        return { falta: "El egreso de zona franca necesita saber qué sale y hacia dónde: son los dos ejes que eligen entre ZFE1 a ZFE6." };
      }
      return { codigo: ZF_EGRESO[zf.salida][zf.origen] };
    }

    // En exportación no hay «arribo», así que el dígito no significa lo mismo y
    // el código va entero.
    case "expo_consumo":
      return { codigo: "EC01" };
    case "expo_temporaria":
      // Ojo: acá la numeración va al revés que en importación.
      return { codigo: conTransformacion ? "ET01" : "ET02" };

    /**
     * El tránsito de exportación no se declara con un subrégimen del SIM.
     *
     * No es que falte el dato: la mercadería ya fue destinada a exportación y
     * lo que se registra para moverla hasta la aduana de salida es el MIC/DTA
     * en SINTIA, que es otro documento. Los TRB* de `STA` son trasbordo, que es
     * otra cosa. Por eso acá no hay código y no debería inventarse uno.
     */
    case "expo_transito":
      return { falta: "El tránsito de exportación se registra por MIC/DTA en SINTIA, no con un subrégimen del SIM." };

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
  /** De dónde viene la mercadería, o hacia dónde va. Solo en zona franca. */
  origenZonaFranca?: OrigenZonaFranca;
  /** Para qué entra a la zona franca. */
  finalidadZonaFranca?: FinalidadZonaFranca;
  /** Qué sale de la zona franca. */
  salidaZonaFranca?: SalidaZonaFranca;
  fecha?: Date;
}): ResultadoSubregimen {
  const { destinacion, situacion, fecha } = opts;

  const conTransformacion = opts.motivo
    ? motivoImplicaTransformacion(opts.motivo)
    : (opts.conTransformacion ?? false);

  const r = resolver(
    destinacion,
    conTransformacion,
    {
      origen: opts.origenZonaFranca,
      finalidad: opts.finalidadZonaFranca,
      salida: opts.salidaZonaFranca,
    },
    situacion,
  );
  if ("falta" in r) return { subregimen: null, porque: r.falta };

  // La última palabra la tiene la tabla del SIM, no esta función: si el código
  // compuesto no existe o no regía en esa fecha, no se emite.
  if (!existe("STA", r.codigo, fecha)) {
    return {
      subregimen: null,
      porque: `${r.codigo} no existe en STA o no regía en esa fecha.`,
    };
  }

  return { subregimen: r.codigo, motivo: opts.motivo ?? undefined };
}

/**
 * Todos los subregímenes que cada destinación puede tomar.
 *
 * Recorre los ejes que le correspondan a cada una: la situación de arribo en
 * importación, y los dos ejes propios en zona franca. Sirve para poblar un
 * selector y para ver de un vistazo qué queda sin resolver.
 */
export function destinacionesResolubles(fecha?: Date): {
  destinacion: string;
  label: string;
  subregimenes: string[];
  porque?: string;
}[] {
  return DESTINACIONES.map((d) => {
    const subregimenes = new Set<string>();
    let porque: string | undefined;

    const anotar = (r: ResultadoSubregimen) => {
      if (r.subregimen === null) porque ??= r.porque;
      else subregimenes.add(r.subregimen);
    };

    if (d.id === "impo_zona_franca") {
      for (const finalidad of Object.keys(ZF_INGRESO) as FinalidadZonaFranca[]) {
        for (const origen of ["territorio_aduanero", "exterior"] as OrigenZonaFranca[]) {
          anotar(
            subregimenPara({
              destinacion: d.id,
              situacion: "con_documento",
              finalidadZonaFranca: finalidad,
              origenZonaFranca: origen,
              fecha,
            }),
          );
        }
      }
    } else if (d.id === "expo_zona_franca") {
      for (const salida of Object.keys(ZF_EGRESO) as SalidaZonaFranca[]) {
        for (const origen of ["territorio_aduanero", "exterior"] as OrigenZonaFranca[]) {
          anotar(
            subregimenPara({
              destinacion: d.id,
              situacion: "con_documento",
              salidaZonaFranca: salida,
              origenZonaFranca: origen,
              fecha,
            }),
          );
        }
      }
    } else {
      for (const s of Object.keys(DIGITO) as SituacionArribo[]) {
        anotar(subregimenPara({ destinacion: d.id, situacion: s, fecha }));
      }
    }

    return {
      destinacion: d.id,
      label: d.label,
      subregimenes: [...subregimenes].sort(),
      porque: subregimenes.size ? undefined : porque,
    };
  });
}
