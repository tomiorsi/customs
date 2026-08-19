import "server-only";

import type { OperationWithClient } from "@/lib/data";
import { codigoDivisa, codigoIncoterm, codigoPais, codigoUnidad } from "@/lib/presim/catalogos";
import { buscar, vigentes } from "@/lib/presim/tablas";
import type { ComplementarioSim, ItemSim, OperacionSim } from "@/lib/presim/armar";
import { destinacionPorId } from "@/lib/destinaciones";
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

  // Importación y exportación no declaran lo mismo, así que el flujo decide
  // qué complementarios corresponden. Sale de la destinación, que es donde el
  // sistema ya lo tiene: no hace falta un campo aparte ni adivinarlo del tipo.
  const flujo = destinacionPorId(destinacion)?.flujo ?? "importacion";

  /* ── el ítem ── */
  const item = armarItem(op, faltantes, fecha, flujo);

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
    motivo: opts.motivo,
    items: [item],
    fecha,
  };

  // `LDDTNOMFOD` y `DDDTARVTRN` son de importación: EC01 no los admite según
  // `GEN`, y tiene sentido —en una exportación no hay arribo— así que ponerlos
  // ensucia el archivo con dos campos que el Kit tiene que descartar.
  if (flujo === "importacion") {
    operacion.nombreExterior = texto(op.contraparte);
    operacion.arriboTransporte = fechaSim(op.eta);
  } else {
    completarExportacion(op, operacion, faltantes, fecha);
  }

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

  const cpl = complementariosDeCabecera(op, faltantes, flujo);
  if (cpl.length) operacion.complementarios = cpl;

  const nroFactura = texto(op.nro_factura);
  if (nroFactura) {
    operacion.documentos = [{ codigo: "FACTURACOMERCIAL", referencia: nroFactura }];
  }

  return { operacion, faltantes };
}

/**
 * Lo que la cabecera de una exportación pide y la de una importación no.
 *
 * `GEN` marca siete claves como obligatorias en EC01 que en IC04 ni figuran:
 * el país y la aduana por donde sale la mercadería, y cinco del medio de
 * transporte. El armador ya las sabe escribir; lo que falta es de dónde
 * sacarlas, y la operación hoy modela dos de las siete.
 *
 * Las otras cinco se reportan en vez de completarse. Un transportista escrito
 * como nombre no es el CUIT que pide `CDDTTRANSP`, y mandar uno por el otro es
 * exactamente el error que este adaptador está para no cometer.
 */
function completarExportacion(
  op: OperationWithClient,
  operacion: OperacionSim,
  faltantes: Faltante[],
  fecha?: Date,
): void {
  const destino = codigoPais(op.pais_destino, fecha);
  if (destino.codigo !== null) operacion.paisDestino = destino.codigo;
  else faltantes.push({ campo: "País de destino", porque: destino.porque });

  // Las marcas y números del bulto: es el mismo dato que ya se usa de sufijo.
  const marcas = texto(op.marca);
  if (marcas) operacion.transporte = { marcas };
  else faltantes.push({
    campo: "Marcas y números",
    porque: "La exportación las declara en la cabecera (CDDTMRQNUM).",
  });

  for (const [campo, porque] of [
    ["Aduana de salida", "Por dónde sale la mercadería del país (CDDTBURDST)."],
    ["CUIT del transportista", "La exportación pide el CUIT, no el nombre (CDDTTRANSP)."],
    ["Medio de transporte", "El código del medio con el que sale la carga (CDDTMDETRN)."],
    ["Identificación del medio", "Buque, vuelo o matrícula (NDDTIMMTRN)."],
    ["Bandera del medio", "País del medio de transporte (CDDTPAYTRN)."],
  ] as const) {
    faltantes.push({ campo, porque });
  }
}

