/**
 * Suscripción del estudio.
 *
 * Cada estudio arranca con una prueba gratis; vencida, hay que contratar un
 * plan para seguir entrando al panel. El estado NO se guarda: se deriva de
 * `trial_hasta` y `suscripcion_hasta` contra la fecha actual, porque un estado
 * guardado se desactualiza solo con que pase el tiempo, sin que nadie toque la
 * fila. Las subcuentas no tienen suscripción propia: heredan la de su estudio.
 */

/** Días de prueba al registrarse. */
export const DIAS_TRIAL = 5;

export type ClavePlan = "inicial" | "estudio" | "full";

export type Plan = {
  clave: ClavePlan;
  nombre: string;
  precio: number;
  resumen: string;
  incluye: string[];
  /** Tope de clientes en cartera; null es sin tope. */
  topeClientes: number | null;
  /** Tope de cuentas del estudio (el dueño cuenta como una). */
  topeCuentas: number | null;
  destacado?: boolean;
};

/**
 * Precios en pesos, por mes. Provisorios: los fijó el dueño del producto para
 * arrancar y se ajustan sin tocar el resto del sistema.
 */
export const PLANES: Plan[] = [
  {
    clave: "inicial",
    nombre: "Inicial",
    precio: 10000,
    resumen: "Para empezar a ordenar tus despachos.",
    incluye: [
      "Hasta 10 clientes en cartera",
      "Operaciones y documentación",
      "Calculadora y nomenclador",
      "Portal y chat para tus clientes",
    ],
    topeClientes: 10,
    topeCuentas: 1,
  },
  {
    clave: "estudio",
    nombre: "Estudio",
    precio: 50000,
    resumen: "Para un estudio con empleados y cartera activa.",
    incluye: [
      "Hasta 50 clientes en cartera",
      "Hasta 5 cuentas del equipo",
      "Todo lo del plan Inicial",
      "Seguimiento de buques",
    ],
    topeClientes: 50,
    topeCuentas: 5,
    destacado: true,
  },
  {
    clave: "full",
    nombre: "Full",
    precio: 100000,
    resumen: "Sin topes, para operar a escala.",
    incluye: [
      "Clientes sin límite",
      "Cuentas del equipo sin límite",
      "Todo lo del plan Estudio",
      "Soporte prioritario",
    ],
    topeClientes: null,
    topeCuentas: null,
  },
];

export function planPorClave(clave: string | null | undefined): Plan | null {
  return PLANES.find((p) => p.clave === clave) ?? null;
}

export type EstadoSuscripcion =
  | { estado: "trial"; diasRestantes: number; venceEl: Date; plan: null }
  | { estado: "activa"; diasRestantes: number; venceEl: Date; plan: Plan | null }
  | { estado: "vencida"; diasRestantes: 0; venceEl: Date | null; plan: Plan | null };

/** Cuenta raíz de estudio, con lo que hace falta para resolver su suscripción. */
export type CuentaSuscripcion = {
  trial_hasta?: string | null;
  plan?: string | null;
  suscripcion_hasta?: string | null;
};

/** SQLite guarda 'YYYY-MM-DD HH:MM:SS' en UTC, sin zona explícita. */
function parseFecha(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Días enteros que faltan, redondeando hacia arriba: hoy mismo ya cuenta como 1. */
function diasHasta(fin: Date, ahora: Date): number {
  return Math.max(0, Math.ceil((fin.getTime() - ahora.getTime()) / 86_400_000));
}

export function estadoSuscripcion(
  cuenta: CuentaSuscripcion,
  ahora: Date = new Date(),
): EstadoSuscripcion {
  const plan = planPorClave(cuenta.plan);
  const pagaHasta = parseFecha(cuenta.suscripcion_hasta);

  // Una suscripción paga vigente manda sobre el trial: si contrató antes de que
  // se le venciera la prueba, no tiene por qué perder los días que le quedaban.
  if (pagaHasta && pagaHasta > ahora) {
    return {
      estado: "activa",
      diasRestantes: diasHasta(pagaHasta, ahora),
      venceEl: pagaHasta,
      plan,
    };
  }

  const trialHasta = parseFecha(cuenta.trial_hasta);
  if (trialHasta && trialHasta > ahora) {
    return {
      estado: "trial",
      diasRestantes: diasHasta(trialHasta, ahora),
      venceEl: trialHasta,
      plan: null,
    };
  }

  return { estado: "vencida", diasRestantes: 0, venceEl: pagaHasta ?? trialHasta, plan };
}

/** ¿Puede usar el panel? Solo se corta cuando venció todo. */
export function tieneAcceso(cuenta: CuentaSuscripcion, ahora: Date = new Date()): boolean {
  return estadoSuscripcion(cuenta, ahora).estado !== "vencida";
}

/**
 * Condiciones frente al IVA admitidas para el receptor de la factura.
 *
 * Desde el 1/7/2025 este dato es obligatorio en todo comprobante electrónico
 * (art. 2, RG 5616/2024): sin él ARCA rechaza la factura. Se listan las que
 * puede tener un estudio de despachantes; el resto del padrón (exterior,
 * Ley 19.640) no aplica a este producto.
 */
export const CONDICIONES_IVA = [
  "Responsable Inscripto",
  "Monotributo",
  "Exento",
] as const;

export type CondicionIva = (typeof CONDICIONES_IVA)[number];

export type DatosFacturacion = {
  cuit: string;
  condicionIva: string;
  domicilio: string;
};

/** CUIT: 11 dígitos. Un estudio siempre tiene CUIT, nunca CUIL: factura honorarios. */
export function cuitValido(cuit: string): boolean {
  return /^\d{11}$/.test((cuit ?? "").replace(/\D/g, ""));
}

/** Qué falta para poder emitirle una factura. Vacío = está listo para cobrar. */
export function faltantesFacturacion(datos: Partial<DatosFacturacion>): string[] {
  const faltan: string[] = [];
  if (!cuitValido(datos.cuit ?? "")) faltan.push("CUIT");
  if (!CONDICIONES_IVA.includes((datos.condicionIva ?? "") as CondicionIva)) {
    faltan.push("condición frente al IVA");
  }
  if (!(datos.domicilio ?? "").trim()) faltan.push("domicilio fiscal");
  return faltan;
}

export function precioFormateado(precio: number): string {
  return precio.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}
