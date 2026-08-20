import "server-only";

import type { OperationWithClient } from "@/lib/data";
import {
  codigoDivisa,
  codigoIncoterm,
  codigoMedioTransporte,
  codigoPais,
  codigoUnidad,
} from "@/lib/presim/catalogos";
import { buscar, vigentes } from "@/lib/presim/tablas";
import type { ComplementarioSim, ItemSim, OperacionSim } from "@/lib/presim/armar";
import { destinacionPorId } from "@/lib/destinaciones";
import { montoDesdeTexto } from "@/lib/monto";
import { leerItems, type ItemOperacion } from "@/lib/items-operacion";
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

/**
 * Importe del sistema, que puede venir con separadores.
 *
 * Usa el mismo lector que la interpretación de documentos, y no uno propio: el
 * que había acá asumía formato latino y leía `60192.00` como 6.019.200, con lo
 * que el FOB —y detrás los derechos y el IVA— salían cien veces más grandes en
 * un archivo que validaba igual.
 */
function importe(v: string | null | undefined): number | undefined {
  return montoDesdeTexto(v) ?? undefined;
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

  /* ── los ítems ── */
  const items = armarItems(op, faltantes, fecha, flujo);

  if (
    !subregimen || !cuitOperador || !aduana || !divisa || !incoterm ||
    fob === undefined || !items
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
    items,
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

  const salida = texto(op.aduana_salida);
  if (salida) {
    const cod = porNombreExacto("BUR", salida, fecha);
    if (cod) operacion.aduanaSalida = cod;
    else faltantes.push({ campo: "Aduana de salida", porque: `«${salida}» no coincide con ninguna aduana de BUR.` });
  } else {
    faltantes.push({ campo: "Aduana de salida", porque: "Por dónde sale la mercadería del país (CDDTBURDST)." });
  }

  const transporte: NonNullable<OperacionSim["transporte"]> = {};

  // Las marcas y números del bulto: es el mismo dato que ya se usa de sufijo.
  const marcas = texto(op.marca);
  if (marcas) transporte.marcas = marcas;
  else faltantes.push({
    campo: "Marcas y números",
    porque: "La exportación las declara en la cabecera (CDDTMRQNUM).",
  });

  // El medio sale de la vía, que la carpeta ya tiene. La tabla que los traduce
  // no está en el Kit —lo verificamos exportándolo entero— sino del lado de
  // Sintia, en `cod_via.csv`, y las dos fuentes usan los mismos códigos.
  const medio = codigoMedioTransporte(texto(op.medio_transporte) ?? op.via);
  if (medio.codigo !== null) transporte.medio = medio.codigo;
  else faltantes.push({ campo: "Medio de transporte", porque: medio.porque });

  // El CUIT del transportista, no su nombre: `transportista` guarda el nombre
  // y mandarlo donde va el número es un rechazo seguro.
  const cuit = texto(op.cuit_transportista)?.replace(/\D/g, "");
  if (cuit && cuit.length === 11) transporte.cuitTransportista = cuit;
  else faltantes.push({
    campo: "CUIT del transportista",
    porque: cuit
      ? "El CUIT tiene que tener once dígitos."
      : "La exportación pide el CUIT, no el nombre (CDDTTRANSP).",
  });

  const ident = texto(op.identificacion_medio);
  if (ident) transporte.nombre = ident;
  else faltantes.push({
    campo: "Identificación del medio",
    porque: "Buque, vuelo o matrícula (NDDTIMMTRN).",
  });

  // La bandera es del medio, no de la mercadería: en las declaraciones reales
  // el acuático lleva la del buque —Liberia, China— y el camión y el avión
  // llevan «INDET.(AMERICA)», que es lo que corresponde cuando no tiene una.
  const bandera = texto(op.bandera_medio);
  if (bandera) {
    const b = codigoPais(bandera, fecha);
    if (b.codigo !== null) transporte.pais = b.codigo;
    else faltantes.push({ campo: "Bandera del medio", porque: b.porque });
  } else {
    faltantes.push({ campo: "Bandera del medio", porque: "País del medio de transporte (CDDTPAYTRN)." });
  }

  if (Object.keys(transporte).length) operacion.transporte = transporte;
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
 * Los ítems de la declaración.
 *
 * Una carpeta rara vez tiene una sola mercadería: de los 13.467 despachos del
 * archivo del estudio, **4.526 (33,6%) llevan más de una posición** y el más
 * grande tiene 37. Los renglones viven en `items_json`, que es la lista que va
 * creciendo a medida que el despachante clasifica producto por producto.
 *
 * Con cero o un renglón se leen los campos planos de la carpeta, igual que
 * siempre: nada de lo que hoy funciona cambia de comportamiento. Con dos o más
 * sale un ítem por renglón.
 */
function armarItems(
  op: OperationWithClient,
  faltantes: Faltante[],
  fecha: Date | undefined,
  flujo: "importacion" | "exportacion",
): ItemSim[] | null {
  const renglones = leerItems(op.items_json);
  if (renglones.length < 2) {
    const item = armarItem(op, faltantes, fecha, flujo);
    return item ? [item] : null;
  }

  const falta = (campo: string, porque: string) => {
    faltantes.push({ campo, porque });
    return undefined;
  };

  const fobTotal = importe(op.valor_fob);
  if (fobTotal === undefined) {
    falta("Valor FOB", "Es la base con la que se reparte el valor entre los renglones.");
    return null;
  }

  // La participación de cada renglón sale del valor de su línea en la factura.
  // Sin ella no hay forma de repartir: el FOB de la cabecera está neto de
  // flete y de gastos, así que el valor de línea no se puede usar tal cual.
  const valores: number[] = [];
  for (const [i, r] of renglones.entries()) {
    const v = importe(r.valor);
    if (v === undefined) {
      falta(
        `Valor del renglón ${i + 1}`,
        `«${r.mercaderia ?? "sin descripción"}» no tiene valor, y sin él no se puede repartir el FOB.`,
      );
      return null;
    }
    valores.push(v);
  }

  const fobs = prorratear(fobTotal, valores);
  const fletes = prorratear(importe(op.flete) ?? 0, valores);
  const seguros = prorratear(importe(op.seguro) ?? 0, valores);
  const cplItem = complementariosDeItem(op, flujo, faltantes);

  const items: ItemSim[] = [];
  for (const [i, r] of renglones.entries()) {
    const item = armarItemDeRenglon(r, i, op, faltantes, fecha);
    if (!item) return null;
    item.fob = fobs[i];
    if (fletes[i]) item.flete = fletes[i];
    if (seguros[i]) item.seguro = seguros[i];
    if (cplItem) item.complementarios = cplItem;
    items.push(item);
  }
  return items;
}

/**
 * Reparte un importe de cabecera entre los renglones según su participación.
 *
 * Es lo que hacen las declaraciones reales, y no una interpretación: medido
 * sobre las cinco del archivo que llevan más de un ítem, el flete y el seguro
 * de cada renglón son exactamente su proporción del FOB. El peor desvío en las
 * cinco es **un centavo, en una sola línea de doce** — redondeo, no criterio.
 *
 * El resto de la división se le suma al renglón más grande, para que la suma de
 * los ítems cierre contra el total de la cabecera en vez de quedar a un centavo.
 *
 * Ojo con lo que **no** se reparte así: el peso neto. Probado contra las mismas
 * cinco declaraciones, el prorrateo por FOB se cae —un renglón que pesa 7.123 kg
 * daría 1.984—, porque el peso depende de qué es la mercadería y no de cuánto
 * sale. Coincide solo cuando la carga es homogénea, y ahí es casualidad.
 */
function prorratear(total: number, participaciones: number[]): number[] {
  const suma = participaciones.reduce((a, b) => a + b, 0);
  if (suma <= 0 || total === 0) return participaciones.map(() => 0);
  const centavos = (n: number) => Math.round(n * 100) / 100;
  const repartido = participaciones.map((p) => centavos((total * p) / suma));
  const resto = centavos(total - repartido.reduce((a, b) => a + b, 0));
  if (resto !== 0) {
    const mayor = participaciones.indexOf(Math.max(...participaciones));
    repartido[mayor] = centavos(repartido[mayor] + resto);
  }
  return repartido;
}

/**
 * Un renglón de la carpeta → un ítem de la declaración.
 *
 * Lo que distingue a un renglón de otro —posición, cantidad, peso— sale solo
 * del renglón. Lo que suele ser común a toda la carpeta —unidad, país, marca—
 * cae en el dato de la operación cuando el renglón no lo trae, porque una
 * factura de un proveedor tiene casi siempre un origen solo y una unidad sola.
 *
 * El peso no cae en nada: se reporta. Ver `prorratear` para por qué no se
 * estima.
 */
function armarItemDeRenglon(
  r: ItemOperacion,
  indice: number,
  op: OperationWithClient,
  faltantes: Faltante[],
  fecha?: Date,
): ItemSim | null {
  const nro = indice + 1;
  const nombre = texto(r.mercaderia) ?? `renglón ${nro}`;
  const falta = (campo: string, porque: string) => {
    faltantes.push({ campo: `${campo} (${nombre})`, porque });
    return undefined;
  };

  const ncm = texto(r.ncm) ?? falta("Posición NCM", "El renglón todavía no está clasificado.");

  const u = codigoUnidad(texto(r.unidad) ?? op.unidad, fecha);
  const unidad = u.codigo ?? falta("Unidad", u.porque);

  const origen = codigoPais(texto(r.pais_origen) ?? op.pais_origen, fecha);
  const paisOrigen = origen.codigo ?? falta("País de origen", origen.porque);

  const proc = texto(op.pais_procedencia) ? codigoPais(op.pais_procedencia, fecha) : origen;
  const paisProcedencia = proc.codigo ?? paisOrigen;

  const cantidad = importe(r.cantidad) ?? falta("Cantidad", "El ítem necesita su cantidad.");
  const peso =
    importe(r.peso_neto) ??
    falta("Peso neto", "Sale del packing list, y no se puede estimar desde el valor.");

  if (
    !ncm || !unidad || !paisOrigen || !paisProcedencia ||
    cantidad === undefined || peso === undefined
  ) {
    return null;
  }

  const marca = texto(r.marca) ?? texto(op.marca);
  return {
    ncm,
    unidad,
    cantidadDeclarada: cantidad,
    cantidadEstadistica: cantidad,
    pesoNetoKg: peso,
    // Lo pisa `armarItems` con la parte que le toca del FOB de la cabecera.
    fob: 0,
    paisOrigen,
    paisProcedencia,
    subitems: [{ sufijos: marca ? [{ clave: "AA", texto: marca }] : [] }],
  };
}

/**
 * Los complementarios que van en cada ítem.
 *
 * Hoy solo la exportación lleva: la comisión al exterior, que está en las 8
 * exportaciones del archivo sin excepción, y a quién se le vende, que está en 7.
 * Son los mismos para todos los ítems de la declaración.
 */
function complementariosDeItem(
  op: OperationWithClient,
  flujo: "importacion" | "exportacion",
  faltantes: Faltante[],
): ComplementarioSim[] | null {
  if (flujo !== "exportacion") return null;
  const salida: ComplementarioSim[] = [
    { codigo: "COMISIONALEXT", valor: numeroSim(op.comision_exterior) ?? "0", tipo: "D" },
  ];
  const comprador = texto(op.contraparte);
  if (comprador) salida.push({ codigo: "DATO-COMPRADOR", valor: comprador, tipo: "D" });
  else faltantes.push({
    campo: "Comprador del exterior",
    porque: "La exportación declara a quién se le vende, por ítem.",
  });
  return salida;
}

/**
 * El ítem cuando la carpeta tiene una sola mercadería.
 *
 * Lee los campos planos de la operación, que es lo que hubo siempre y sigue
 * siendo la visión del conjunto de la carpeta.
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

  const cpl = complementariosDeItem(op, flujo, faltantes);
  if (cpl) item.complementarios = cpl;

  return item;
}
