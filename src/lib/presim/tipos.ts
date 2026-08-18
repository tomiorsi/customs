/**
 * El archivo que come el SIM es un INI: secciones entre corchetes y pares
 * `CLAVE=VALOR`. Cada sección es una tabla del Kit y cada clave una columna
 * de esa tabla — por eso los nombres se respetan tal cual y no se traducen.
 *
 * Formato completo en docs/formato-txt-presim.md.
 */

/** Un bloque `[SEC]` con sus pares, en el orden en que aparecen. */
export type Bloque = {
  seccion: string;
  pares: [string, string][];
};

/** La declaración como lista de bloques: es lo que se escribe y se lee. */
export type DeclaracionSim = {
  bloques: Bloque[];
};

/**
 * Orden en que el SIM espera las secciones.
 *
 * Primero la cabecera y lo que cuelga de ella (NART=0000), después cada ítem
 * con lo suyo. Verificado contra tres declaraciones reales — IC04, IT04 y
 * EC01 — que salen todas con esta secuencia.
 */
export const ORDEN_CABECERA = ["DDT", "CIB", "CPL", "DVD", "SRG", "BUL"] as const;
export const ORDEN_ITEM = ["ART", "CPL", "SRG", "SBT"] as const;

/** Nivel al que aplica un bloque: cabecera (`0000`) o un ítem (`0001`…). */
export const NART_CABECERA = "0000";

/**
 * Qué tabla del SIM valida cada clave.
 *
 * Deducido de los archivos reales y verificado: de 67 códigos presentes en las
 * tres declaraciones, 65 resuelven contra estas tablas. Los dos restantes son
 * complementarios de ítem, cuyo catálogo no está en ninguna base local (ver
 * `complementarios-en-uso.json`).
 */
export const TABLA_DE_CLAVE: Record<string, string | string[]> = {
  ISTA: "STA",
  CDDTBUR: "BUR",
  CDDTBURDST: "BUR",
  CDDTINCOTE: "INC",
  CDDTDEVFOB: "DEV",
  CDDTDEVFLE: "DEV",
  CDDTDEVASS: "DEV",
  CDDTPAIDST: "PAY",
  CDDTPAYTRN: "PAY",
  CDDTMOT: "MOT",
  CARTUNTDCL: "UMM",
  // En exportación el origen es una provincia, no un país: por eso las dos.
  CARTPAYORI: ["PAY", "PRV"],
  CARTPAYPRC: ["PAY", "PRV"],
  CDVDDOC: "DOC",
  CCPL: "ZCP",
};

/** Claves cuyo valor es una posición del nomenclador, no un código de tabla. */
export const CLAVES_NCM = ["IESPNCE"];
