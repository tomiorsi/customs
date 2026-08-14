import "server-only";
import { cryptoId, getDb } from "./db";
import { hashPassword } from "./hash";
import type { DocType } from "./docs";
import {
  ETAPA_INICIAL,
  estadoClienteDeEtapa,
  etapaDesdeEstadoViejo,
  normalizarEtapa,
  parseChecklist,
} from "./workflow";
import {
  clienteDir,
  escribirFilas,
  leerFilas,
  type Fila,
} from "./parquet-store";
import { conArchivo } from "./lock-archivo";
import path from "node:path";
import { ESTADOS } from "./estados";

/** Última etapa del pipeline: una operación en este estado se considera cerrada. */
const ESTADO_CERRADO = ESTADOS[ESTADOS.length - 1].value;

export type ClientRow = {
  id: string;
  email: string | null;
  company_name: string | null;
  cuit: string | null;
  iva_condition: string | null;
  contact_name: string | null;
  phone: string | null;
  op_status: string | null;
  /** '1' si el cliente tiene acceso al portal (login creado). */
  portal_habilitado: string | null;
  /** Tipo de carta de garantía: 'anual' | 'puntual' | 'no' | null. */
  carta_garantia: string | null;
  /** Vencimiento de la carta anual (ISO 'YYYY-12-31'); null para puntual/sin. */
  carta_garantia_vence: string | null;
  created_at: string;
  ops: number;
  opsActivas: number;
  opsCerradas: number;
};

type ClienteBasico = {
  id: string;
  company_name: string | null;
  email: string | null;
  cuit: string | null;
  iva_condition: string | null;
  cert_exencion: string | null;
  carta_garantia: string | null;
};

function clientesBasicos(): ClienteBasico[] {
  return getDb()
    .prepare(
      `SELECT id, company_name, email, cuit, iva_condition, cert_exencion, carta_garantia
       FROM users WHERE role = 'client'`,
    )
    .all() as ClienteBasico[];
}

export type ClienteFiscal = {
  id: string;
  nombre: string;
  cuit: string | null;
  ivaCondition: string | null;
  certExencion: string | null;
};

/**
 * Clientes con su perfil fiscal, para que el equipo cotice a nombre de uno.
 * La condición de IVA y el certificado de exención cambian las percepciones,
 * así que el cotizador necesita el perfil real y no un default.
 */
export function clientesParaCotizar(): ClienteFiscal[] {
  return clientesBasicos()
    .map((c) => ({
      id: c.id,
      nombre: c.company_name?.trim() || c.email?.trim() || "Sin razón social",
      cuit: c.cuit,
      ivaCondition: c.iva_condition,
      certExencion: c.cert_exencion,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** ¿Existe un cliente con ese id? (para que el equipo cree operaciones a su nombre). */
export function existeCliente(id: string): boolean {
  if (!id?.trim()) return false;
  const row = getDb()
    .prepare("SELECT 1 FROM users WHERE id = ? AND role = 'client' LIMIT 1")
    .get(id) as { 1: number } | undefined;
  return Boolean(row);
}

export type NuevoCliente = {
  companyName: string;
  email?: string | null;
  cuit?: string | null;
  ivaCondition?: string | null;
  contactName?: string | null;
  phone?: string | null;
  personType?: string | null;
};

/**
 * Alta de cliente por el equipo (control interno). El cliente es un registro que
 * gestiona el estudio; no loguea (password aleatorio) mientras el portal esté
 * deshabilitado. Se puede resetear la contraseña si más adelante se reactiva.
 */
export function createCliente(input: NuevoCliente): { id: string; error?: string } {
  const companyName = input.companyName.trim();
  if (!companyName) return { id: "", error: "El nombre / razón social es obligatorio." };
  const email = input.email?.trim().toLowerCase() || null;
  const db = getDb();
  if (email) {
    const existe = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existe) return { id: "", error: "Ya existe un cliente con ese email." };
  }
  const id = cryptoId();
  const password = `${cryptoId()}${cryptoId()}`;
  const personType = input.personType === "fisica" ? "fisica" : "juridica";
  db.prepare(
    `INSERT INTO users
       (id, username, email, password_hash, role, company_name, person_type,
        cuit, iva_condition, contact_name, phone, op_status)
     VALUES (?, NULL, ?, ?, 'client', ?, ?, ?, ?, ?, ?, 'approved')`,
  ).run(
    id,
    email,
    hashPassword(password),
    companyName,
    personType,
    input.cuit?.trim() || null,
    input.ivaCondition?.trim() || null,
    input.contactName?.trim() || null,
    input.phone?.trim() || null,
  );
  return { id };
}

export type ClienteEditable = {
  id: string;
  company_name: string | null;
  email: string | null;
  cuit: string | null;
  iva_condition: string | null;
  contact_name: string | null;
  phone: string | null;
  person_type: string | null;
};

/** Datos de un cliente para prellenar el formulario de edición. */
export function getClienteById(id: string): ClienteEditable | null {
  if (!id?.trim()) return null;
  const row = getDb()
    .prepare(
      `SELECT id, company_name, email, cuit, iva_condition, contact_name, phone, person_type
       FROM users WHERE id = ? AND role = 'client'`,
    )
    .get(id) as ClienteEditable | undefined;
  return row ?? null;
}

/**
 * Modifica los datos de un cliente existente (razón social, contacto, mail, etc.).
 * Actualización PARCIAL: sólo toca los campos presentes en `input` (así se puede
 * editar una sola celda sin borrar el resto). Lo pueden hacer admin y operador. No
 * toca la contraseña; si cambia el email, ese pasa a ser también su usuario de ingreso.
 */
export function updateCliente(
  id: string,
  input: Partial<NuevoCliente>,
): { error?: string } {
  const db = getDb();
  const cliente = db
    .prepare("SELECT id FROM users WHERE id = ? AND role = 'client'")
    .get(id);
  if (!cliente) return { error: "Cliente no encontrado." };

  const sets: string[] = [];
  const vals: (string | null)[] = [];
  const push = (col: string, valor: string | null) => {
    sets.push(`${col} = ?`);
    vals.push(valor);
  };

  if (input.companyName !== undefined) {
    const companyName = input.companyName.trim();
    if (!companyName) return { error: "El nombre / razón social es obligatorio." };
    push("company_name", companyName);
  }
  if (input.email !== undefined) {
    const email = input.email?.trim().toLowerCase() || null;
    if (email) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return { error: "Ingresá un email válido." };
      }
      const enUso = db
        .prepare("SELECT id FROM users WHERE email = ? AND id <> ?")
        .get(email, id);
      if (enUso) return { error: "Ese email ya está en uso por otra cuenta." };
    }
    push("email", email);
  }
  if (input.cuit !== undefined) push("cuit", input.cuit?.trim() || null);
  if (input.ivaCondition !== undefined)
    push("iva_condition", input.ivaCondition?.trim() || null);
  if (input.contactName !== undefined)
    push("contact_name", input.contactName?.trim() || null);
  if (input.phone !== undefined) push("phone", input.phone?.trim() || null);
  if (input.personType !== undefined)
    push("person_type", input.personType === "fisica" ? "fisica" : "juridica");

  if (sets.length === 0) return {};
  db.prepare(
    `UPDATE users SET ${sets.join(", ")} WHERE id = ? AND role = 'client'`,
  ).run(...vals, id);
  return {};
}

/**
 * Genera/actualiza el acceso (login) de un cliente existente: fija su email y
 * contraseña para poder entregárselos. El email es el identificador de ingreso.
 */
export function darAccesoCliente(
  clienteId: string,
  email: string,
  password: string,
): { error?: string } {
  const em = email.trim().toLowerCase();
  if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
    return { error: "Ingresá un email válido para el acceso del cliente." };
  }
  if (password.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres." };
  }
  const db = getDb();
  const cliente = db
    .prepare("SELECT id FROM users WHERE id = ? AND role = 'client'")
    .get(clienteId);
  if (!cliente) return { error: "Cliente no encontrado." };
  const enUso = db
    .prepare("SELECT id FROM users WHERE email = ? AND id <> ?")
    .get(em, clienteId);
  if (enUso) return { error: "Ese email ya está en uso por otra cuenta." };
  // Al crear el acceso, habilitamos el portal SOLO para este cliente (acceso por-cliente).
  db.prepare(
    "UPDATE users SET email = ?, password_hash = ?, portal_habilitado = '1' WHERE id = ? AND role = 'client'",
  ).run(em, hashPassword(password), clienteId);
  return {};
}

