import "server-only";

import { ordenarDeclaracion } from "@/lib/presim/archivo";
import { armarSufijos, type Sufijo } from "@/lib/presim/sufijos";
import { buscar } from "@/lib/presim/tablas";
import type { Bloque, DeclaracionSim } from "@/lib/presim/tipos";
import { NART_CABECERA } from "@/lib/presim/tipos";

/**
 * Arma el archivo del pre-SIM a partir de una operación.
 *
 * La contraparte de `validar.ts`: aquel controla un archivo que ya existe,
 * este lo produce. El formato está en docs/formato-txt-presim.md.
 *
 * Dos criterios que se siguen acá:
 *
 * - **Lo que la tabla sabe no se pregunta.** `CDDTIMPEXP` sale de `STA`, no de
 *   un campo que el llamador podría contestar distinto que el SIM.
 * - **Lo que no se sabe no se inventa.** Un dato ausente no sale en el archivo;
 *   no se rellena con cero ni con vacío, porque el SIM distingue «no vino» de
 *   «vino en cero» y `validar.ts` después lo marca como falta.
 */

/* ─────────────────────────── entrada ─────────────────────────── */

/** Un subítem: la apertura del ítem por sufijos y valor. */
export type SubitemSim = {
  /** Los sufijos declarados. Se ordenan solos al escribir. */
  sufijos: Sufijo[];
  /** Referencia externa del subítem (código del artículo del estudio). */
  referencia?: string;
  fob?: number;
  valorUnitario?: number;
  cantidadDeclarada?: number;
  cantidadEstadistica?: number;
};

/** Un dato complementario, de cabecera o de ítem. */
export type ComplementarioSim = {
  /** Código de `ZCP` o de los complementarios en uso. */
  codigo: string;
  valor: string;
  /**
   * `D` cuando el dato lo declara el operador y `S` cuando responde a algo que
   * el SIM pregunta. Sale tal cual de las declaraciones reales, donde los de
   * ítem responden preguntas (`S`) y los de cabecera se declaran (`D`).
   */
  tipo?: "D" | "S";
};

/** Un ítem de la declaración. */
export type ItemSim = {
  /** Posición del nomenclador con dígito verificador: `1513.19.00.000P`. */
  ncm: string;
  /** Código de unidad de `UMM`. */
  unidad: string;
  cantidadDeclarada: number;
  cantidadEstadistica: number;
  pesoNetoKg: number;
  fob: number;
  flete?: number;
  seguro?: number;
  /** País de origen. En exportación es una provincia (`PRV`), no un país. */
  paisOrigen: string;
  paisProcedencia: string;
  /** Coeficiente de ajuste. Solo en exportación, y solo si no es 1. */
  coeficiente?: number;
  /** Código de uso de la mercadería. */
  uso?: string;
  subitems?: SubitemSim[];
  complementarios?: ComplementarioSim[];
  /** Regímenes especiales del ítem (`CSRG`), por ejemplo `DEJUAUTO`. */
  regimenes?: string[];
};

/** Un documento a presentar. */
export type DocumentoSim = {
  /** Código de `DOC`, por ejemplo `FACTURACOMERCIAL`. */
  codigo: string;
  /** Número o referencia del documento. */
  referencia: string;
  /** A qué ítem pertenece. Sin esto va a la cabecera. */
  item?: number;
};

/** Los bultos de la carga. */
export type BultosSim = {
  /** Código de embalaje de `EMB`. */
  embalaje: string;
  cantidad: number;
  pesoBrutoKg: number;
  /** Cantidad a descargar en depósito. Por defecto, la declarada. */
  cantidadDescarga?: number;
  /** Si la carga viene en contenedor. */
  enContenedor?: boolean;
  /** Si los bultos van numerados. */
  numerados?: boolean;
};

/**
 * El transporte con el que sale la carga.
 *
 * Aparece en la declaración de exportación. En las dos de importación medidas
 * no está ninguno de estos campos: ahí el medio de transporte llega por el
 * manifiesto, no por la declaración.
 */
export type TransporteSim = {
  /** CUIT del transportista. */
  cuitTransportista?: string;
  /** Nombre del medio: el buque, la matrícula, `CAMION`. */
  nombre?: string;
  /** Marcas y números de los bultos. `S/M` cuando no las tienen. */
  marcas?: string;
  /** Código del medio de transporte (`MDE`). */
  medio?: string;
  /** País de la bandera o del transportista. */
  pais?: string;
  /** Vencimiento del embarque, en `DD/MM/AAAA`. */
  vencimientoEmbarque?: string;
};

