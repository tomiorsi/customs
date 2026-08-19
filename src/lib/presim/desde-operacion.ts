import "server-only";

import type { OperationWithClient } from "@/lib/data";
import { codigoDivisa, codigoIncoterm, codigoPais, codigoUnidad } from "@/lib/presim/catalogos";
import { buscar, vigentes } from "@/lib/presim/tablas";
import type { ItemSim, OperacionSim } from "@/lib/presim/armar";
import { subregimenPara, type SituacionArribo } from "@/lib/presim/subregimen";

/**
 * Una operación del sistema → la operación que entiende el armador.
 *
 * Es la última pieza: con esto, una carpeta cargada en la plataforma sale como
 * archivo del pre-SIM.
 *
 * **Nunca completa un dato que no tiene.** Cuando algo no se puede resolver, va
 * a `faltantes` con el motivo y el campo queda vacío. La razón es la de siempre:
 * un valor inventado viaja al SIM como si fuera cierto y vuelve como rechazo
 * sin explicación, mientras que un hueco se ve antes de emitir.
 */

export type Faltante = {
  /** El campo del sistema, con el nombre que ve el usuario. */
  campo: string;
  porque: string;
};

export type Resultado = {
  operacion: OperacionSim | null;
  faltantes: Faltante[];
};

/* ─────────────────────────── auxiliares ─────────────────────────── */

const texto = (v: string | null | undefined): string | undefined => v?.trim() || undefined;

/** Importe del sistema, que puede venir con separadores. */
function importe(v: string | null | undefined): number | undefined {
  const s = (v ?? "").trim();
  if (!s) return undefined;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** `2026-08-18` → `18/08/2026`, que es como escribe las fechas el SIM. */
function fechaSim(iso: string | null | undefined): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? "").trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : undefined;
}

/**
 * Busca un código por descripción exacta en una tabla del Kit.
 *
 * `aduana` y `moneda` son campos de texto libre en el sistema: no hay lista de
 * la que elegir, así que el usuario puede escribir cualquier cosa. Se intenta
 * la coincidencia exacta con la tabla y, si no da, se reporta. **Lo que
 * corresponde arreglar es el formulario**, alimentándolo con `vigentes("BUR")`
 * y `vigentes("DEV")` para que no se pueda escribir algo que el SIM no acepta.
 */
function porNombreExacto(nombreTabla: string, valor: string, fecha?: Date): string | null {
  const v = valor.trim().toUpperCase();
  try {
    // Si ya viene el código, se usa tal cual.
    if (buscar(nombreTabla, v, fecha)) return v;
    const hit = vigentes(nombreTabla, fecha).find(
      (f) => (f.descripcion ?? "").trim().toUpperCase() === v,
    );
    return hit?.codigo ?? null;
  } catch {
    // La tabla no está exportada del Kit. Se reporta como faltante, que es lo
    // mismo que no poder resolver el valor: no se emite un código inventado.
    return null;
  }
}

/**
 * En qué situación llega la mercadería, que es lo que fija el último dígito del
 * subrégimen.
 *
 * Se deduce de dos datos que la carpeta ya tiene, y sigue el criterio de la
 * norma, no una preferencia nuestra:
 *
 * - **Sin documento de transporte** cuando no hay ninguno cargado. Es el caso
 *   de la vía postal y de la mercadería que llega por sus propios medios.
 * - **Directo a plaza** cuando la declaración se registra antes de que arribe
 *   el medio de transporte (art. 278 del Código Aduanero).
 * - **Con documento de transporte** en el resto, que es lo habitual.
 *
 * «Sobre depósito de almacenamiento» no se deduce: depende de si la mercadería
 * ya fue sometida a esa destinación suspensiva, y eso el sistema no lo sabe. Se
 * pasa a mano cuando corresponde.
 */
export function situacionDeArribo(
  op: Pick<OperationWithClient, "transporte_doc_nro" | "eta">,
  hoy = new Date(),
): SituacionArribo {
  if (!texto(op.transporte_doc_nro)) return "sin_documento";
  const eta = texto(op.eta);
  if (eta) {
    const d = new Date(eta);
    if (!Number.isNaN(d.getTime()) && d > hoy) return "directo_a_plaza";
  }
  return "con_documento";
}

/* ─────────────────────────── adaptador ─────────────────────────── */