/** Habilita o revoca el acceso al portal de un cliente (sin tocar sus credenciales). */
export function setPortalHabilitadoCliente(clienteId: string, habilitado: boolean): void {
  getDb()
    .prepare("UPDATE users SET portal_habilitado = ? WHERE id = ? AND role = 'client'")
    .run(habilitado ? "1" : "0", clienteId);
}

export async function getClients(): Promise<ClientRow[]> {
  const users = getDb()
    .prepare(
      `SELECT id, email, company_name, cuit, iva_condition,
              contact_name, phone, op_status, portal_habilitado,
              carta_garantia, carta_garantia_vence, created_at
       FROM users
       WHERE role = 'client'
       ORDER BY created_at DESC`,
    )
    .all() as Omit<ClientRow, "ops" | "opsActivas" | "opsCerradas">[];

  const out: ClientRow[] = [];
  for (const u of users) {
    const ops = await leerFilas(opsFile(u.id), OPERACION_COLS);
    const opsCerradas = ops.filter((o) => o.estado === ESTADO_CERRADO).length;
    out.push({
      ...u,
      ops: ops.length,
      opsActivas: ops.length - opsCerradas,
      opsCerradas,
    });
  }
  return out;
}

/**
 * Actualiza el estado de la carta de garantía de un cliente. La anual lleva
 * vencimiento (31/12 del año); la puntual y "sin carta" no usan vencimiento.
 */
export function setCartaGarantia(
  userId: string,
  tipo: "anual" | "puntual" | "no",
  vence: string | null,
): void {
  getDb()
    .prepare(
      "UPDATE users SET carta_garantia = ?, carta_garantia_vence = ? WHERE id = ? AND role = 'client'",
    )
    .run(tipo, tipo === "anual" ? vence : null, userId);
}

/* ─────────────────────────  Operadores (empleados)  ───────────────────────── */

export type OperadorRow = {
  id: string;
  username: string | null;
  email: string | null;
  contact_name: string | null;
  created_at: string;
};

export function getOperadores(): OperadorRow[] {
  return getDb()
    .prepare(
      `SELECT id, username, email, contact_name, created_at
       FROM users WHERE role = 'operador' ORDER BY created_at ASC`,
    )
    .all() as OperadorRow[];
}

export type NuevoOperador = {
  nombre: string;
  username: string;
  email?: string | null;
  password: string;
};

export function createOperador(input: NuevoOperador): { id: string } {
  const id = cryptoId();
  getDb()
    .prepare(
      `INSERT INTO users (id, username, email, password_hash, role, contact_name)
       VALUES (?, ?, ?, ?, 'operador', ?)`,
    )
    .run(
      id,
      input.username.trim(),
      input.email?.trim() || null,
      hashPassword(input.password),
      input.nombre.trim(),
    );
  return { id };
}

export function removeOperador(id: string): void {
  getDb()
    .prepare("DELETE FROM users WHERE id = ? AND role = 'operador'")
    .run(id);
}

export type EditarOperador = {
  id: string;
  nombre: string;
  username: string;
  email?: string | null;
  /** Si viene vacío/nulo, no se cambia la contraseña actual. */
  password?: string | null;
};

export function updateOperador(input: EditarOperador): void {
  const db = getDb();
  const nombre = input.nombre.trim();
  const username = input.username.trim();
  const email = input.email?.trim() || null;
  if (input.password && input.password.length > 0) {
    db.prepare(
      `UPDATE users
         SET contact_name = ?, username = ?, email = ?, password_hash = ?
       WHERE id = ? AND role = 'operador'`,
    ).run(nombre, username, email, hashPassword(input.password), input.id);
  } else {
    db.prepare(
      `UPDATE users
         SET contact_name = ?, username = ?, email = ?
       WHERE id = ? AND role = 'operador'`,
    ).run(nombre, username, email, input.id);
  }
}

export function countClients(): number {
  const r = getDb()
    .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'client'")
    .get() as { c: number };
  return r.c;
}

export async function countOperations(): Promise<number> {
  let total = 0;
  for (const c of clientesBasicos()) {
    const ops = await leerFilas(opsFile(c.id), OPERACION_COLS);
    total += ops.length;
  }
  return total;
}

