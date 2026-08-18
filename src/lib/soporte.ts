import "server-only";
import { cryptoId, getDb } from "./db";

/**
 * Soporte de la plataforma.
 *
 * Un hilo por cuenta, efímero: se borra solo a los `MINUTOS_INACTIVIDAD` sin
 * mensajes nuevos. Una consulta terminada cayó en uno de dos lugares —se
 * resolvió en el chat, o se derivó y el resumen ya salió por mail—, así que el
 * historial no aporta nada y sí molesta: la próxima vez el usuario abre soporte
 * y encuentra un problema viejo arriba en vez de un chat limpio.
 *
 * `origen` distingue quién habló: el usuario, el bot, o una persona del equipo.
 */

export type MensajeSoporte = {
  id: string;
  cuenta_id: string;
  origen: "usuario" | "soporte" | "bot";
  autor: string | null;
  texto: string;
  derivado: string;
  created_at: string;
};

export const MAX_LARGO_MENSAJE = 4000;

/** Sin mensajes nuevos por este tiempo, la conversación se da por terminada. */
export const MINUTOS_INACTIVIDAD = 10;

/**
 * Borra el hilo si quedó inactivo, y avisa si borró algo.
 *
 * Se llama al entrar y antes de guardar un mensaje, en vez de con una tarea
 * programada: no hace falta un proceso de fondo para algo que solo importa
 * cuando alguien mira el hilo, y así el borrado no depende de que ese proceso
 * esté corriendo.
 *
 * La cuenta se hace en SQL porque `created_at` lo escribe SQLite con
 * CURRENT_TIMESTAMP (UTC): comparar contra `datetime('now')` usa el mismo reloj
 * y el mismo formato, sin pasar por la zona horaria del servidor.
 */
export function purgarHiloInactivo(cuentaId: string): boolean {
  const r = getDb()
    .prepare(
      `DELETE FROM soporte_mensajes
        WHERE cuenta_id = ?
          AND (SELECT MAX(created_at) FROM soporte_mensajes WHERE cuenta_id = ?)
              < datetime('now', ?)`,
    )
    .run(cuentaId, cuentaId, `-${MINUTOS_INACTIVIDAD} minutes`);
  return r.changes > 0;
}

export function getMensajesSoporte(cuentaId: string): MensajeSoporte[] {
  return getDb()
    .prepare(
      `SELECT id, cuenta_id, origen, autor, texto, derivado, created_at
       FROM soporte_mensajes WHERE cuenta_id = ? ORDER BY created_at ASC`,
    )
    .all(cuentaId) as MensajeSoporte[];
}

export function addMensajeSoporte(input: {
  cuentaId: string;
  origen: "usuario" | "soporte" | "bot";
  autor: string | null;
  texto: string;
  derivado?: boolean;
}): { id: string; error?: string } {
  const texto = input.texto.trim();
  if (!texto) return { id: "", error: "El mensaje está vacío." };
  if (texto.length > MAX_LARGO_MENSAJE) {
    return { id: "", error: `El mensaje no puede superar los ${MAX_LARGO_MENSAJE} caracteres.` };
  }
  const id = cryptoId();
  getDb()
    .prepare(
      `INSERT INTO soporte_mensajes
         (id, cuenta_id, origen, autor, texto, leido_soporte, leido_usuario, derivado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.cuentaId,
      input.origen,
      input.autor,
      texto,
      input.origen === "usuario" ? "0" : "1",
      input.origen === "usuario" ? "1" : "0",
      input.derivado ? "1" : "0",
    );
  return { id };
}

export function marcarLeidoSoporte(
  cuentaId: string,
  lector: "usuario" | "soporte",
): void {
  const columna = lector === "usuario" ? "leido_usuario" : "leido_soporte";
  const propio = lector === "usuario" ? "usuario" : "soporte";
  getDb()
    .prepare(
      `UPDATE soporte_mensajes SET ${columna} = '1'
       WHERE cuenta_id = ? AND origen <> ? AND ${columna} = '0'`,
    )
    .run(cuentaId, propio);
}

export type HiloSoporte = {
  cuentaId: string;
  nombre: string;
  email: string | null;
  ultimo: string | null;
  ultimoTexto: string | null;
  sinLeer: number;
};

/** Bandeja del equipo: las cuentas que escribieron, sin leer primero. */
export function getHilosSoporte(): HiloSoporte[] {
  return getDb()
    .prepare(
      `SELECT u.id AS cuentaId,
              COALESCE(NULLIF(TRIM(u.company_name), ''), u.contact_name, u.email, 'Sin nombre') AS nombre,
              u.email,
              MAX(m.created_at) AS ultimo,
              (SELECT texto FROM soporte_mensajes
                WHERE cuenta_id = u.id ORDER BY created_at DESC LIMIT 1) AS ultimoTexto,
              SUM(CASE WHEN m.origen = 'usuario' AND m.leido_soporte = '0' THEN 1 ELSE 0 END) AS sinLeer
       FROM soporte_mensajes m
       JOIN users u ON u.id = m.cuenta_id
       GROUP BY u.id
       ORDER BY sinLeer DESC, ultimo DESC`,
    )
    .all() as HiloSoporte[];
}

/**
 * Respuesta automática mientras no haya chatbot conectado.
 *
 * Deja dicho que la consulta quedó registrada y que la sigue una persona. No
 * intenta simular que entiende: prometer una respuesta que no puede dar sería
 * peor que no contestar nada.
 */
export const RESPUESTA_AUTOMATICA =
  "Recibimos tu consulta y quedó registrada. Te respondemos por acá y también " +
  "te avisamos por mail. Si es urgente, contanos el detalle en un mensaje y lo " +
  "vemos cuanto antes.";
