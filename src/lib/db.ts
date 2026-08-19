import "server-only";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { hashPassword } from "./hash";

/**
 * Base de datos SQLite local (archivo data/app.db).
 *
 * SQLite guarda únicamente usuarios y sesiones (login). Las operaciones y la
 * documentación de cada cliente se almacenan en parquet dentro de
 * data/clientes/<id_cliente>/ (ver lib/parquet-store.ts).
 */

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT UNIQUE,
      email         TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('admin','client','operador')),
      company_name  TEXT,
      person_type   TEXT,
      cuit          TEXT,
      iva_condition TEXT,
      cert_exencion TEXT,
      carta_garantia TEXT,
      contact_name  TEXT,
      phone         TEXT,
      address       TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS participants (
      id           TEXT PRIMARY KEY,
      operation_id TEXT NOT NULL,
      owner_id     TEXT NOT NULL,
      nombre       TEXT NOT NULL,
      email        TEXT,
      rol          TEXT,
      token        TEXT NOT NULL UNIQUE,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_participants_op ON participants(operation_id);
    CREATE INDEX IF NOT EXISTS idx_participants_token ON participants(token);

    CREATE TABLE IF NOT EXISTS participant_messages (
      id             TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL,
      operation_id   TEXT NOT NULL,
      owner_id       TEXT NOT NULL,
      origen         TEXT NOT NULL CHECK (origen IN ('estudio','participante')),
      autor          TEXT,
      texto          TEXT NOT NULL,
      leido_estudio  TEXT NOT NULL DEFAULT '0',
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pmsg_participant ON participant_messages(participant_id);
    CREATE INDEX IF NOT EXISTS idx_pmsg_operation ON participant_messages(operation_id);

    -- Última vez que el ESTUDIO (equipo) abrió cada operación. Sirve para marcar
    -- novedades sin ver (documentos / mensajes nuevos) en la lista de operaciones.
    CREATE TABLE IF NOT EXISTS operation_seen (
      operation_id TEXT PRIMARY KEY,
      seen_at      TEXT NOT NULL
    );

    -- Chat directo entre un cliente y su despachante. Un hilo por cliente, sin
    -- atarlo a una operación: el cliente puede escribir antes de tener la
    -- primera, que es justo cuando más falta hace.
    CREATE TABLE IF NOT EXISTS chat_messages (
      id             TEXT PRIMARY KEY,
      cliente_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      origen         TEXT NOT NULL CHECK (origen IN ('cliente','estudio')),
      autor_id       TEXT,
      autor          TEXT,
      texto          TEXT NOT NULL,
      leido_estudio  TEXT NOT NULL DEFAULT '0',
      leido_cliente  TEXT NOT NULL DEFAULT '0',
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chat_cliente ON chat_messages(cliente_id);

    -- Soporte de la plataforma: un hilo por cuenta que consulta. Queda todo
    -- registrado —es el historial que después lee el chatbot y lo que se
    -- adjunta al derivar por mail—, así que nada se borra al responder.
    CREATE TABLE IF NOT EXISTS soporte_mensajes (
      id           TEXT PRIMARY KEY,
      cuenta_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      origen       TEXT NOT NULL CHECK (origen IN ('usuario','soporte','bot')),
      autor        TEXT,
      texto        TEXT NOT NULL,
      leido_soporte TEXT NOT NULL DEFAULT '0',
      leido_usuario TEXT NOT NULL DEFAULT '0',
      /* Marca que este mensaje disparó el aviso por mail al equipo. */
      derivado     TEXT NOT NULL DEFAULT '0',
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_soporte_cuenta ON soporte_mensajes(cuenta_id);
  `);

  migrate(db);
  seedAdmin(db);

  _db = db;
  return db;
}

function migrate(db: Database.Database) {
  const cols = db
    .prepare("PRAGMA table_info(users)")
    .all() as { name: string }[];
  const tiene = (n: string) => cols.some((c) => c.name === n);
  if (!tiene("person_type")) {
    db.exec("ALTER TABLE users ADD COLUMN person_type TEXT");
  }
  // Certificado MiPyME / de exclusión vigente: exime percepciones de IVA y
  // Ganancias. Dato estable del perfil del cliente (lo usa el cotizador).
  if (!tiene("cert_exencion")) {
    db.exec("ALTER TABLE users ADD COLUMN cert_exencion TEXT");
  }
  // Carta de garantía del cliente para retirar contenedores. Guarda el TIPO:
  // 'anual' (vence el 31/12 del año, certificada por escribano) | 'puntual'
  // (válida por un solo embarque) | 'no' / null (sin carta registrada).
  if (!tiene("carta_garantia")) {
    db.exec("ALTER TABLE users ADD COLUMN carta_garantia TEXT");
  }
  // Vencimiento de la carta ANUAL (ISO 'YYYY-12-31'). Pasada esa fecha, la carta
  // queda vencida y hay que renovarla. La puntual no usa este campo.
  if (!tiene("carta_garantia_vence")) {
    db.exec("ALTER TABLE users ADD COLUMN carta_garantia_vence TEXT");
  }
  // Onboarding / alta de cliente para operar (formulario + aprobación admin).
  if (!tiene("op_status")) {
    db.exec("ALTER TABLE users ADD COLUMN op_status TEXT DEFAULT 'none'");
  }
  if (!tiene("op_application")) {
    db.exec("ALTER TABLE users ADD COLUMN op_application TEXT");
  }
  if (!tiene("op_rejection_reason")) {
    db.exec("ALTER TABLE users ADD COLUMN op_rejection_reason TEXT");
  }
  if (!tiene("op_meeting_at")) {
    db.exec("ALTER TABLE users ADD COLUMN op_meeting_at TEXT");
  }
  if (!tiene("op_submitted_at")) {
    db.exec("ALTER TABLE users ADD COLUMN op_submitted_at TEXT");
  }
  if (!tiene("op_reviewed_at")) {
    db.exec("ALTER TABLE users ADD COLUMN op_reviewed_at TEXT");
  }
  // Acceso por-cliente al portal self-service ('1' = habilitado). Por defecto off:
  // el estudio habilita el portal cliente por cliente al crearle el acceso.
  if (!tiene("portal_habilitado")) {
    db.exec("ALTER TABLE users ADD COLUMN portal_habilitado TEXT DEFAULT '0'");
  }

  // Suscripción del estudio (solo en cuentas raíz de despachante).
  // `trial_hasta`: fin de la prueba gratis, se fija al registrarse.
  // `plan`: null mientras no contrató; después, la clave del plan elegido.
  // `suscripcion_hasta`: hasta cuándo está paga. El estado se DERIVA de estas
  // dos fechas contra hoy, no se guarda: un estado guardado se desactualiza
  // solo con que pase el tiempo, sin que nadie toque la fila.
  if (!tiene("trial_hasta")) {
    db.exec("ALTER TABLE users ADD COLUMN trial_hasta TEXT");
    // Los estudios que ya existían arrancan su prueba ahora, no en el pasado.
    // El admin de la plataforma queda afuera: no es un estudio suscripto.
    db.exec(
      `UPDATE users SET trial_hasta = datetime('now', '+5 days')
       WHERE role = 'operador' AND despachante_id IS NULL`,
    );
  }
  if (!tiene("plan")) {
    db.exec("ALTER TABLE users ADD COLUMN plan TEXT");
  }
  if (!tiene("suscripcion_hasta")) {
    db.exec("ALTER TABLE users ADD COLUMN suscripcion_hasta TEXT");
  }

  // Cartera propia por cuenta: a qué despachante (o admin) pertenece este
  // cliente. Cada cuenta del equipo ve solo los suyos; nadie ve la cartera de
  // otro. En las cuentas del equipo queda en NULL: solo aplica a 'client'.
  if (!tiene("despachante_id")) {
    db.exec("ALTER TABLE users ADD COLUMN despachante_id TEXT");
    // Los clientes que ya existían son del admin fundador, que hasta ahora era
    // el único dueño posible.
    const admin = db
      .prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1")
      .get() as { id: string } | undefined;
    if (admin) {
      db.prepare(
        "UPDATE users SET despachante_id = ? WHERE role = 'client' AND despachante_id IS NULL",
      ).run(admin.id);
    }
  }

  // Datos de la DJ del importador que el SIM pide como complementarios de
  // cabecera en TODA importación (13 de 13 despachos del archivo los llevan):
  // `DOMICIL.ESTABLEC` y `FECHA INIC.ACTIV`. Son del importador y no de la
  // operación —en el archivo el par domicilio+fecha se repite igual mientras
  // el proveedor cambia—, así que viven en su ficha y se cargan una sola vez.
  if (!tiene("domicilio_establecimiento")) {
    db.exec("ALTER TABLE users ADD COLUMN domicilio_establecimiento TEXT");
  }
  // Alta en AFIP, ISO 'YYYY-MM-DD'. Al archivo sale como dd/mm/aaaa.
  if (!tiene("inicio_actividad")) {
    db.exec("ALTER TABLE users ADD COLUMN inicio_actividad TEXT");
  }

  // Logo del estudio para los PDF que se le mandan al cliente. Guarda solo el
  // nombre del archivo; los bytes viven en el directorio del estudio. Es del
  // DUEÑO del estudio: los empleados descargan con el logo de su estudio, no
  // con uno propio.
  if (!tiene("logo")) {
    db.exec("ALTER TABLE users ADD COLUMN logo TEXT");
  }

  // Rol/función del participante (texto libre que carga quien lo invita).
  const pCols = db
    .prepare("PRAGMA table_info(participants)")
    .all() as { name: string }[];
  if (!pCols.some((c) => c.name === "rol")) {
    db.exec("ALTER TABLE participants ADD COLUMN rol TEXT");
  }

  // Bases viejas tienen el CHECK de role solo con ('admin','client'). Para poder
  // dar de alta empleados (rol 'operador') hay que reconstruir la tabla.
  const ddl = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'",
    )
    .get() as { sql: string } | undefined;
  if (ddl && !ddl.sql.includes("'operador'")) {
    const cols = [
      "id",
      "username",
      "email",
      "password_hash",
      "role",
      "company_name",
      "person_type",
      "cuit",
      "iva_condition",
      "cert_exencion",
      "carta_garantia",
      "carta_garantia_vence",
      "contact_name",
      "phone",
      "address",
      "op_status",
      "op_application",
      "op_rejection_reason",
      "op_meeting_at",
      "op_submitted_at",
      "op_reviewed_at",
      "created_at",
    ].join(", ");

    db.pragma("foreign_keys = OFF");
    db.transaction(() => {
      db.exec(`
        CREATE TABLE users_new (
          id            TEXT PRIMARY KEY,
          username      TEXT UNIQUE,
          email         TEXT UNIQUE,
          password_hash TEXT NOT NULL,
          role          TEXT NOT NULL CHECK (role IN ('admin','client','operador')),
          company_name  TEXT,
          person_type   TEXT,
          cuit          TEXT,
          iva_condition TEXT,
          cert_exencion TEXT,
          carta_garantia TEXT,
          carta_garantia_vence TEXT,
          contact_name  TEXT,
          phone         TEXT,
          address       TEXT,
          op_status     TEXT DEFAULT 'none',
          op_application TEXT,
          op_rejection_reason TEXT,
          op_meeting_at TEXT,
          op_submitted_at TEXT,
          op_reviewed_at TEXT,
          created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      db.exec(
        `INSERT INTO users_new (${cols}) SELECT ${cols} FROM users;`,
      );
      db.exec("DROP TABLE users;");
      db.exec("ALTER TABLE users_new RENAME TO users;");
    })();
    db.pragma("foreign_keys = ON");
  }
}

function seedAdmin(db: Database.Database) {
  const existe = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get("admin");
  if (existe) return;

  db.prepare(
    `INSERT INTO users (id, username, email, password_hash, role, company_name)
     VALUES (?, ?, NULL, ?, 'admin', 'Estudio de Despachantes')`,
  ).run(cryptoId(), "admin", hashPassword("admin"));
}

export function cryptoId(): string {
  return crypto.randomUUID();
}