/* ─────────────────────────  Operaciones  ───────────────────────── */

export type { DocType } from "./docs";
export { DOC_LABELS, transporteLabel } from "./docs";

export type DocumentRow = {
  id: string;
  operation_id: string;
  user_id: string;
  doc_type: DocType;
  file_name: string;
  stored_name: string;
  mime_type: string | null;
  size: number | null;
  created_at: string;
  /** JSON con datos estructurados extraídos por IA (ver ExtraccionDocCache). */
  extraccion_ia: string | null;
};

/** Extracción estructurada persistida por documento (evita releer PDFs). */
export type ExtraccionDocCache = {
  at: string;
  stored_name: string;
  size: number | null;
  datos: unknown;
  /** Inventario posicional fase 1. */
  lectura_bruta?: unknown;
  vacios_interpretacion?: unknown;
  tipo?: string;
  resumen?: string;
};

export type EventoTipo =
  | "creacion"
  | "estado"
  | "documento"
  | "edicion"
  | "nota"
  | "ia"
  | "pedido";

export type EventoRow = {
  id: string;
  operation_id: string;
  user_id: string;
  tipo: EventoTipo;
  titulo: string;
  detalle: string | null;
  autor: string | null;
  interno: boolean;
  created_at: string;
};

/**
 * Sufijo con el que marcamos al autor de un evento generado por el CLIENTE dueño
 * de la operación ("Acme SA (cliente)"). Sirve para detectar novedades que el
 * equipo debe ver.
 */
export const SUFIJO_CLIENTE = " (cliente)";

/**
 * ¿El evento es una novedad para el estudio? Es decir, lo generó el cliente (no
 * el equipo). Se reconoce por el sufijo de rol en el autor, que se agrega al
 * crear el evento (carga de documentos, etc.).
 */
export function esNovedadEstudio(e: { autor: string | null }): boolean {
  return (e.autor ?? "").endsWith(SUFIJO_CLIENTE);
}

/** Campos opcionales de una operación (además de tipo/via/contraparte). */
export const OP_CAMPOS = [
  "titulo",
  // Alias del nombre puesto por el CLIENTE: sólo lo ve él. El título "oficial"
  // (titulo) lo maneja el equipo; si el cliente lo edita, se guarda acá.
  "titulo_cliente",
  "via",
  "contraparte",
  "detalle",
  "aduana",
  "pais_origen",
  "pais_procedencia",
  "pais_adquisicion",
  "pais_destino",
  "mercaderia",
  "ncm",
  "marca",
  "estado_merc",
  // ¿El cliente ya operó este producto con nosotros? "si" = primera vez (hay que
  // clasificar con el nomenclador) / "no" = repetido (NCM conocida, se carga a mano).
  "primera_vez",
  "cantidad",
  "unidad",
  "bultos",
  "tipo_embalaje",
  "peso_neto",
  "peso_bruto",
  "incoterm",
  "moneda",
  "valor_factura",
  "gastos_origen",
  "gastos_destino",
  "valor_fob",
  "flete",
  "seguro",
  "valor_cif",
  "forma_pago",
  /** N° de la factura comercial (Invoice No.). No confundir con el doc de transporte. */
  "nro_factura",
  // Detalle de las facturas comerciales cuando hay MÁS DE UNA en la operación
  // (consolidado / varios proveedores). JSON: [{nro, proveedor, total, moneda}].
  // El valor_factura de la operación pasa a ser la SUMA de estos totales (base CIF).
  "facturas_json",
  /** Fecha de emisión de la factura comercial (ISO YYYY-MM-DD). */
  "fecha_factura",
  /** Plazo de pago comercial en días (cuenta abierta, D/A, etc.). */
  "plazo_pago_dias",
  /** Vencimiento del pago al proveedor (ISO YYYY-MM-DD). */
  "fecha_vencimiento_pago",
  // Cómo y dónde se libera/emite el documento de transporte (del pedido de
  // compra): "original" (BL original a canjear), "telex" (telex release),
  // "waybill" (sea waybill / AWB / CRT, sin canje), y/o "origen"/"destino".
  "liberacion_doc",
  "medio_transporte",
  "transportista",
  "transporte_doc_nro",
  "puerto_origen",
  "puerto_destino",
  /** Escala intermedia: transbordo (mar/aéreo) o paso fronterizo persistido. */
  "puerto_transbordo",
  "tipo_carga",
  "contenedor",
  "paso_frontera",
  "eta",
  // Logística / costos: tipo y cantidad de contenedor (detectados del BL),
  // overrides de gastos de logística (JSON) y transporte interno estimado.
  "tipo_contenedor",
  "cantidad_contenedores",
  "volumen_cbm",
  "costos_override",
  "transporte_interno",
  // Hallazgos automáticos de la IA por documento subido (JSON). Mapa
  // docType -> { doc, etapa, resumen, at, hallazgos:[{nivel,texto}] }. Se
  // muestra como alerta fija en el paso correspondiente y se REEMPLAZA por
  // tipo de documento en cada subida/re-análisis (no se acumula historial).
  "hallazgos_ia",
  // Resultado de la validación de la IA por etapa (JSON). Mapa
  // etapa -> { at, resultado:DocumentacionIA }. Es lo que devuelve "Validar
  // documentación", que se corre AUTOMÁTICAMENTE al subir un documento y se
  // PERSISTE para mostrarse sin tener que apretar el botón. Se REEMPLAZA por
  // etapa en cada re-análisis.
  "validacion_ia",
  // Resoluciones IA de conflictos entre documentos (JSON). Mapa fingerprint
  // (campo + candidatos) → { valor, naturaleza, motivo, candidatos, at }.
  // Evita re-preguntar el mismo cruce en subidas y validaciones posteriores.
  "resoluciones_conflictos",
  // Último cruce reconciliación: fingerprint de docs + timestamp (evita re-correr si no cambió).
  "reconciliacion_meta",
] as const;

export type OpCampo = (typeof OP_CAMPOS)[number];

export type OperationRow = {
  id: string;
  user_id: string;
  ref: string;
  tipo: string;
  estado: string;
  etapa: string;
  checklist: string | null;
  assigned_to: string | null;
  created_at: string;
  docs: number;
} & Record<OpCampo, string | null>;

