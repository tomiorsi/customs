/** A dónde mandar a cada rol después de loguearse. */
export function landingPath(role: string | null | undefined): string {
  if (esEquipo(role)) return "/admin/inicio";
  return "/inicio/operaciones";
}

/** ¿El rol es del equipo del estudio (admin u operador)? */
export function esEquipo(role: string | null | undefined): boolean {
  return role === "admin" || role === "operador";
}
