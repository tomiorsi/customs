import "server-only";

import { buscar, tabla } from "@/lib/presim/tablas";

/**
 * Traducción de los catálogos del sistema a los códigos del SIM.
 *
 * El sistema guarda texto que lee una persona —«Kilogramos», «Brasil»— y el
 * archivo del pre-SIM lleva códigos —`01`, `203`—. Este módulo hace ese salto.
 *
 * **No se traduce por parecido de texto.** Se probó y da 13% en unidades (el
 * SIM usa singular y abreviaturas propias), pero el problema no es la tasa: es
 * que un match difuso acierta casi siempre y falla en silencio justo donde más
 * caro sale. El ejemplo está en la tabla: `308` es COREA DEMOCRATICA y `309`
 * COREA REPUBLICANA. Buscar «Corea» y quedarse con el primero declara Corea del
 * Norte en una operación con Corea del Sur.
 *
 * Entonces: binding explícito donde el catálogo es cerrado y chico, coincidencia
 * **exacta** donde es grande, y cuando no hay certeza se devuelve el motivo en
 * lugar de un código. Un código equivocado viaja al SIM como si fuera cierto;
 * un hueco lo ve el despachante y lo completa.
 */

export type Traduccion = { codigo: string } | { codigo: null; porque: string };

/* ─────────────────────────── normalización ─────────────────────────── */

/**
 * Texto comparable: sin acentos, sin puntuación, en mayúsculas.
 *
 * `#` se lee como `Ñ` porque el export del Kit perdió esa letra: España figura
 * como `ESPA#A`. Es general y no un alias —alcanza a las dos filas de `PAY` y a
 * una de `VEN`, las únicas del Kit con ese carácter—, así que si algún día el
 * export se arregla, esto sigue funcionando igual.
 */
function normalizar(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/#/g, "Ñ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Índice descripción normalizada → código, para una tabla del Kit. */
function porDescripcion(nombreTabla: string): Map<string, string> {
  const t = tabla(nombreTabla);
  const mapa = new Map<string, string>();
  for (const f of t.filas) {
    const k = normalizar(f.descripcion);
    if (k && !mapa.has(k)) mapa.set(k, f.codigo);
  }
  return mapa;
}

const cacheIndices = new Map<string, Map<string, string>>();
function indice(nombreTabla: string): Map<string, string> {
  let i = cacheIndices.get(nombreTabla);
  if (!i) {
    i = porDescripcion(nombreTabla);
    cacheIndices.set(nombreTabla, i);
  }
  return i;
}

/** Confirma el código contra su tabla antes de devolverlo. */
function confirmar(nombreTabla: string, codigo: string, fecha?: Date): Traduccion {
  if (!buscar(nombreTabla, codigo, fecha)) {
    return {
      codigo: null,
      porque: `El código ${codigo} no figura en ${nombreTabla} o no regía en esa fecha.`,
    };
  }
  return { codigo };
}

/* ─────────────────────────── unidades ─────────────────────────── */

/**
 * Las unidades del sistema, con su código en `UMM`.
 *
 * Binding a mano porque los nombres no coinciden: el sistema dice «Kilogramos»
 * y el SIM «KILOGRAMO», «Unidades» contra «UNIDAD». Son quince y las revisa un
 * despachante de un vistazo, que es justo lo que se busca.
 *
 * Ojo con la última: el SIM llama `25` a «JGO.PQT.MAZO NAIPES», que nombra los
 * naipes, y nuestra etiqueta es genérica. Es el código que corresponde, pero si
 * aparece un juego que no son naipes conviene mirarlo.
 */
const UNIDAD_A_UMM: Record<string, string> = {
  Unidades: "07",
  Pares: "08",
  Docenas: "09",
  Millares: "11",
  "Juego / paquete / mazo": "25",
  Kilogramos: "01",
  Gramos: "14",
  Toneladas: "29",
  Quilates: "10",
  Litros: "05",
  Hectolitros: "18",
  Metros: "02",
  "Metros cuadrados": "03",
  "Metros cúbicos": "04",
  "1000 kWh": "06",
};

export function codigoUnidad(etiqueta: string | null | undefined, fecha?: Date): Traduccion {
  const e = (etiqueta ?? "").trim();
  if (!e) return { codigo: null, porque: "No hay unidad cargada." };
  const cod = UNIDAD_A_UMM[e];
  if (!cod) return { codigo: null, porque: `La unidad «${e}» no tiene código de UMM asignado.` };
  return confirmar("UMM", cod, fecha);
}

/* ─────────────────────────── países ─────────────────────────── */

/**
 * Países que el SIM nombra distinto que nosotros.
 *
 * Solo tres, y las tres por un motivo concreto, no por escribirse parecido:
 * el SIM antepone la forma de gobierno («REP. FED DE ALEMANIA») o distingue dos
 * países que comparten nombre común. Los 31 restantes coinciden exacto.
 */
const PAIS_A_PAY: Record<string, string> = {
  Alemania: "438", // REP. FED DE ALEMANIA
  "Corea del Sur": "309", // COREA REPUBLICANA — 308 es COREA DEMOCRATICA
};

/**
 * Etiquetas del formulario que **no son un país** y no pueden traducirse.
 *
 * Sirven para cotizar sin saber el origen exacto, pero una declaración lleva un
 * país concreto: si se eligió una de estas, falta el dato, no la traducción.
 */
const NO_ES_UN_PAIS = new Set(["Otro país (Unión Europea)", "Otro país (extrazona)"]);

export function codigoPais(nombre: string | null | undefined, fecha?: Date): Traduccion {
  const n = (nombre ?? "").trim();
  if (!n) return { codigo: null, porque: "No hay país cargado." };
  if (NO_ES_UN_PAIS.has(n)) {
    return {
      codigo: null,
      porque: `«${n}» sirve para cotizar, pero la declaración necesita el país concreto.`,
    };
  }
  const cod = PAIS_A_PAY[n] ?? indice("PAY").get(normalizar(n));
  if (!cod) return { codigo: null, porque: `El país «${n}» no figura en PAY.` };
  return confirmar("PAY", cod, fecha);
}

/* ─────────────────────────── incoterm ─────────────────────────── */

/**
 * El incoterm no se traduce: el sistema ya guarda el código de tres letras que
 * usa el SIM. Los once del formulario están en `INC`, verificado.
 *
 * Igual se confirma contra la tabla, porque `INC` tiene vigencias: los
 * Incoterms cambian de versión y uno que hoy rige puede no haber regido cuando
 * se registró una carpeta vieja.
 */
export function codigoIncoterm(valor: string | null | undefined, fecha?: Date): Traduccion {
  const v = (valor ?? "").trim().toUpperCase();
  if (!v) return { codigo: null, porque: "No hay Incoterm cargado." };
  return confirmar("INC", v, fecha);
}