export type OperationWithClient = OperationRow & {
  company_name: string | null;
  client_email: string | null;
  client_cuit: string | null;
  /** Condición de IVA del cliente (alta), para liquidar según su perfil fiscal. */
  client_iva_condition: string | null;
  /** Certificado MiPyME / exclusión vigente ("si"/"no") del cliente. */
  client_cert_exencion: string | null;
  /** Tipo de carta de garantía del cliente ('anual' | 'puntual' | 'no' | null), para avisos de retiro. */
  client_carta_garantia: string | null;
};

export type NewOperationInput = {
  userId: string;
  tipo: string;
} & Partial<Record<OpCampo, string | null>>;

/* ───────────────── Esquemas y rutas de parquet ───────────────── */

const OPERACION_COLS = [
  "id",
  "user_id",
  "ref",
  "tipo",
  "estado",
  "etapa",
  "checklist",
  "assigned_to",
  "created_at",
  ...OP_CAMPOS,
] as const;

const DOCUMENTO_COLS = [
  "id",
  "operation_id",
  "user_id",
  "doc_type",
  "file_name",
  "stored_name",
  "mime_type",
  "size",
  "created_at",
  "extraccion_ia",
] as const;

const EVENTO_COLS = [
  "id",
  "operation_id",
  "user_id",
  "tipo",
  "titulo",
  "detalle",
  "autor",
  "interno",
  "created_at",
] as const;

function opsFile(userId: string): string {
  return path.join(clienteDir(userId), "operaciones.parquet");
}

function docsFile(userId: string): string {
  return path.join(clienteDir(userId), "documentos.parquet");
}

function eventosFile(userId: string): string {
  return path.join(clienteDir(userId), "eventos.parquet");
}

function nowIso(): string {
  return new Date().toISOString();
}

function aOperationRow(f: Fila, docs: number): OperationRow {
  // La etapa interna es la fuente de verdad. Para operaciones viejas (sin etapa)
  // la derivamos del estado clásico; el estado del cliente se deriva de la etapa.
  const etapa = normalizarEtapa(
    f.etapa || etapaDesdeEstadoViejo(f.estado) || ETAPA_INICIAL,
  );
  const row = {
    id: f.id ?? "",
    user_id: f.user_id ?? "",
    ref: f.ref ?? "",
    tipo: f.tipo ?? "",
    estado: estadoClienteDeEtapa(etapa),
    etapa,
    checklist: f.checklist ?? null,
    assigned_to: f.assigned_to ?? null,
    created_at: f.created_at ?? "",
    docs,
  } as OperationRow;
  const extra = row as unknown as Record<string, string | null>;
  for (const c of OP_CAMPOS) extra[c] = f[c] ?? null;
  return row;
}

function aDocumentRow(f: Fila): DocumentRow {
  return {
    id: f.id ?? "",
    operation_id: f.operation_id ?? "",
    user_id: f.user_id ?? "",
    doc_type: (f.doc_type ?? "otro") as DocType,
    file_name: f.file_name ?? "",
    stored_name: f.stored_name ?? "",
    mime_type: f.mime_type ?? null,
    size: f.size ? Number(f.size) : null,
    created_at: f.created_at ?? "",
    extraccion_ia: f.extraccion_ia ?? null,
  };
}

function porFechaDesc(a: { created_at: string }, b: { created_at: string }) {
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
}

/** Extrae el nombre de la operación del evento de alta («CRT Brasil», etc.). */
function tituloDesdeEventoCreacion(detalle: string | null): string | null {
  if (!detalle) return null;
  const m = detalle.match(/«([^»]+)»/);
  const t = m?.[1]?.trim();
  return t || null;
}

/**
 * Si el título se perdió al limpiar datos provisionales del Paso 1, lo recupera
 * del evento de creación y lo persiste de nuevo.
 */
async function asegurarTituloOperacion(
  userId: string,
  opId: string,
  titulo: string | null,
): Promise<string | null> {
  if ((titulo ?? "").trim()) return titulo;
  const eventos = await getEventosByOperation(userId, opId);
  const creacion = eventos.find((e) => e.titulo === "Recibimos tu operación");
  const recuperado = tituloDesdeEventoCreacion(creacion?.detalle ?? null);
  if (!recuperado) return null;
  await updateOperationCampos(userId, opId, { titulo: recuperado });
  return recuperado;
}

