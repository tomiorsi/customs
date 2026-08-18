/**
 * Pre-SIM: leer, validar y escribir el archivo que come el Sistema
 * Informático Malvina.
 *
 * El formato y de dónde salen las tablas está en docs/formato-txt-presim.md.
 */
export type { Bloque, DeclaracionSim } from "@/lib/presim/tipos";
export { NART_CABECERA, ORDEN_CABECERA, ORDEN_ITEM } from "@/lib/presim/tipos";
export {
  bloque,
  bloques,
  escribirDeclaracion,
  leerDeclaracion,
  nartDe,
  ordenarDeclaracion,
  subregimenDe,
  valor,
} from "@/lib/presim/archivo";
export type { FilaSim, TablaSim } from "@/lib/presim/tablas";
export { buscar, existe, vigentes } from "@/lib/presim/tablas";
export type { Hallazgo } from "@/lib/presim/validar";
export {
  resumirHallazgos,
  seccionesDelSubregimen,
  validarDeclaracion,
} from "@/lib/presim/validar";
export type { Traduccion } from "@/lib/presim/catalogos";
export { codigoIncoterm, codigoPais, codigoUnidad } from "@/lib/presim/catalogos";
export type { Sufijo, SufijoDeCatalogo } from "@/lib/presim/sufijos";
export {
  armarSufijos,
  parsearSufijos,
  revisarSufijos,
  sufijosDePosicion,
} from "@/lib/presim/sufijos";
export type {
  BultosSim,
  ComplementarioSim,
  DocumentoSim,
  IibbSim,
  ItemSim,
  OperacionSim,
  SubitemSim,
} from "@/lib/presim/armar";
export { armarDeclaracion } from "@/lib/presim/armar";
export type { ResultadoSubregimen, SituacionArribo } from "@/lib/presim/subregimen";
export {
  destinacionesResolubles,
  motivoImplicaTransformacion,
  subregimenPara,
} from "@/lib/presim/subregimen";
