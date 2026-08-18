import "server-only";
import { cryptoId, getDb } from "./db";

/**
 * Chat directo entre un cliente y su despachante.
 *
 * Un hilo por cliente, no por operación: el cliente necesita poder escribir
 * antes de tener la primera operación abierta, que es justo cuando más
 * preguntas tiene. Del lado del equipo, cada cuenta ve solo los hilos de su
 * propia cartera.
 */

export type MensajeChat = {
  id: string;
  cliente_id: string;
  origen: "cliente" | "estudio";
  autor: string | null;
  texto: string;
  leido_estudio: string;
  leido_cliente: string;
  created_at: string;
};

/** Límite defensivo: un mensaje es una consulta, no un archivo adjunto. */
export const MAX_LARGO_MENSAJE = 4000;

export function getMensajes(clienteId: string): MensajeChat[] {
  return getDb()
    .prepare(
      `SELECT id, cliente_id, origen, autor, texto, leido_estudio, leido_cliente, created_at
       FROM chat_messages WHERE cliente_id = ? ORDER BY created_at ASC`,
    )
    .all(clienteId) as MensajeChat[];
}

export function addMensaje(input: {
  clienteId: string;
  origen: "cliente" | "estudio";
  autorId: string;
  autor: string | null;
  texto: string;
}): { id: string; error?: string } {
  const texto = input.texto.trim();
  if (!texto) return { id: "", error: "El mensaje está vacío." };
  if (texto.length > MAX_LARGO_MENSAJE) {
    return { id: "", error: `El mensaje no puede superar los ${MAX_LARGO_MENSAJE} caracteres.` };
  }
  const id = cryptoId();
  getDb()
    .prepare(
      `INSERT INTO chat_messages
         (id, cliente_id, origen, autor_id, autor, texto, leido_estudio, leido_cliente)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.clienteId,
      input.origen,
      input.autorId,
      input.autor,
      texto,
      // Quien escribe ya lo leyó; la contraparte lo tiene pendiente.
      input.origen === "estudio" ? "1" : "0",
      input.origen === "cliente" ? "1" : "0",
    );
  return { id };
}

/** Marca como leído lo que escribió la contraparte. */
export function marcarLeido(clienteId: string, lector: "cliente" | "estudio"): void {
  const columna = lector === "cliente" ? "leido_cliente" : "leido_estudio";
  const otroOrigen = lector === "cliente" ? "estudio" : "cliente";
  getDb()
    .prepare(
      `UPDATE chat_messages SET ${columna} = '1'
       WHERE cliente_id = ? AND origen = ? AND ${columna} = '0'`,
    )
    .run(clienteId, otroOrigen);
}

export function contarSinLeer(clienteId: string, lector: "cliente" | "estudio"): number {
  const columna = lector === "cliente" ? "leido_cliente" : "leido_estudio";
  const otroOrigen = lector === "cliente" ? "estudio" : "cliente";
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM chat_messages
       WHERE cliente_id = ? AND origen = ? AND ${columna} = '0'`,
    )
    .get(clienteId, otroOrigen) as { c: number };
  return row.c;
}

export type HiloResumen = {
  clienteId: string;
  nombre: string;
  email: string | null;
  ultimo: string | null;
  ultimoTexto: string | null;
  sinLeer: number;
};

/**
 * Bandeja del equipo: un hilo por cliente de la cartera, con los que tienen
 * mensajes sin leer primero y después por actividad más reciente. Incluye a los
 * clientes que todavía no escribieron, para poder iniciar la conversación.
 */
export function getHilosDeCartera(despachanteId: string): HiloResumen[] {
  return getDb()
    .prepare(
      `SELECT u.id AS clienteId,
              COALESCE(NULLIF(TRIM(u.company_name), ''), u.email, 'Sin razón social') AS nombre,
              u.email AS email,
              MAX(m.created_at) AS ultimo,
              (SELECT texto FROM chat_messages
                WHERE cliente_id = u.id ORDER BY created_at DESC LIMIT 1) AS ultimoTexto,
              SUM(CASE WHEN m.origen = 'cliente' AND m.leido_estudio = '0' THEN 1 ELSE 0 END) AS sinLeer
       FROM users u
       LEFT JOIN chat_messages m ON m.cliente_id = u.id
       WHERE u.role = 'client' AND u.despachante_id = ?
       GROUP BY u.id
       ORDER BY sinLeer DESC, ultimo DESC NULLS LAST, nombre ASC`,
    )
    .all(despachanteId) as HiloResumen[];
}

/** Total sin leer de toda la cartera, para el indicador del menú. */
export function sinLeerEnCartera(despachanteId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c
       FROM chat_messages m
       JOIN users u ON u.id = m.cliente_id
       WHERE u.despachante_id = ? AND m.origen = 'cliente' AND m.leido_estudio = '0'`,
    )
    .get(despachanteId) as { c: number };
  return row.c;
}

/** ¿Ese cliente pertenece a la cartera de esa cuenta? Gate de todo acceso al hilo. */
export function clienteEnCartera(clienteId: string, despachanteId: string): boolean {
  const row = getDb()
    .prepare(
      "SELECT 1 FROM users WHERE id = ? AND role = 'client' AND despachante_id = ? LIMIT 1",
    )
    .get(clienteId, despachanteId);
  return Boolean(row);
}