/** Genera una referencia legible: IMP-2026-0007 / EXP-2026-0012. */
export async function nextOperationRef(tipo: string): Promise<string> {
  const prefix = tipo.toLowerCase().startsWith("exp") ? "EXP" : "IMP";
  const year = new Date().getFullYear();
  const seq = (await countOperations()) + 1;
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

export async function createOperation(input: NewOperationInput): Promise<string> {
  return conArchivo(opsFile(input.userId), async () => {
  const id = cryptoId();
  const ref = await nextOperationRef(input.tipo);

  const filas = await leerFilas(opsFile(input.userId), OPERACION_COLS);
  const fila: Fila = {
    id,
    user_id: input.userId,
    ref,
    tipo: input.tipo,
    estado: estadoClienteDeEtapa(ETAPA_INICIAL),
    etapa: ETAPA_INICIAL,
    checklist: null,
    assigned_to: null,
    created_at: nowIso(),
  };
  for (const c of OP_CAMPOS) fila[c] = input[c] ?? null;
  filas.push(fila);

  await escribirFilas(opsFile(input.userId), OPERACION_COLS, filas);
  return id;
  });
}

export async function addDocument(input: {
  operationId: string;
  userId: string;
  docType: DocType;
  fileName: string;
  storedName: string;
  mimeType: string | null;
  size: number | null;
}): Promise<string> {
  return conArchivo(docsFile(input.userId), async () => {
  const filas = await leerFilas(docsFile(input.userId), DOCUMENTO_COLS);
  const id = cryptoId();
  filas.push({
    id,
    operation_id: input.operationId,
    user_id: input.userId,
    doc_type: input.docType,
    file_name: input.fileName,
    stored_name: input.storedName,
    mime_type: input.mimeType,
    size: input.size != null ? String(input.size) : null,
    created_at: nowIso(),
    extraccion_ia: null,
  });
  await escribirFilas(docsFile(input.userId), DOCUMENTO_COLS, filas);
  return id;
  });
}

function aEventoRow(f: Fila): EventoRow {
  return {
    id: f.id ?? "",
    operation_id: f.operation_id ?? "",
    user_id: f.user_id ?? "",
    tipo: (f.tipo ?? "nota") as EventoTipo,
    titulo: f.titulo ?? "",
    detalle: f.detalle ?? null,
    autor: f.autor ?? null,
    interno: f.interno === "1",
    created_at: f.created_at ?? "",
  };
}

/** Registra un evento en el seguimiento (timeline) de la operación. */
export async function addEvento(input: {
  operationId: string;
  userId: string;
  tipo: EventoTipo;
  titulo: string;
  detalle?: string | null;
  autor?: string | null;
  interno?: boolean;
}): Promise<EventoRow> {
  return conArchivo(eventosFile(input.userId), async () => {
  const filas = await leerFilas(eventosFile(input.userId), EVENTO_COLS);
  const fila: Fila = {
    id: cryptoId(),
    operation_id: input.operationId,
    user_id: input.userId,
    tipo: input.tipo,
    titulo: input.titulo,
    detalle: input.detalle ?? null,
    autor: input.autor ?? null,
    interno: input.interno ? "1" : "0",
    created_at: nowIso(),
  };
  filas.push(fila);
  await escribirFilas(eventosFile(input.userId), EVENTO_COLS, filas);
  return aEventoRow(fila);
  });
}

/** Eventos de una operación, del más nuevo al más viejo. */
export async function getEventosByOperation(
  userId: string,
  operationId: string,
): Promise<EventoRow[]> {
  const filas = await leerFilas(eventosFile(userId), EVENTO_COLS);
  return filas
    .filter((e) => e.operation_id === operationId)
    .map(aEventoRow)
    .sort(porFechaDesc);
}

/** Actualiza los campos editables de una operación. Devuelve true si la encontró. */
export async function updateOperationCampos(
  userId: string,
  operationId: string,
  campos: Partial<Record<OpCampo, string | null>>,
): Promise<boolean> {
  return conArchivo(opsFile(userId), async () => {
  const filas = await leerFilas(opsFile(userId), OPERACION_COLS);
  const fila = filas.find((o) => o.id === operationId);
  if (!fila) return false;
  for (const c of OP_CAMPOS) {
    if (c in campos) fila[c] = campos[c] ?? null;
  }
  await escribirFilas(opsFile(userId), OPERACION_COLS, filas);
  return true;
  });
}

/* ───────────── Hallazgos automáticos de la IA por documento ───────────── */

export type HallazgoNivel = "ok" | "warn" | "error";
export type HallazgoDocItem = {
  nivel: HallazgoNivel;
  texto: string;
  /** Artículo del marco normativo (p. ej. «ROM · Art. 26»). Obligatorio en warn/error. */
  ref?: string;
  /**
   * Requisito pendiente: códigos de documento que, al estar presentes y ser
   * válidos (sin error), RESUELVEN este hallazgo y lo hacen desaparecer solo.
   * P. ej. el aviso de transbordo del BL lleva ["declaracion_transbordo"].
   */
  requiereDoc?: string[];
};

/** Hallazgos del análisis automático de UN documento (al subirlo). */
export type HallazgoDocEntry = {
  /** Etiqueta legible del documento (p. ej. "BL marítimo (borrador)"). */
  doc: string;
  /** Etapa del workflow donde corresponde mostrar el hallazgo. */
  etapa: string;
  /** Resumen breve de qué es el documento y lo principal que encontró. */
  resumen: string;
  /** ISO del momento del análisis. */
  at: string;
  hallazgos: HallazgoDocItem[];
};

/** Mapa de hallazgos por tipo de documento (clave = DocType). */
export type HallazgosIA = Record<string, HallazgoDocEntry>;

/** Parsea el JSON de hallazgos_ia de una operación; {} si está vacío o roto. */
export function parseHallazgosIA(raw: string | null | undefined): HallazgosIA {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? (o as HallazgosIA) : {};
  } catch {
    return {};
  }
}

/**
 * Guarda (REEMPLAZANDO) los hallazgos automáticos de la IA para un tipo de
 * documento. La clave es el docType: subir una versión nueva del mismo tipo
 * pisa lo anterior. Si no hay hallazgos, igual se persiste la entrada (vacía)
 * para limpiar lo viejo de ese documento. Devuelve true si encontró la op.
 */
export async function setHallazgosDocumento(
  ownerId: string,
  operationId: string,
  docType: string,
  entry: HallazgoDocEntry,
): Promise<boolean> {
  return conArchivo(opsFile(ownerId), async () => {
  const filas = await leerFilas(opsFile(ownerId), OPERACION_COLS);
  const fila = filas.find((o) => o.id === operationId);
  if (!fila) return false;
  const mapa = parseHallazgosIA(fila.hallazgos_ia);
  mapa[docType] = entry;
  fila.hallazgos_ia = JSON.stringify(mapa);
  await escribirFilas(opsFile(ownerId), OPERACION_COLS, filas);
  return true;
  });
}

/** Borra los hallazgos automáticos de un tipo de documento (p. ej. al eliminar el único archivo de ese tipo). */
export async function removeHallazgosDocumento(
  ownerId: string,
  operationId: string,
  docType: string,
): Promise<boolean> {
  return conArchivo(opsFile(ownerId), async () => {
  const filas = await leerFilas(opsFile(ownerId), OPERACION_COLS);
  const fila = filas.find((o) => o.id === operationId);
  if (!fila) return false;
  const mapa = parseHallazgosIA(fila.hallazgos_ia);
  if (!(docType in mapa)) return false;
  delete mapa[docType];
  fila.hallazgos_ia = JSON.stringify(mapa);
  await escribirFilas(opsFile(ownerId), OPERACION_COLS, filas);
  return true;
  });
}

/** Parsea el JSON de extraccion_ia de un documento; null si está vacío o roto. */
export function parseExtraccionDoc(
  raw: string | null | undefined,
): ExtraccionDocCache | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as ExtraccionDocCache;
    if (!o || typeof o !== "object" || !o.datos) return null;
    return o;
  } catch {
    return null;
  }
}

/** La caché sigue vigente si el archivo almacenado no cambió. */
export function extraccionDocVigente(
  doc: Pick<DocumentRow, "stored_name" | "size">,
  cache: ExtraccionDocCache | null,
): boolean {
  if (!cache) return false;
  return cache.stored_name === doc.stored_name && cache.size === doc.size;
}

