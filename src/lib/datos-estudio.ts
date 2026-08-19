import "server-only";

import { getDb } from "@/lib/db";
import { estudioDe, type CuentaEquipo } from "@/lib/roles";

/**
 * Los datos del estudio que firma la declaración.
 *
 * La plataforma es multiestudio: **cada despachante tiene su CUIT**, y es el
 * que va en `CDDTAGR` de la declaración y en la ficha para Malvina. Antes esto
 * salía de la variable de entorno `ESTUDIO_CUIT`, que solo podía tener un
 * valor para todo el servidor — o sea que servía mientras hubiera un estudio
 * solo, y a partir del segundo firmaba todo con el CUIT del primero.
 *
 * Sale de la cuenta raíz del estudio (`despachante_id` nulo), que es donde
 * viven la razón social y el CUIT que cargó cada uno al registrarse. Un
 * operador del equipo hereda los de su estudio: `estudioDe` ya resuelve eso.
 */

export type DatosEstudio = {
  /** CUIT del despachante, solo dígitos. `null` si no lo cargó todavía. */
  cuit: string | null;
  /** Razón social, para mostrarla. */
  razonSocial: string | null;
};

export function datosDelEstudio(user: CuentaEquipo): DatosEstudio {
  const fila = getDb()
    .prepare("SELECT cuit, company_name FROM users WHERE id = ?")
    .get(estudioDe(user)) as { cuit: string | null; company_name: string | null } | undefined;

  // Solo dígitos: el CUIT se carga con guiones tanto como sin ellos, y el SIM
  // lo quiere corrido.
  const cuit = (fila?.cuit ?? "").replace(/\D/g, "");
  return {
    // Un CUIT que no tiene once dígitos está mal cargado, y mandarlo así al
    // SIM es un rechazo seguro: vale más decir que falta.
    cuit: cuit.length === 11 ? cuit : null,
    razonSocial: fila?.company_name?.trim() || null,
  };
}