/** Datos de Ingresos Brutos del importador. */
export type IibbSim = {
  /** `E` exento, `S` inscripto. */
  condicion: string;
  inscripto: boolean;
  numero?: string;
};

export type OperacionSim = {
  /** Subrégimen: manda sobre todo lo demás. */
  subregimen: string;
  /** CUIT del importador o exportador, sin guiones. */
  cuitOperador: string;
  /** CUIT del despachante. */
  cuitDespachante: string;
  /** Código de aduana de registro (`BUR`). */
  aduana: string;
  /** Referencia del estudio. Es la que después identifica la carpeta. */
  referencia: string;
  incoterm: string;
  /** Divisa de `DEV`. Una sola para los tres importes, como en los reales. */
  divisa: string;
  fob: number;
  flete?: number;
  seguro?: number;
  /** Nombre del proveedor o del comprador del exterior. */
  nombreExterior?: string;
  /** Aduana de salida, en exportación. */
  aduanaSalida?: string;
  /**
   * Depósito fiscal donde está la mercadería.
   *
   * Obligatorio en 51 subregímenes: los que se registran sobre mercadería ya
   * almacenada, donde la aduana necesita saber dónde está para verificarla.
   */
  deposito?: string;
  /**
   * Fecha de arribo del medio de transporte, en `DD/MM/AAAA`.
   *
   * Obligatoria en 48 subregímenes. Es la que abre el plazo de los quince días
   * del art. 217 para solicitar la destinación, así que no es un dato de color:
   * de ella depende si la solicitud llega en término.
   */
  arriboTransporte?: string;
  /** País de destino, en exportación. */
  paisDestino?: string;
  /** Motivo de la suspensiva (`MOT`), en temporarias. */
  motivo?: string;
  /** Plazo del régimen suspensivo, en días. */
  plazoDias?: number;
  /** Número de convenio del régimen suspensivo. */
  convenio?: string;
  /** Si el operador es responsable de IVA. Los tres reales llevan `S`. */
  responsableIva?: boolean;
  /** Medio de transporte. Va en exportación. */
  transporte?: TransporteSim;
  items: ItemSim[];
  documentos?: DocumentoSim[];
  complementarios?: ComplementarioSim[];
  bultos?: BultosSim;
  iibb?: IibbSim;
  /** Fecha con la que se resuelven las vigencias. Por defecto, hoy. */
  fecha?: Date;
};

/* ─────────────────────────── números ─────────────────────────── */

/**
 * Decimales de cada clave.
 *
 * Medido sobre las tres declaraciones reales: casi todo va con dos, y estas
 * cinco claves tienen los suyos. Cuando aparezca una clave nueva con otro
 * ancho, se agrega acá y no se toca el resto.
 */
const DECIMALES: Record<string, number> = {
  MARTCOEFIC: 5,
  MSBTUNITAR: 5,
  QBULUMMBRT: 3,
  QBULDECLAR: 0,
  QBULDSO: 0,
  QDDTREGSUS: 0,
};

/**
 * Número → texto del SIM.
 *
 * La parte entera se rellena a dos dígitos: en los archivos reales aparece
 * `01.00`, `03.76` y `09.02`, nunca `1.00`. Se ve solo en los valores menores a
 * diez, que es donde el relleno tiene efecto.
 */
function num(clave: string, v: number): string {
  const dec = DECIMALES[clave] ?? 2;
  const txt = v.toFixed(dec);
  const [ent, frac] = txt.split(".");
  const signo = ent.startsWith("-") ? "-" : "";
  const cuerpo = signo ? ent.slice(1) : ent;
  const rellenado = signo + cuerpo.padStart(2, "0");
  return frac ? `${rellenado}.${frac}` : rellenado;
}

/**
 * Los importes de la cabecera van con la precisión que tenga el número, sin
 * rellenar ni forzar decimales.
 *
 * No es una licencia: es lo medido. Los `MDDT*` reales salen con 0, 1 y 2
 * decimales —`60192`, `4686.8`, `648.79`— y la precisión natural del número
 * explica los tres. Los importes de ítem, en cambio, siempre llevan dos, y esos
 * sí pasan por `num`.
 */
function importeCabecera(v: number): string {
  return String(v);
}

/** Número de ítem o subítem con el ancho que usa el SIM. */
function orden(n: number): string {
  return String(n).padStart(4, "0");
}

/* ─────────────────────────── bloques ─────────────────────────── */

/** Agrega un par solo si hay dato: el SIM distingue ausente de vacío. */
function poner(pares: [string, string][], clave: string, v: string | null | undefined) {
  if (v === null || v === undefined || v === "") return;
  pares.push([clave, v]);
}