export type PayloadExtraccionDocumento =
  | unknown
  | {
      datos: unknown;
      lectura_bruta?: unknown;
      vacios_interpretacion?: unknown;
      tipo?: string;
      resumen?: string;
    };

/**
 * Persiste la extracción de UN documento. Se invalida si cambia stored_name o size.
 */
export async function setDocumentExtraccion(
  userId: string,
  documentId: string,
  storedName: string,
  size: number | null,
  payload: PayloadExtraccionDocumento,
): Promise<boolean> {
  return conArchivo(docsFile(userId), async () => {
  const filas = await leerFilas(docsFile(userId), DOCUMENTO_COLS);
  const fila = filas.find((d) => d.id === documentId);
  if (!fila) return false;

  const normalizado =
    payload != null &&
    typeof payload === "object" &&
    "datos" in payload &&
    (payload as { datos?: unknown }).datos !== undefined
      ? (payload as {
          datos: unknown;
          lectura_bruta?: unknown;
          vacios_interpretacion?: unknown;
          tipo?: string;
          resumen?: string;
        })
      : { datos: payload };

  const entry: ExtraccionDocCache = {
    at: nowIso(),
    stored_name: storedName,
    size,
    datos: normalizado.datos,
    ...(normalizado.lectura_bruta != null
      ? { lectura_bruta: normalizado.lectura_bruta }
      : {}),
    ...(normalizado.vacios_interpretacion != null
      ? { vacios_interpretacion: normalizado.vacios_interpretacion }
      : {}),
    ...(normalizado.tipo ? { tipo: normalizado.tipo } : {}),
    ...(normalizado.resumen ? { resumen: normalizado.resumen } : {}),
  };
  fila.extraccion_ia = JSON.stringify(entry);
  await escribirFilas(docsFile(userId), DOCUMENTO_COLS, filas);
  return true;
  });
}

/** Entrada de validación persistida por etapa. `resultado` es un DocumentacionIA
 * serializado (se tipa laxo acá para no acoplar data.ts al módulo de IA). */
export type ValidacionIAEntry = { at: string; resultado: unknown };
export type ValidacionIA = Record<string, ValidacionIAEntry>;

/** Parsea el JSON de validacion_ia de una operación; {} si está vacío o roto. */
export function parseValidacionIA(raw: string | null | undefined): ValidacionIA {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? (o as ValidacionIA) : {};
  } catch {
    return {};
  }
}

/**
 * Guarda (REEMPLAZANDO) el resultado de la validación de la IA para una etapa.
 * Se llama al validar un paso (manual o automáticamente al subir un documento),
 * para que el detalle lo muestre sin tener que apretar el botón. Devuelve true
 * si encontró la operación.
 */
export async function setValidacionEtapa(
  ownerId: string,
  operationId: string,
  etapa: string,
  resultado: unknown,
): Promise<boolean> {
  return conArchivo(opsFile(ownerId), async () => {
  const filas = await leerFilas(opsFile(ownerId), OPERACION_COLS);
  const fila = filas.find((o) => o.id === operationId);
  if (!fila) return false;
  const mapa = parseValidacionIA(fila.validacion_ia);
  mapa[etapa] = { at: new Date().toISOString(), resultado };
  fila.validacion_ia = JSON.stringify(mapa);
  await escribirFilas(opsFile(ownerId), OPERACION_COLS, filas);
  return true;
  });
}

/** Quita la validación persistida de una etapa (p. ej. tras borrar un documento relevante). */
export async function clearValidacionEtapa(
  ownerId: string,
  operationId: string,
  etapa: string,
): Promise<boolean> {
  return conArchivo(opsFile(ownerId), async () => {
  const filas = await leerFilas(opsFile(ownerId), OPERACION_COLS);
  const fila = filas.find((o) => o.id === operationId);
  if (!fila) return false;
  const mapa = parseValidacionIA(fila.validacion_ia);
  if (!(etapa in mapa)) return false;
  delete mapa[etapa];
  fila.validacion_ia = JSON.stringify(mapa);
  await escribirFilas(opsFile(ownerId), OPERACION_COLS, filas);
  return true;
  });
}

export type ResolucionConflictoPersistida = {
  valor: string | null;
  naturaleza: "ocr" | "real" | "ilegible";
  motivo: string;
  candidatos: string[];
  at: string;
};

export function fingerprintConflicto(
  id: string,
  candidatos: string[],
): string {
  const cands = [...candidatos].map((c) => c.trim()).sort().join("|");
  return `${id}:${cands}`;
}

export function parseResolucionesConflictos(
  raw: string | null | undefined,
): Record<string, ResolucionConflictoPersistida> {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === "object"
      ? (o as Record<string, ResolucionConflictoPersistida>)
      : {};
  } catch {
    return {};
  }
}

export async function mergeResolucionesConflictos(
  ownerId: string,
  operationId: string,
  nuevas: Record<string, ResolucionConflictoPersistida>,
): Promise<boolean> {
  return conArchivo(opsFile(ownerId), async () => {
  if (Object.keys(nuevas).length === 0) return false;
  const filas = await leerFilas(opsFile(ownerId), OPERACION_COLS);
  const fila = filas.find((o) => o.id === operationId);
  if (!fila) return false;
  const prev = parseResolucionesConflictos(fila.resoluciones_conflictos);
  fila.resoluciones_conflictos = JSON.stringify({ ...prev, ...nuevas });
  await escribirFilas(opsFile(ownerId), OPERACION_COLS, filas);
  return true;
  });
}

export async function clearResolucionesConflictos(
  ownerId: string,
  operationId: string,
): Promise<boolean> {
  return conArchivo(opsFile(ownerId), async () => {
  const filas = await leerFilas(opsFile(ownerId), OPERACION_COLS);
  const fila = filas.find((o) => o.id === operationId);
  if (!fila || !fila.resoluciones_conflictos) return false;
  fila.resoluciones_conflictos = null;
  await escribirFilas(opsFile(ownerId), OPERACION_COLS, filas);
  return true;
  });
}

export type ReconciliacionMeta = { fingerprint: string; at: string };

export function parseReconciliacionMeta(
  raw: string | null | undefined,
): ReconciliacionMeta | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as ReconciliacionMeta;
    if (o?.fingerprint && o?.at) return o;
    return null;
  } catch {
    return null;
  }
}

