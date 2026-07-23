import type { PublicUser } from "@/lib/types";

/**
 * Portal self-service del cliente (/inicio).
 *
 * Modelo de control interno con acceso POR-CLIENTE: el portal está cerrado por
 * defecto y el estudio lo habilita cliente por cliente al crearle el acceso
 * (`portal_habilitado = '1'`). La variable de entorno PORTAL_CLIENTE_MASTER=off
 * funciona como corte de emergencia global (deshabilita todos los accesos).
 */
export function portalMasterHabilitado(): boolean {
  return process.env.PORTAL_CLIENTE_MASTER !== "off";
}

/** ¿Este usuario cliente tiene acceso al portal? */
export function clienteTienePortal(user: Pick<PublicUser, "role" | "portal_habilitado">): boolean {
  if (user.role !== "client") return false;
  if (!portalMasterHabilitado()) return false;
  return user.portal_habilitado === "1";
}
