import "server-only";

import { vigentes } from "@/lib/presim/tablas";

/**
 * Las listas del SIM para los campos del formulario.
 *
 * `aduana` y `moneda` eran campos de texto libre, y eso deja escribir un valor
 * que el SIM no acepta: el error aparecía recién al emitir, con la carpeta ya
 * cargada. Alimentar el formulario con la tabla lo corta de raíz.
 *
 * No es un problema hipotético. Escribiendo las pruebas del pre-SIM usé `002`
 * para el dólar y la validación lo rechazó: **ese código venció el 11/01/2024**
 * y el vigente es `DOL`. Una lista no lo habría dejado escribir.
 *
 * Por eso también se piden **vigentes a una fecha** y no todos los códigos: las
 * tablas del SIM guardan historia, y ofrecer un código que ya no rige es la
 * misma trampa con otro disfraz.
 */

export type OpcionSim = {
  /** El código que va al archivo. */
  codigo: string;
  /** Lo que ve el despachante: «001 · BS.AS. CAPITAL». */
  label: string;
};

function opciones(tabla: string, fecha?: Date): OpcionSim[] {
  try {
    return vigentes(tabla, fecha)
      .filter((f) => f.descripcion)
      .map((f) => ({ codigo: f.codigo, label: `${f.codigo} · ${f.descripcion}` }));
  } catch {
    // Sin la tabla exportada del Kit, el campo sigue siendo libre en vez de
    // quedar vacío y bloquear la carga.
    return [];
  }
}

/** Aduanas de registro (`BUR`). */
export function opcionesAduana(fecha?: Date): OpcionSim[] {
  return opciones("BUR", fecha);
}

/** Divisas (`DEV`). */
export function opcionesDivisa(fecha?: Date): OpcionSim[] {
  return opciones("DEV", fecha);
}

/** Las dos juntas, que es como las consume el formulario. */
export function opcionesDelFormulario(fecha?: Date): {
  aduanas: OpcionSim[];
  divisas: OpcionSim[];
} {
  return { aduanas: opcionesAduana(fecha), divisas: opcionesDivisa(fecha) };
}