export async function setReconciliacionMeta(
  ownerId: string,
  operationId: string,
  fingerprint: string,
): Promise<boolean> {
  return conArchivo(opsFile(ownerId), async () => {
  const filas = await leerFilas(opsFile(ownerId), OPERACION_COLS);
  const fila = filas.find((o) => o.id === operationId);
  if (!fila) return false;
  fila.reconciliacion_meta = JSON.stringify({
    fingerprint,
    at: new Date().toISOString(),
  });
  await escribirFilas(opsFile(ownerId), OPERACION_COLS, filas);
  return true;
  });
}

export async function clearReconciliacionMeta(
  ownerId: string,
  operationId: string,
): Promise<boolean> {
  return conArchivo(opsFile(ownerId), async () => {
  const filas = await leerFilas(opsFile(ownerId), OPERACION_COLS);
  const fila = filas.find((o) => o.id === operationId);
  if (!fila || !fila.reconciliacion_meta) return false;
  fila.reconciliacion_meta = null;
  await escribirFilas(opsFile(ownerId), OPERACION_COLS, filas);
  return true;
  });
}

/**
 * Resuelve (borra) los hallazgos pendientes que ya quedaron cubiertos por otro
 * documento. Un hallazgo con `requiereDoc` desaparece cuando alguno de esos
 * tipos está presente en la operación y es VÁLIDO (su propio análisis no tiene
 * ningún hallazgo nivel "error"). Así, p. ej., el aviso de transbordo del BL se
 * borra solo al subir la declaración de transbordo legal. Funciona en cualquier
 * orden de carga (se re-evalúa en cada subida). Devuelve true si cambió algo.
 */
export async function resolverHallazgosIA(
  ownerId: string,
  operationId: string,
  docTypesPresentes: string[],
  opts?: {
    /** Si devuelve false, el documento no satisface el requisito aunque no tenga error. */
    esValido?: (docType: string) => boolean;
  },
): Promise<boolean> {
  return conArchivo(opsFile(ownerId), async () => {
  const filas = await leerFilas(opsFile(ownerId), OPERACION_COLS);
  const fila = filas.find((o) => o.id === operationId);
  if (!fila) return false;
  const mapa = parseHallazgosIA(fila.hallazgos_ia);

  // Tipos presentes cuyo análisis es legalmente válido satisfacen requisitos
  // pendientes de otros documentos (requiere_doc).
  const satisfactorios = new Set<string>();
  for (const dt of docTypesPresentes) {
    if (opts?.esValido && !opts.esValido(dt)) continue;
    const e = mapa[dt];
    const tieneError = (e?.hallazgos ?? []).some((h) => h.nivel === "error");
    if (!tieneError) satisfactorios.add(dt);
  }

  let cambio = false;
  for (const e of Object.values(mapa)) {
    if (!Array.isArray(e.hallazgos)) continue;
    const antes = e.hallazgos.length;
    e.hallazgos = e.hallazgos.filter(
      (h) => !(h.requiereDoc ?? []).some((r) => satisfactorios.has(r)),
    );
    if (e.hallazgos.length !== antes) cambio = true;
  }

  if (cambio) {
    fila.hallazgos_ia = JSON.stringify(mapa);
    await escribirFilas(opsFile(ownerId), OPERACION_COLS, filas);
  }
  return cambio;
  });
}

/** Mueve la operación a una etapa interna. Devuelve la fila actualizada o null. */
export async function updateOperationEtapa(
  ownerId: string,
  operationId: string,
  etapa: string,
): Promise<OperationRow | null> {
  return conArchivo(opsFile(ownerId), async () => {
  const filas = await leerFilas(opsFile(ownerId), OPERACION_COLS);
  const fila = filas.find((o) => o.id === operationId);
  if (!fila) return null;
  fila.etapa = normalizarEtapa(etapa);
  // Mantenemos el estado del cliente sincronizado con la etapa interna.
  fila.estado = estadoClienteDeEtapa(etapa);
  await escribirFilas(opsFile(ownerId), OPERACION_COLS, filas);
  return aOperationRow(fila, 0);
  });
}

/** Reemplaza el mapa completo de validacion_ia (o null si vacío). */
export async function setValidacionIA(
  ownerId: string,
  operationId: string,
  mapa: ValidacionIA,
): Promise<boolean> {
  return conArchivo(opsFile(ownerId), async () => {
  const filas = await leerFilas(opsFile(ownerId), OPERACION_COLS);
  const fila = filas.find((o) => o.id === operationId);
  if (!fila) return false;
  const keys = Object.keys(mapa);
  fila.validacion_ia = keys.length > 0 ? JSON.stringify(mapa) : null;
  await escribirFilas(opsFile(ownerId), OPERACION_COLS, filas);
  return true;
  });
}

/** Marca o desmarca una sub-tarea del checklist. La clave es "<etapa>.<sub>". */
export async function setChecklistItem(
  ownerId: string,
  operationId: string,
  clave: string,
  done: boolean,
  autor: string | null,
): Promise<boolean> {
  return conArchivo(opsFile(ownerId), async () => {
  const filas = await leerFilas(opsFile(ownerId), OPERACION_COLS);
  const fila = filas.find((o) => o.id === operationId);
  if (!fila) return false;
  const checklist = parseChecklist(fila.checklist);
  if (done) checklist[clave] = { at: nowIso(), by: autor };
  else delete checklist[clave];
  fila.checklist = JSON.stringify(checklist);
  await escribirFilas(opsFile(ownerId), OPERACION_COLS, filas);
  return true;
  });
}

/** Cambia el estado de una operación. Devuelve true si la encontró. */
export async function updateOperationEstado(
  userId: string,
  operationId: string,
  estado: string,
): Promise<boolean> {
  return conArchivo(opsFile(userId), async () => {
  const filas = await leerFilas(opsFile(userId), OPERACION_COLS);
  const fila = filas.find((o) => o.id === operationId);
  if (!fila) return false;
  fila.estado = estado;
  await escribirFilas(opsFile(userId), OPERACION_COLS, filas);
  return true;
  });
}

