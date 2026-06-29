import "server-only";
import { getDb } from "./db";
import type { PublicUser } from "./types";

/**
 * Alta de cliente para operar (importar/exportar).
 *
 * Flujo: el cliente completa un formulario de calificación. Si no llega al piso
 * (o no está dispuesto a inscribirse como importador) se rechaza automáticamente
 * con un motivo. Si pasa, elige un horario de videollamada (slot) y queda "en
 * revisión" hasta que un admin lo apruebe o rechace. Sólo los aprobados pueden
 * crear operaciones.
 */

export const CIF_MINIMO = 15000; // USD por operación
export const VOLUMEN_ANUAL_MINIMO = 30000; // USD/año (camino alternativo)

export type OpStatus = "none" | "submitted" | "approved" | "rejected";

export type SolicitudData = {
  razonSocial: string;
  cuit: string;
  registroImportador: "si" | "tramite" | "no";
  antiguedad: "nueva" | "media" | "establecida"; // <6m / 6m-2a / >2a
  titularidad: "propia" | "tercero"; // ¿la mercadería es de su empresa o de un tercero?
  rubro: string;
  detalleProducto: string;
  pais: string;
  proveedor: string; // proveedor identificado + cómo lo conoció
  cifOperacion: number;
  volumenAnual: number;
  financiacion: "propio" | "bancario" | "inversor" | "otro";
  yaImporto: "si" | "no";
  comoConocio: string;
  motivoCambio: string;
  documentacion: "si" | "no"; // dispuesto a entregar respaldo (KYC)
  web: string;
};

export type Evaluacion = { ok: boolean; motivo?: string };

/** Reglas de calificación automática (deal-breakers). */
export function evaluarSolicitud(s: SolicitudData): Evaluacion {
  if (s.documentacion === "no") {
    return {
      ok: false,
      motivo:
        "Para operar necesitamos documentación de respaldo: estatuto / contrato social, DNI del representante legal y comprobante del origen de los fondos. Es un requisito de compliance que no podemos saltear, así que sin eso no podemos avanzar.",
    };
  }
  if (s.registroImportador === "no") {
    return {
      ok: false,
      motivo:
        "Para operar con nosotros necesitás estar inscripto (o iniciar el trámite) en el Registro de Importadores/Exportadores, ya que la mercadería se importa a tu nombre. Cuando lo tengas en marcha, volvé a aplicar.",
    };
  }
  if (s.titularidad === "tercero") {
    return {
      ok: false,
      motivo:
        "Trabajamos directamente con el titular de la mercadería, es decir, el importador a cuyo nombre se realiza la operación. Como esta operación sería para un tercero, no es el esquema que tomamos.",
    };
  }
  if (s.antiguedad === "nueva") {
    return {
      ok: false,
      motivo:
        "Por el momento priorizamos empresas con trayectoria operativa. Como tu empresa tiene menos de 6 meses, todavía no es el perfil que podemos atender; cuando tengas más recorrido, te esperamos.",
    };
  }
  if (!s.proveedor.trim()) {
    return {
      ok: false,
      motivo:
        "Para avanzar necesitamos que tengas identificado al proveedor del exterior. Sin un proveedor concreto no podemos evaluar la operación.",
    };
  }
  if (s.cifOperacion < CIF_MINIMO && s.volumenAnual < VOLUMEN_ANUAL_MINIMO) {
    return {
      ok: false,
      motivo:
        `Hoy trabajamos operaciones desde USD ${CIF_MINIMO.toLocaleString("es-AR")} de valor CIF ` +
        `(o un volumen anual estimado desde USD ${VOLUMEN_ANUAL_MINIMO.toLocaleString("es-AR")}). ` +
        "Tu operación está por debajo de ese piso, así que por ahora no es el perfil que podemos atender con la calidad que buscamos. Si tu volumen crece, te esperamos.",
    };
  }
  return { ok: true };
}

/**
 * Banderas de riesgo para que el admin las revise en la videollamada.
 * No cortan la solicitud (pueden ser legítimas) pero son señales a chequear.
 */
export function flagsDeRiesgo(s: SolicitudData): string[] {
  const f: string[] = [];
  if (s.financiacion === "inversor") {
    f.push("La operación la financia un inversor / tercero");
  }
  if (s.registroImportador === "tramite") {
    f.push("Registro de importador todavía en trámite");
  }
  if (s.yaImporto === "no") {
    f.push("Sin experiencia previa importando");
  }
  return f;
}

/* ──────────────────────────  Solicitud del cliente  ────────────────────────── */