/**
 * Los complementarios de cabecera, que **no son los mismos en importación y en
 * exportación**.
 *
 * El corte en el archivo del estudio es limpio, sin una sola excepción:
 *
 * - importación: `DOMICIL.ESTABLEC`, `FECHA INIC.ACTIV` e `IDTRIB-PROVEEDOR`
 *   en 13 de 13, y en 0 de 8 exportaciones;
 * - exportación: `LUGAR-ART736CA` y `GTOSANT736CA`, que son los datos con los
 *   que el art. 736 del Código Aduanero arma el valor imponible.
 *
 * Tiene sentido que sea así: al importar, la declaración jurada es sobre quién
 * compra y a quién le compra; al exportar, sobre dónde está la mercadería y qué
 * gastos hay hasta ahí. Emitir los de importación en una exportación —que es lo
 * que hacía la primera versión de esto— manda al SIM un ID de proveedor en una
 * operación que no tiene proveedor.
 *
 * Lo que falta se reporta y no se completa: media declaración con un dato
 * inventado es peor que media declaración con un hueco visible.
 */
function complementariosDeCabecera(
  op: OperationWithClient,
  faltantes: Faltante[],
  flujo: "importacion" | "exportacion",
): ComplementarioSim[] {
  const salida: ComplementarioSim[] = [];
  const agregar = (codigo: string, valor: string | undefined, campo: string, porque: string) => {
    if (valor) salida.push({ codigo, valor, tipo: "D" });
    else faltantes.push({ campo, porque });
  };

  if (flujo === "exportacion") {
    agregar(
      "LUGAR-ART736CA",
      texto(op.lugar_mercaderia_736),
      "Lugar donde está la mercadería",
      "El art. 736 arma el valor de exportación sobre el lugar de carga.",
    );
    // Los gastos anteriores se deducen del precio. Cuando no hay ninguno se
    // declara 0, que es declarar la ausencia: el campo no admite vacío y un
    // cero no afirma nada que el usuario no haya dicho al no cargar gastos.
    salida.push({
      codigo: "GTOSANT736CA",
      valor: numeroSim(op.gastos_origen) ?? "0",
      tipo: "D",
    });
    return salida;
  }

  agregar(
    "DOMICIL.ESTABLEC",
    texto(op.client_domicilio_establecimiento),
    "Domicilio del establecimiento",
    "Se carga en la ficha del cliente y el SIM lo pide en toda importación.",
  );
  agregar(
    "FECHA INIC.ACTIV",
    fechaSim(op.client_inicio_actividad),
    "Inicio de actividades",
    "Se carga en la ficha del cliente y el SIM lo pide en toda importación.",
  );
  agregar(
    "IDTRIB-PROVEEDOR",
    texto(op.idtrib_proveedor),
    "ID tributario del proveedor",
    "Es el número fiscal del proveedor del exterior; figura en la factura.",
  );

  return salida;
}

/** Un importe del sistema tal como lo escribe el SIM, o `undefined` si no hay. */
function numeroSim(v: string | null | undefined): string | undefined {
  const n = importe(v);
  return n === undefined ? undefined : String(n);
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
  fecha: Date | undefined,
  flujo: "importacion" | "exportacion",
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

  const item: ItemSim = {
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

  // La exportación declara por ítem la comisión al exterior —que se deduce del
  // precio— y a quién se le vende. La comisión está en las 8 exportaciones del
  // archivo sin excepción, y el comprador en 7.
  if (flujo === "exportacion") {
    const cpl: ComplementarioSim[] = [
      { codigo: "COMISIONALEXT", valor: numeroSim(op.comision_exterior) ?? "0", tipo: "D" },
    ];
    const comprador = texto(op.contraparte);
    if (comprador) cpl.push({ codigo: "DATO-COMPRADOR", valor: comprador, tipo: "D" });
    else faltantes.push({
      campo: "Comprador del exterior",
      porque: "La exportación declara a quién se le vende, por ítem.",
    });
    item.complementarios = cpl;
  }

  return item;
}