/** Cambia el tipo (categoría) de un documento ya cargado. */
export async function updateDocumentTipo(
  userId: string,
  documentId: string,
  docType: DocType,
): Promise<DocumentRow | null> {
  return conArchivo(docsFile(userId), async () => {
  const filas = await leerFilas(docsFile(userId), DOCUMENTO_COLS);
  const fila = filas.find((d) => d.id === documentId);
  if (!fila) return null;
  fila.doc_type = docType;
  await escribirFilas(docsFile(userId), DOCUMENTO_COLS, filas);
  return aDocumentRow(fila);
  });
}

/** Elimina un documento (metadata + extraccion_ia en parquet) y devuelve la fila eliminada. */
export async function removeDocument(
  userId: string,
  documentId: string,
): Promise<DocumentRow | null> {
  return conArchivo(docsFile(userId), async () => {
  const filas = await leerFilas(docsFile(userId), DOCUMENTO_COLS);
  const fila = filas.find((d) => d.id === documentId);
  if (!fila) return null;
  const restantes = filas.filter((d) => d.id !== documentId);
  await escribirFilas(docsFile(userId), DOCUMENTO_COLS, restantes);
  return aDocumentRow(fila);
  });
}

/**
 * Elimina una operación completa (y la metadata de sus documentos).
 * Devuelve los documentos que tenía, para poder borrar también los archivos.
 */
export async function removeOperation(
  userId: string,
  operationId: string,
): Promise<DocumentRow[]> {
  return conArchivo(opsFile(userId), async () => {
  const [ops, docs, eventos] = await Promise.all([
    leerFilas(opsFile(userId), OPERACION_COLS),
    leerFilas(docsFile(userId), DOCUMENTO_COLS),
    leerFilas(eventosFile(userId), EVENTO_COLS),
  ]);
  const opsRestantes = ops.filter((o) => o.id !== operationId);
  const docsDeOp = docs.filter((d) => d.operation_id === operationId);
  const docsRestantes = docs.filter((d) => d.operation_id !== operationId);
  const eventosRestantes = eventos.filter((e) => e.operation_id !== operationId);
  await Promise.all([
    escribirFilas(opsFile(userId), OPERACION_COLS, opsRestantes),
    escribirFilas(docsFile(userId), DOCUMENTO_COLS, docsRestantes),
    escribirFilas(eventosFile(userId), EVENTO_COLS, eventosRestantes),
  ]);
  return docsDeOp.map(aDocumentRow);
  });
}

export async function getOperationsByUser(
  userId: string,
): Promise<OperationRow[]> {
  const [ops, docs] = await Promise.all([
    leerFilas(opsFile(userId), OPERACION_COLS),
    leerFilas(docsFile(userId), DOCUMENTO_COLS),
  ]);
  const rows: OperationRow[] = [];
  for (const o of ops) {
    const row = aOperationRow(o, docs.filter((d) => d.operation_id === o.id).length);
    const titulo = await asegurarTituloOperacion(userId, row.id, row.titulo);
    if (titulo) row.titulo = titulo;
    rows.push(row);
  }
  return rows.sort(porFechaDesc);
}

export async function getAllOperations(): Promise<OperationWithClient[]> {
  const all: OperationWithClient[] = [];
  for (const c of clientesBasicos()) {
    const [ops, docs] = await Promise.all([
      leerFilas(opsFile(c.id), OPERACION_COLS),
      leerFilas(docsFile(c.id), DOCUMENTO_COLS),
    ]);
    for (const o of ops) {
      const row = aOperationRow(
        o,
        docs.filter((d) => d.operation_id === o.id).length,
      );
      const titulo = await asegurarTituloOperacion(c.id, row.id, row.titulo);
      if (titulo) row.titulo = titulo;
      all.push({
        ...row,
        company_name: c.company_name,
        client_email: c.email,
        client_cuit: c.cuit,
        client_iva_condition: c.iva_condition,
        client_cert_exencion: c.cert_exencion,
        client_carta_garantia: c.carta_garantia,
      });
    }
  }
  return all.sort(porFechaDesc);
}

export async function getOperationById(
  id: string,
): Promise<OperationWithClient | null> {
  for (const c of clientesBasicos()) {
    const ops = await leerFilas(opsFile(c.id), OPERACION_COLS);
    const o = ops.find((x) => x.id === id);
    if (!o) continue;
    const docs = await leerFilas(docsFile(c.id), DOCUMENTO_COLS);
    const row = aOperationRow(o, docs.filter((d) => d.operation_id === id).length);
    const titulo = await asegurarTituloOperacion(c.id, row.id, row.titulo);
    if (titulo) row.titulo = titulo;
    return {
      ...row,
      company_name: c.company_name,
      client_email: c.email,
      client_cuit: c.cuit,
      client_iva_condition: c.iva_condition,
      client_cert_exencion: c.cert_exencion,
      client_carta_garantia: c.carta_garantia,
    };
  }
  return null;
}

export async function getDocumentsByOperation(
  operationId: string,
  userId: string,
): Promise<DocumentRow[]> {
  const docs = await leerFilas(docsFile(userId), DOCUMENTO_COLS);
  return docs
    .filter((d) => d.operation_id === operationId)
    .map(aDocumentRow)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

export async function getDocumentById(id: string): Promise<DocumentRow | null> {
  for (const c of clientesBasicos()) {
    const docs = await leerFilas(docsFile(c.id), DOCUMENTO_COLS);
    const d = docs.find((x) => x.id === id);
    if (d) return aDocumentRow(d);
  }
  return null;
}

/* ───────────────── «Visto» por el estudio (novedades) ─────────────────
 * Cada vez que el equipo abre una operación se registra el momento. En la
 * lista mostramos un aviso cuando hay documentos/mensajes más nuevos que esa
 * última visita (algo que el estudio todavía no miró).
 */

/** Marca la operación como vista por el estudio en este momento. */
export function marcarOperacionVistaEstudio(operationId: string): void {
  getDb()
    .prepare(
      `INSERT INTO operation_seen (operation_id, seen_at)
       VALUES (?, ?)
       ON CONFLICT(operation_id) DO UPDATE SET seen_at = excluded.seen_at`,
    )
    .run(operationId, nowIso());
}

/** Último «visto» del estudio por operación (ISO), para calcular novedades. */
export function vistasEstudioTodas(): Record<string, string> {
  const filas = getDb()
    .prepare(`SELECT operation_id AS id, seen_at FROM operation_seen`)
    .all() as { id: string; seen_at: string }[];
  const out: Record<string, string> = {};
  for (const f of filas) out[f.id] = f.seen_at;
  return out;
}
