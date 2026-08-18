import "server-only";
import { getDb } from "./db";
import { estadoSuscripcion, planPorClave, precioFormateado, PLANES } from "./suscripcion";

/**
 * Datos reales de la cuenta que consulta, para que el bot responda con hechos
 * en vez de generalidades.
 *
 * Es lo que separa "fijate en la sección de suscripción" de "te quedan 3 días
 * de prueba y tenés 12 clientes cargados". Se arma con una sola consulta: el
 * bot contesta en el mismo turno del mensaje, así que no puede pagar varias
 * idas y vueltas a la base.
 */

export type ContextoCuenta = {
  nombre: string;
  email: string | null;
  esEquipo: boolean;
  esDuenoEstudio: boolean;
  suscripcion: string;
  clientes: number;
  operaciones: number;
  subcuentas: number;
  facturacionCompleta: boolean;
};

type FilaCuenta = {
  company_name: string | null;
  contact_name: string | null;
  email: string | null;
  role: string;
  despachante_id: string | null;
  trial_hasta: string | null;
  plan: string | null;
  suscripcion_hasta: string | null;
  cuit: string | null;
  iva_condition: string | null;
  address: string | null;
};

export function contextoDeCuenta(cuentaId: string): ContextoCuenta | null {
  const db = getDb();
  const u = db
    .prepare(
      `SELECT company_name, contact_name, email, role, despachante_id,
              trial_hasta, plan, suscripcion_hasta, cuit, iva_condition, address
       FROM users WHERE id = ?`,
    )
    .get(cuentaId) as FilaCuenta | undefined;
  if (!u) return null;

  const esEquipo = u.role === "admin" || u.role === "operador";
  const estudioId = u.despachante_id ?? cuentaId;

  // La suscripción vive en la cuenta raíz del estudio; una subcuenta hereda la
  // de su dueño, así que se resuelve sobre el estudio y no sobre quien pregunta.
  const raiz = esEquipo
    ? ((db
        .prepare("SELECT trial_hasta, plan, suscripcion_hasta FROM users WHERE id = ?")
        .get(estudioId) as Pick<
        FilaCuenta,
        "trial_hasta" | "plan" | "suscripcion_hasta"
      > | undefined) ?? u)
    : u;

  const estado = estadoSuscripcion(raiz);
  const plan = planPorClave(raiz.plan);
  const suscripcion =
    estado.estado === "activa"
      ? `plan ${plan?.nombre ?? "activo"}, vence en ${estado.diasRestantes} día(s)`
      : estado.estado === "trial"
        ? `prueba gratis, le quedan ${estado.diasRestantes} día(s)`
        : "vencida, el panel está bloqueado hasta que contrate un plan";

  const clientes = esEquipo
    ? (
        db
          .prepare(
            "SELECT COUNT(*) AS c FROM users WHERE role = 'client' AND despachante_id = ?",
          )
          .get(estudioId) as { c: number }
      ).c
    : 0;

  const subcuentas = esEquipo
    ? (
        db
          .prepare(
            "SELECT COUNT(*) AS c FROM users WHERE role = 'operador' AND despachante_id = ?",
          )
          .get(estudioId) as { c: number }
      ).c
    : 0;

  return {
    nombre: u.company_name?.trim() || u.contact_name?.trim() || u.email || "Sin nombre",
    email: u.email,
    esEquipo,
    esDuenoEstudio: esEquipo && !u.despachante_id,
    suscripcion,
    clientes,
    // Las operaciones viven en el parquet de cada cliente; contarlas exigiría
    // abrir todos esos archivos en el camino crítico de una respuesta de chat.
    // El bot pregunta o deriva si hace falta ese dato.
    operaciones: -1,
    subcuentas,
    facturacionCompleta: Boolean(u.cuit && u.iva_condition && u.address),
  };
}

/**
 * Mapa del producto para el bot.
 *
 * Se escribe acá y no en el prompt del modelo para que cambie junto con el
 * producto: cuando se agrega una sección, se agrega un renglón.
 */
export const MAPA_PORTAL = `
Secciones del panel del despachante (menú ☰, arriba a la izquierda):
- Noticias: novedades del rubro.
- Clientes: la cartera propia del estudio. Cada estudio ve SOLO sus clientes.
  Desde acá se hace TODO lo del cliente: darlo de alta, editar sus datos, y con
  el botón de la llave darle acceso al portal (fijar su email y contraseña),
  cambiárselos después o quitarle el acceso.
- Operaciones: los despachos, con su etapa, documentación y checklist.
- Buques: seguimiento de arribos por puerto.
- Calculadora: estima costos de importación (tributos, percepciones, flete, seguro).
- Nomenclador: busca la posición NCM de un producto, con IA.

Menú de la cuenta (ícono redondo, arriba a la derecha):
- Mi cuenta: cambiar usuario y contraseña, tema claro/oscuro, datos del estudio
  para la factura, y las cuentas del equipo (empleados del estudio).
- Plan y suscripción: ver planes y contratar.
- Soporte: este chat.

Portal del cliente importador (no del despachante):
- Mis operaciones: ve cómo va cada despacho suyo, en tiempo real.
- Calculadora.
Y NADA MÁS. El cliente no tiene Nomenclador, ni Buques, ni Clientes, ni
Operaciones de otros, ni Soporte con nosotros.
El cliente NO tiene chat en el portal: con su despachante se comunica por
WhatsApp o mail, por fuera del sistema.

Cosas que conviene saber:
- El registro público es solo para despachantes. Los importadores NO se registran
  solos: los da de alta su despachante desde Clientes.
- Cada estudio tiene cartera propia y aislada: nadie ve los clientes de otro.
- La prueba gratis dura 5 días. Vencida, el panel se bloquea y hay que elegir plan.
  Los datos quedan intactos y vuelven al activar.
- Para contratar hace falta CUIT, condición frente al IVA y domicilio fiscal:
  sin la condición de IVA, ARCA rechaza la factura.
- Las cuentas de empleado comparten la cartera del estudio.
`.trim();

/** Los planes, tal como los ve el usuario. */
export function textoPlanes(): string {
  return PLANES.map(
    (p) => `- ${p.nombre}: ${precioFormateado(p.precio)}/mes. ${p.resumen} ${p.incluye.join("; ")}.`,
  ).join("\n");
}