function ponerNum(pares: [string, string][], clave: string, v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return;
  pares.push([clave, num(clave, v)]);
}

/** Importe de cabecera: sin formato fijo, ver `importeCabecera`. */
function ponerImporte(pares: [string, string][], clave: string, v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return;
  pares.push([clave, importeCabecera(v)]);
}

/**
 * Si el subrégimen es de importación o de exportación.
 *
 * Sale de `STA.CSTAIMPEXP`, que es donde el SIM lo tiene definido para los 350
 * subregímenes. Preguntárselo al llamador abriría la puerta a que el archivo
 * diga `I` en un subrégimen de exportación.
 */
function impoExpo(subregimen: string, fecha?: Date): string | null {
  const fila = buscar("STA", subregimen, fecha);
  const v = fila?.campos["CSTAIMPEXP"]?.trim();
  return v || null;
}

function cabecera(op: OperacionSim): Bloque {
  const p: [string, string][] = [];
  poner(p, "NDDTIMMIOE", op.cuitOperador);
  poner(p, "CDDTAGR", op.cuitDespachante);
  poner(p, "ISTA", op.subregimen);
  poner(p, "CDDTBUR", op.aduana);

  poner(p, "CDDTDEVFOB", op.divisa);
  ponerImporte(p, "MDDTFOB", op.fob);
  if (op.flete !== undefined) {
    poner(p, "CDDTDEVFLE", op.divisa);
    ponerImporte(p, "MDDTFLE", op.flete);
  }
  if (op.seguro !== undefined) {
    poner(p, "CDDTDEVASS", op.divisa);
    ponerImporte(p, "MDDTASS", op.seguro);
  }

  // Los tres archivos reales lo llevan en `S`. Se deja configurable porque un
  // operador exento no es un caso raro, pero el default es lo medido.
  poner(p, "CDDTIVA", op.responsableIva === false ? "N" : "S");

  poner(p, "CDDTPAIDST", op.paisDestino);
  poner(p, "CDDTBURDST", op.aduanaSalida);
  poner(p, "CDDTDEP", op.deposito);

  // Suspensivas: el motivo y el plazo son lo que las distingue.
  poner(p, "CDDTMOT", op.motivo);
  poner(p, "NDDTNUMCVT", op.convenio);
  ponerNum(p, "QDDTREGSUS", op.plazoDias);

  // Transporte. En la exportación la declaración lleva el medio con el que sale
  // la carga; en la importación esos datos van por otro lado y no aparecen.
  const t = op.transporte;
  if (t) {
    poner(p, "CDDTTRANSP", t.cuitTransportista);
    poner(p, "NDDTIMMTRN", t.nombre);
    poner(p, "CDDTMRQNUM", t.marcas);
    poner(p, "CDDTMDETRN", t.medio);
    poner(p, "CDDTPAYTRN", t.pais);
    poner(p, "DDDTVENEMB", t.vencimientoEmbarque);
  }
  poner(p, "DDDTARVTRN", op.arriboTransporte);

  poner(p, "CDDTINCOTE", op.incoterm);
  // `N` = la declaración no es un producto manufacturado bajo régimen especial.
  poner(p, "CDDTPRD", "N");
  poner(p, "LDDTNOMFOD", op.nombreExterior);
  poner(p, "CDDTIMPEXP", impoExpo(op.subregimen, op.fecha));
  poner(p, "IEXT", op.referencia);

  return { seccion: "DDT", pares: p };
}

function bloqueIibb(i: IibbSim): Bloque {
  const p: [string, string][] = [];
  poner(p, "CCIBEXENTO", i.condicion);
  poner(p, "CCIBINSCON", i.inscripto ? "S" : "N");
  poner(p, "CCIBNUMINS", i.numero);
  return { seccion: "CIB", pares: p };
}

function bloqueBultos(b: BultosSim): Bloque {
  const p: [string, string][] = [];
  poner(p, "CBULNATEMB", b.embalaje);
  poner(p, "CBULEXT", b.enContenedor ? "S" : "N");
  poner(p, "LBULNUMCLS", b.numerados === false ? "N" : "S");
  ponerNum(p, "QBULUMMBRT", b.pesoBrutoKg);
  ponerNum(p, "QBULDECLAR", b.cantidad);
  // Lo que se descarga en depósito. Sin dato propio es todo lo declarado.
  ponerNum(p, "QBULDSO", b.cantidadDescarga ?? b.cantidad);
  return { seccion: "BUL", pares: p };
}