export function operacionSimDesde(
  op: OperationWithClient,
  opts: {
    /** CUIT del despachante, de la cuenta del estudio. */
    cuitDespachante: string;
    /** Situación de arribo, si se conoce mejor que lo que se deduce. */
    situacion?: SituacionArribo;
    /** Motivo de la suspensiva (`MOT`), en temporarias. */
    motivo?: string;
    /** Fecha con la que se resuelven las vigencias. */
    fecha?: Date;
  },
): Resultado {
  const faltantes: Faltante[] = [];
  const falta = (campo: string, porque: string) => {
    faltantes.push({ campo, porque });
    return undefined;
  };
  const fecha = opts.fecha;

  /* ── subrégimen ── */
  const situacion = opts.situacion ?? situacionDeArribo(op);
  const destinacion = texto(op.destinacion);
  let subregimen: string | undefined;
  if (!destinacion) {
    falta("Destinación", "Sin destinación no se puede elegir el subrégimen.");
  } else {
    const r = subregimenPara({ destinacion, situacion, motivo: opts.motivo, fecha });
    if (r.subregimen === null) falta("Destinación", r.porque);
    else subregimen = r.subregimen;
  }

  /* ── partes ── */
  const cuitOperador = texto(op.client_cuit) ?? falta("CUIT del cliente", "La declaración la firma un CUIT.");

  /* ── aduana y divisa: texto libre, hay que resolverlos contra la tabla ── */
  const aduanaTxt = texto(op.aduana);
  const aduana = aduanaTxt
    ? (porNombreExacto("BUR", aduanaTxt, fecha) ??
       falta("Aduana", `«${aduanaTxt}» no coincide con ninguna aduana de BUR.`))
    : falta("Aduana", "No hay aduana cargada.");

  const dev = codigoDivisa(op.moneda, fecha);
  const divisa = dev.codigo ?? falta("Moneda", dev.porque);

  /* ── incoterm ── */
  const inc = codigoIncoterm(op.incoterm, fecha);
  const incoterm = inc.codigo ?? falta("Incoterm", inc.porque);

  /* ── valores ── */
  // El FOB es la base de todo el cálculo: sin él no hay declaración.
  const fob = importe(op.valor_fob) ?? falta("Valor FOB", "Es la base de la declaración.");

  /* ── el ítem ── */
  const item = armarItem(op, faltantes, fecha);

  if (
    !subregimen || !cuitOperador || !aduana || !divisa || !incoterm ||
    fob === undefined || !item
  ) {
    return { operacion: null, faltantes };
  }

  const operacion: OperacionSim = {
    subregimen,
    cuitOperador,
    cuitDespachante: opts.cuitDespachante,
    aduana,
    referencia: op.ref,
    incoterm,
    divisa,
    fob,
    flete: importe(op.flete),
    seguro: importe(op.seguro),
    nombreExterior: texto(op.contraparte),
    motivo: opts.motivo,
    arriboTransporte: fechaSim(op.eta),
    items: [item],
    fecha,
  };

  // Los bultos van solo si están: `validarDeclaracion` avisa después si el
  // subrégimen los exige, que es quien sabe de eso.
  const cantidadBultos = importe(op.bultos);
  const pesoBruto = importe(op.peso_bruto);
  if (cantidadBultos !== undefined && pesoBruto !== undefined) {
    const embalaje = texto(op.tipo_embalaje);
    // `CBULNATEMB` es la «naturaleza de embalaje»: la tabla es NEB, no EMB.
    const cod = embalaje ? porNombreExacto("NEB", embalaje, fecha) : null;
    if (cod) {
      operacion.bultos = {
        embalaje: cod,
        cantidad: cantidadBultos,
        pesoBrutoKg: pesoBruto,
        enContenedor: Boolean(texto(op.contenedor)),
      };
    } else if (embalaje) {
      falta("Tipo de embalaje", `«${embalaje}» no coincide con ninguna naturaleza de embalaje de NEB.`);
    }
  }

  const nroFactura = texto(op.nro_factura);
  if (nroFactura) {
    operacion.documentos = [{ codigo: "FACTURACOMERCIAL", referencia: nroFactura }];
  }

  return { operacion, faltantes };
}

/**
 * El ítem de la declaración.
 *
 * La operación del sistema tiene **una** posición, una cantidad y una unidad,
 * así que sale un solo ítem. Una carpeta con varias posiciones hoy no se puede
 * representar: es una limitación del modelo de operación, no del pre-SIM.
 */
function armarItem(
  op: OperationWithClient,
  faltantes: Faltante[],
  fecha?: Date,
): ItemSim | null {
  const falta = (campo: string, porque: string) => {
    faltantes.push({ campo, porque });
    return undefined;
  };

  const ncm = texto(op.ncm) ?? falta("Posición NCM", "El ítem necesita su posición.");

  const u = codigoUnidad(op.unidad, fecha);
  const unidad = u.codigo ?? falta("Unidad", u.porque);

  const origen = codigoPais(op.pais_origen, fecha);
  const paisOrigen = origen.codigo ?? falta("País de origen", origen.porque);

  // Sin procedencia declarada, el SIM toma la misma que el origen: es lo más
  // común —la mercadería sale del país donde se produjo— y no inventa nada,
  // porque el dato queda igual a otro que el usuario sí cargó.
  const proc = texto(op.pais_procedencia) ? codigoPais(op.pais_procedencia, fecha) : origen;
  const paisProcedencia = proc.codigo ?? paisOrigen;

  const cantidad = importe(op.cantidad) ?? falta("Cantidad", "El ítem necesita su cantidad.");
  const peso = importe(op.peso_neto) ?? falta("Peso neto", "Va en la declaración del ítem.");
  const fob = importe(op.valor_fob);

  if (!ncm || !unidad || !paisOrigen || !paisProcedencia || cantidad === undefined || peso === undefined || fob === undefined) {
    return null;
  }

  return {
    ncm,
    unidad,
    cantidadDeclarada: cantidad,
    cantidadEstadistica: cantidad,
    pesoNetoKg: peso,
    fob,
    flete: importe(op.flete),
    seguro: importe(op.seguro),
    paisOrigen,
    paisProcedencia,
    // Un subítem con la marca, que es el sufijo que el SIM pide casi siempre.
    subitems: [
      {
        sufijos: texto(op.marca) ? [{ clave: "AA", texto: texto(op.marca)! }] : [],
      },
    ],
  };
}
