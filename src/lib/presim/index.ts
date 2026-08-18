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
export { resumirHallazgos, validarDeclaracion } from "@/lib/presim/validar";