/** Guarda la solicitud y deja al cliente "en revisión" (ya pasó el filtro). */
export function guardarSolicitudEnRevision(
  userId: string,
  data: SolicitudData,
): void {
  getDb()
    .prepare(
      `UPDATE users
         SET op_status = 'submitted',
             op_application = ?,
             op_rejection_reason = NULL,
             op_submitted_at = datetime('now')
       WHERE id = ?`,
    )
    .run(JSON.stringify(data), userId);
}

/** Marca al cliente como rechazado automáticamente, con motivo. */
export function rechazarAutomatico(
  userId: string,
  data: SolicitudData,
  motivo: string,
): void {
  getDb()
    .prepare(
      `UPDATE users
         SET op_status = 'rejected',
             op_application = ?,
             op_rejection_reason = ?,
             op_submitted_at = datetime('now'),
             op_reviewed_at = datetime('now')
       WHERE id = ?`,
    )
    .run(JSON.stringify(data), motivo, userId);
}

/* ──────────────────────  Reunión (agendado por el cliente)  ──────────────────────
 * El cliente elige fecha y hora según reglas fijas: a partir de mañana, de lunes a
 * viernes, en las franjas 10:00–12:00 y 15:00–17:00 (horas en punto, inclusive).
 * Se guarda como texto local "YYYY-MM-DDTHH:MM" para evitar corrimientos de zona.
 */

export const HORARIOS_REUNION = [10, 11, 12, 15, 16, 17] as const;

/** Valida fecha (YYYY-MM-DD) y hora contra las reglas. Devuelve el datetime local o null. */
export function validarReunion(fecha: string, hora: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  if (!HORARIOS_REUNION.includes(hora as (typeof HORARIOS_REUNION)[number])) {
    return null;
  }

  // Construimos la fecha al mediodía local para chequear el día sin riesgo de zona.
  const d = new Date(`${fecha}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;

  const dia = d.getDay(); // 0 dom … 6 sáb
  if (dia === 0 || dia === 6) return null;

  // Debe ser a partir de mañana (comparando sólo la fecha).
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const elegida = new Date(`${fecha}T00:00:00`);
  if (elegida.getTime() <= hoy.getTime()) return null;

  return `${fecha}T${String(hora).padStart(2, "0")}:00`;
}

/** Guarda la reunión solicitada por el cliente. Devuelve true si era válida. */
export function reservarReunion(
  userId: string,
  fecha: string,
  hora: number,
): boolean {
  const meeting = validarReunion(fecha, hora);
  if (!meeting) return false;
  getDb()
    .prepare("UPDATE users SET op_meeting_at = ? WHERE id = ?")
    .run(meeting, userId);
  return true;
}

/* ──────────────────────────  Aprobación (admin)  ────────────────────────── */

export type SolicitudAdmin = PublicUser & {
  solicitud: SolicitudData | null;
};

function parseSolicitud(raw: string | null): SolicitudData | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SolicitudData;
  } catch {
    return null;
  }
}

function aSolicitudAdmin(u: PublicUser): SolicitudAdmin {
  return {
    ...u,
    solicitud: parseSolicitud(u.op_application),
  };
}

/** Solicitudes en revisión (esperando decisión del admin). */
export function getSolicitudesPendientes(): SolicitudAdmin[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM users
       WHERE role = 'client' AND op_status = 'submitted'
       ORDER BY op_submitted_at ASC`,
    )
    .all() as PublicUser[];
  return rows.map(aSolicitudAdmin);
}

export function contarSolicitudesPendientes(): number {
  const r = getDb()
    .prepare(
      "SELECT COUNT(*) AS c FROM users WHERE role = 'client' AND op_status = 'submitted'",
    )
    .get() as { c: number };
  return r.c;
}

export function aprobarCliente(userId: string): void {
  getDb()
    .prepare(
      `UPDATE users
         SET op_status = 'approved',
             op_rejection_reason = NULL,
             op_reviewed_at = datetime('now')
       WHERE id = ? AND role = 'client'`,
    )
    .run(userId);
}

/** Quita la habilitación para operar (vuelve al estado inicial, sin acceso). */
export function revocarCliente(userId: string): void {
  getDb()
    .prepare(
      `UPDATE users
         SET op_status = 'none',
             op_rejection_reason = NULL,
             op_meeting_at = NULL,
             op_reviewed_at = datetime('now')
       WHERE id = ? AND role = 'client'`,
    )
    .run(userId);
}

export function rechazarCliente(userId: string, motivo: string): void {
  getDb()
    .prepare(
      `UPDATE users
         SET op_status = 'rejected',
             op_rejection_reason = ?,
             op_reviewed_at = datetime('now'),
             op_meeting_at = NULL
       WHERE id = ? AND role = 'client'`,
    )
    .run(motivo, userId);
}