function bloqueComplementario(c: ComplementarioSim, nart: string): Bloque {
  const p: [string, string][] = [];
  poner(p, "ICPLDIF", c.tipo ?? (nart === NART_CABECERA ? "D" : "S"));
  poner(p, "CCPL", c.codigo);
  poner(p, "MCPL", c.valor);
  poner(p, "NART", nart);
  return { seccion: "CPL", pares: p };
}

function bloqueDocumento(d: DocumentoSim): Bloque {
  const p: [string, string][] = [];
  poner(p, "CDVDDOC", d.codigo);
  poner(p, "LDVDREFDOC", d.referencia);
  poner(p, "NART", d.item ? orden(d.item) : NART_CABECERA);
  return { seccion: "DVD", pares: p };
}

function bloquesItem(it: ItemSim, nro: number): Bloque[] {
  const nart = orden(nro);
  const subitems = it.subitems ?? [];

  const p: [string, string][] = [];
  poner(p, "CARTUNTDCL", it.unidad);
  ponerNum(p, "QARTUNTDCL", it.cantidadDeclarada);
  ponerNum(p, "QARTUNTEST", it.cantidadEstadistica);
  ponerNum(p, "MARTCOEFIC", it.coeficiente);
  ponerNum(p, "QARTKGRNET", it.pesoNetoKg);
  ponerNum(p, "MARTFOB", it.fob);
  ponerNum(p, "MARTASS", it.seguro);
  ponerNum(p, "MARTFLE", it.flete);

  // `S` cuando el ítem se abre en subítems con valor propio. En los reales, un
  // solo subítem que solo lleva sufijos va con `N`: no es una apertura, es la
  // descripción del ítem.
  const abierto = subitems.some((s) => s.fob !== undefined);
  poner(p, "CARTSBITEM", abierto ? "S" : "N");

  poner(p, "IESPNCE", it.ncm);
  poner(p, "NARTEXT", nart);
  // `N` = mercadería sin tipificación especial.
  poner(p, "CARTTYP", "N");
  poner(p, "CARTUSO", it.uso);
  poner(p, "CARTPAYORI", it.paisOrigen);
  poner(p, "CARTPAYPRC", it.paisProcedencia);
  // Sin régimen de pago diferido ni calidad de destino declarada.
  poner(p, "CARTPAGREG", "N");
  poner(p, "CARTCALDST", "N");

  const salida: Bloque[] = [{ seccion: "ART", pares: p }];

  for (const c of it.complementarios ?? []) salida.push(bloqueComplementario(c, nart));

  for (const r of it.regimenes ?? []) {
    salida.push({ seccion: "SRG", pares: [["CSRG", r], ["NART", nart]] });
  }

  subitems.forEach((s, i) => {
    const sp: [string, string][] = [];
    ponerNum(sp, "MSBTFOB", s.fob);
    ponerNum(sp, "MSBTUNITAR", s.valorUnitario);
    ponerNum(sp, "QSBTUNTDCL", s.cantidadDeclarada);
    ponerNum(sp, "QSBTUNTEST", s.cantidadEstadistica);
    poner(sp, "CSBTSVL", armarSufijos(s.sufijos));
    poner(sp, "IEXT", s.referencia);
    poner(sp, "NART", nart);
    // El subítem se numera solo cuando el ítem está realmente abierto. Si no lo
    // está, el único `[SBT]` es la descripción del ítem —lleva los sufijos y
    // nada más— y va con `0000`. Se cumple en los 5 ítems de las tres
    // declaraciones reales: `S` → 0001, 0002; `N` → 0000.
    poner(sp, "ISBT", abierto ? orden(i + 1) : NART_CABECERA);
    salida.push({ seccion: "SBT", pares: sp });
  });

  return salida;
}

/* ─────────────────────────── armador ─────────────────────────── */

/**
 * Operación → declaración lista para escribir con `escribirDeclaracion`.
 *
 * No valida: para eso está `validarDeclaracion`, que se corre sobre el
 * resultado. Separar las dos cosas permite armar un archivo incompleto y ver
 * qué le falta, en vez de fallar al armarlo.
 */
export function armarDeclaracion(op: OperacionSim): DeclaracionSim {
  const bloques: Bloque[] = [cabecera(op)];

  if (op.iibb) bloques.push(bloqueIibb(op.iibb));
  for (const c of op.complementarios ?? []) {
    bloques.push(bloqueComplementario(c, NART_CABECERA));
  }
  for (const d of op.documentos ?? []) bloques.push(bloqueDocumento(d));
  if (op.bultos) bloques.push(bloqueBultos(op.bultos));

  op.items.forEach((it, i) => bloques.push(...bloquesItem(it, i + 1)));

  return ordenarDeclaracion({ bloques });
}
