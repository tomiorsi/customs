/** A dónde mandar a cada rol después de loguearse. */
export function landingPath(role: string | null | undefined): string {
  if (esEquipo(role)) return "/admin/inicio";
  return "/inicio/operaciones";
}

/** ¿El rol es del equipo del estudio (admin u operador)? */
export function esEquipo(role: string | null | undefined): boolean {
  return role === "admin" || role === "operador";
}

/** Cuenta de equipo tal como la necesitan los helpers de alcance. */
export type CuentaEquipo = {
  id: string;
  role: string;
  /** Estudio al que pertenece. NULL en el dueño; el id del dueño en sus subcuentas. */
  despachante_id?: string | null;
};

/**
 * Estudio al que pertenece una cuenta del equipo.
 *
 * Un despachante dueño es la raíz de su propio estudio (`despachante_id` en
 * NULL) y las subcuentas que crea cuelgan de él. Ambos comparten cartera: el
 * empleado ve los mismos clientes y operaciones que su jefe, y nada más.
 */
export function estudioDe(user: CuentaEquipo): string {
  return user.despachante_id ?? user.id;
}

/**
 * ¿Es dueño de su estudio? Solo el dueño administra Accesos —crear subcuentas y
 * dar acceso a clientes—; un empleado usa el panel pero no reparte permisos.
 */
export function esDuenoDeEstudio(user: CuentaEquipo): boolean {
  return esEquipo(user.role) && !user.despachante_id;
}

/**
 * Qué datos alcanza a ver una cuenta.
 *
 * Cada estudio tiene su propia cartera y no ve la de los demás; un cliente solo
 * se ve a sí mismo. Todas las consultas de clientes, operaciones y documentos
 * pasan por acá, así que el aislamiento queda en un solo lugar en vez de
 * repetirse en cada endpoint.
 */
export type Alcance =
  | { tipo: "equipo"; despachanteId: string }
  | { tipo: "cliente"; clienteId: string };

export function alcanceDe(user: CuentaEquipo): Alcance {
  return esEquipo(user.role)
    ? { tipo: "equipo", despachanteId: estudioDe(user) }
    : { tipo: "cliente", clienteId: user.id };
}
