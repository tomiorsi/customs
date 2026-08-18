/**
 * Destinaciones aduaneras.
 *
 * Una destinación es la declaración de qué destino se le va a dar a la
 * mercadería, y es EL trámite: cuando se «oficializa un despacho» lo que se
 * oficializa es una destinación. Clasificar, valorar y documentar existen para
 * poder presentarla.
 *
 * El Código Aduanero (ley 22.415) las divide en dos familias:
 *
 * - DEFINITIVAS: la mercadería se queda (o se va) para siempre. Paga tributos.
 * - SUSPENSIVAS: entra o sale por un plazo, con una finalidad, y tiene que
 *   volver. No paga tributos: los GARANTIZA.
 *
 * Esa diferencia es la que reordena el paso a paso. Una suspensiva agrega dos
 * etapas que en una operación a consumo no existen —la autorización previa del
 * régimen y la cancelación al final— y convierte la liquidación en constitución
 * de garantía. Y sobre todo agrega un plazo: dejar vencer una temporaria sin
 * reexportar ni convertir ejecuta la garantía. Es el error caro del régimen, y
 * por eso el vencimiento viaja en la destinación y no en una subtarea suelta.
 */

export type FamiliaDestinacion = "definitiva" | "suspensiva";

export type Destinacion = {
  id: string;
  /** Nombre corto, el que se elige en el formulario. */
  label: string;
  /** Importación o exportación: define el tronco del flujo. */
  flujo: "importacion" | "exportacion";
  familia: FamiliaDestinacion;
  /** Norma que la regula, para mostrarla al operador. */
  norma: string;
  /** Una línea que explica cuándo se usa. Se muestra al elegirla. */
  cuando: string;
  /**
   * Plazo del régimen. `null` cuando lo fija la autorización caso por caso —
   * no inventamos un número: se carga cuando la autorización llega.
   */
  plazo: { dias: number; desde: string } | null;
  /** Texto de la prórroga, si el régimen la admite. */
  prorroga?: string;
  /** Trámite de autorización previa, cuando el régimen lo exige. */
  autorizacion?: {
    label: string;
    /** Dónde se tramita (TAD, SICNEA/SITA, Secretaría de Industria…). */
    donde: string;
    subtareas: { id: string; label: string }[];
  };
  /** Cómo se cancela el régimen. Sin esto la destinación no cierra. */
  cancelacion?: {
    label: string;
    guia: string;
    subtareas: { id: string; label: string }[];
  };
};

/* ─────────────────────────── Importación ─────────────────────────── */

const IMPO: Destinacion[] = [
  {
    id: "impo_consumo",
    label: "Importación a consumo",
    flujo: "importacion",
    familia: "definitiva",
    norma: "Código Aduanero, arts. 233 y ss.",
    cuando:
      "La mercadería entra al país por tiempo indeterminado. Es la más común y paga todos los tributos.",
    plazo: null,
  },
  {
    id: "impo_temp_1330",
    label: "Importación temporaria — perfeccionamiento industrial",
    flujo: "importacion",
    familia: "suspensiva",
    norma: "Decreto 1330/2004",
    cuando:
      "Insumos que entran para transformarse y salir como un producto nuevo, que se exporta. No paga derechos: los garantiza.",
    plazo: { dias: 360, desde: "el libramiento" },
    prorroga:
      "Una única prórroga de hasta 360 días, y solo por catástrofe, guerra o fuerza mayor, con autorización expresa de la Secretaría de Industria y Comercio.",
    autorizacion: {
      label: "CTIT y autorización del régimen",
      donde: "CTIT por TAD (Secretaría de Industria y Comercio)",
      subtareas: [
        {
          id: "ctit",
          label:
            "CTIT obtenido (Certificado de Tipificación de Importación Temporaria) — es PREVIO, sin esto no se oficializa",
        },
        {
          id: "dictamen",
          label:
            "Dictamen técnico de la relación insumo-producto (ingeniero matriculado, INTI o universidad)",
        },
        {
          id: "ctit_vigencia",
          label: "Vigencia del CTIT verificada (el certificado dura hasta 10 años)",
        },
      ],
    },
    cancelacion: {
      label: "Cancelación del régimen",
      guia:
        "El régimen se cancela EXPORTANDO para consumo el producto resultante, dentro de los 360 días del libramiento. Controlá el plazo contra la fecha de libramiento, no contra la de oficialización. Si el plazo se vence sin exportar ni convertir a consumo, se ejecuta la garantía: es el error caro de este régimen. Si hubo transferencia a otro beneficiario, las garantías siguen siendo responsabilidad del importador original.",
      subtareas: [
        { id: "plazo_control", label: "Vencimiento de los 360 días controlado" },
        { id: "expo_cancelatoria", label: "Exportación a consumo del producto resultante oficializada" },
        { id: "insumo_producto", label: "Relación insumo-producto acreditada contra el CTIT" },
        { id: "garantia_liberada", label: "Garantía liberada" },
      ],
    },
  },
  {
    id: "impo_temp_1001",
    label: "Importación temporaria — bienes de capital y otros",
    flujo: "importacion",
    familia: "suspensiva",
    norma: "Decreto 1001/82, art. 31 (RG AFIP 4200/2018)",
    cuando:
      "Bienes de capital que el beneficiario NO es dueño y tiene que reexportar por contrato. También mercadería que entra a repararse o para ferias y muestras.",
    plazo: null,
    prorroga:
      "Se pide por SICNEA (Multinota Electrónica Aduanera en SITA), antes del vencimiento.",
    autorizacion: {
      label: "Autorización del régimen",
      donde: "TAD — «Importación Temporal de Bienes de Capital (Dec. 1001/82 art. 31)»",
      subtareas: [
        { id: "solicitud_tad", label: "Solicitud presentada por TAD (trámite gratuito)" },
        {
          id: "contrato",
          label:
            "Contrato de locación / comodato que acredita que el beneficiario no es propietario y debe reexportar (certificado o legalizado)",
        },
        { id: "informe_tecnico", label: "Informe técnico y especificaciones en español" },
        { id: "justificacion", label: "Justificación de la necesidad de la importación" },
        { id: "plazo_autorizado", label: "Plazo autorizado cargado en la operación" },
      ],
    },
    cancelacion: {
      label: "Cancelación del régimen",
      guia:
        "Se cancela REEXPORTANDO la mercadería antes del vencimiento, o convirtiéndola a importación a consumo (pagando los tributos) mientras el plazo siga vigente. Ojo: la reexportación a una zona franca nacional NO cancela una temporaria del art. 31. Las prórrogas se piden por SICNEA antes de que venza, y tenés 10 días hábiles para notificarte de lo que resuelva Aduana.",
      subtareas: [
        { id: "plazo_control", label: "Vencimiento del plazo autorizado controlado" },
        { id: "reexportacion", label: "Reexportación oficializada, o conversión a consumo" },
        { id: "garantia_liberada", label: "Garantía liberada" },
      ],
    },
  },
  {
    id: "impo_deposito",
    label: "Depósito de almacenamiento",
    flujo: "importacion",
    familia: "suspensiva",
    norma: "Código Aduanero, art. 285 y ss.",
    cuando:
      "La mercadería queda almacenada bajo control aduanero mientras se define qué destinación darle después.",
    plazo: { dias: 15, desde: "el registro de la destinación" },
    prorroga:
      "ARCA puede extender el plazo cuando la naturaleza de la mercadería o su modalidad de almacenamiento lo justifiquen.",
    cancelacion: {
      label: "Destinación posterior",
      guia:
        "El depósito es un puente, no un destino: hay que darle otra destinación antes del vencimiento. Al vencer el plazo la mercadería se dispone para VENTA (art. 419 CA). Controlá el vencimiento desde el día uno.",
      subtareas: [
        { id: "plazo_control", label: "Vencimiento del plazo controlado" },
        { id: "destinacion_posterior", label: "Destinación definitiva oficializada" },
      ],
    },
  },
  {
    id: "impo_transito",
    label: "Tránsito de importación",
    flujo: "importacion",
    familia: "suspensiva",
    norma: "Código Aduanero, arts. 296 y ss.",
    cuando:
      "La mercadería se mueve de una aduana a otra sin nacionalizar. Se garantiza la totalidad de los tributos, más antidumping si corresponde.",
    plazo: null,
    autorizacion: {
      label: "Registro del tránsito",
      donde: "SINTIA (MIC/DTA) para el tránsito terrestre internacional",
      subtareas: [
        { id: "mic_dta", label: "MIC/DTA registrado en SINTIA (lo registra el ATA)" },
        { id: "ruta_plazo", label: "Ruta y plazo declarados (campo 40) y fecha tentativa de llegada" },
        { id: "precinto", label: "Unidad pesada y precintada por Aduana" },
      ],
    },
    cancelacion: {
      label: "Arribo y cancelación del tránsito",
      guia:
        "El tránsito se cancela con el arribo a la aduana de destino dentro del plazo y la ruta declarados. Si no arriba, se ejecuta la garantía.",
      subtareas: [
        { id: "arribo_destino", label: "Arribo a la aduana de destino registrado" },
        { id: "precinto_intacto", label: "Precinto verificado sin novedad" },
        { id: "transito_cancelado", label: "Tránsito cancelado y garantía liberada" },
      ],
    },
  },
  {
    id: "impo_zona_franca",
    label: "Ingreso a zona franca",
    flujo: "importacion",
    familia: "suspensiva",
    norma: "Ley 24.331 — RG 270/98, Nota Externa 3/2004",
    cuando:
      "La mercadería entra a una zona franca. La zona franca está fuera del territorio aduanero general: no paga tributos mientras esté adentro.",
    plazo: null,
    cancelacion: {
      label: "Ingreso registrado en la zona",
      guia:
        "Además de la Aduana interviene el operador de la zona franca: controla la documentación, pesa en balanza de ingreso y emite el comprobante. Guardá ese comprobante en la carpeta, es el que prueba el ingreso.",
      subtareas: [
        { id: "autorizacion_zf", label: "Ingreso autorizado por la administración de la zona franca" },
        { id: "balanza", label: "Peso registrado en balanza de ingreso" },
        { id: "comprobante_zf", label: "Comprobante de ingreso de mercadería archivado" },
      ],
    },
  },
];

/* ─────────────────────────── Exportación ─────────────────────────── */

const EXPO: Destinacion[] = [
  {
    id: "expo_consumo",
    label: "Exportación a consumo",
    flujo: "exportacion",
    familia: "definitiva",
    norma: "Código Aduanero, arts. 331 y ss.",
    cuando:
      "La mercadería sale del país por tiempo indeterminado. Tributa derechos de exportación y genera reintegro.",
    plazo: null,
  },
  {
    id: "expo_temporaria",
    label: "Exportación temporaria",
    flujo: "exportacion",
    familia: "suspensiva",
    norma: "Código Aduanero, arts. 349 y ss. — Decreto 1001/82",
    cuando:
      "Bienes que siguen siendo del exportador argentino y salen con obligación de volver: maquinaria en uso económico, mercadería que sale a repararse, ferias.",
    plazo: { dias: 1095, desde: "el libramiento" },
    prorroga:
      "Se pide con informe técnico que justifique la continuidad del uso, y no puede exceder el plazo originalmente autorizado. Se presenta por SICNEA.",
    autorizacion: {
      label: "Autorización del régimen",
      donde:
        "SICNEA (Multinota Electrónica Aduanera en SITA) — resuelve la Dirección Técnica de la Subdirección General Técnico Legal Aduanera",
      subtareas: [
        {
          id: "ddjj_contrato",
          label:
            "DDJJ y contrato que acrediten el uso económico y la obligación de retorno",
        },
        {
          id: "informe_valor",
          label:
            "Informe técnico que justifique la relación entre la contraprestación y el valor de la mercadería",
        },
        { id: "titularidad", label: "Titularidad acreditada (documentación registral si aplica)" },
        { id: "estado_merc", label: "Estado de la mercadería declarado" },
        { id: "vinculacion", label: "Vinculación con la contraparte del exterior declarada" },
        {
          id: "identificacion",
          label:
            "Identificación especial de la mercadería (números de serie, marcas) — es lo que permite verificarla al reimportar",
        },
      ],
    },
    cancelacion: {
      label: "Reimportación y cancelación",
      guia:
        "Se cancela REIMPORTANDO dentro del plazo (hasta 3 años, sin exceder el plazo del contrato). Y acá está lo que hay que tener claro para cotizar el retorno: si la mercadería vuelve EN EL MISMO ESTADO, la reimportación no paga tributos, solo tasas retributivas de servicios. Si fue reparada, transformada o perfeccionada afuera, paga los tributos de importación a consumo calculados sobre el MAYOR VALOR que ganó en el exterior. Avisale esto al cliente antes de que la mande, no cuando vuelve.",
      subtareas: [
        { id: "plazo_control", label: "Vencimiento del plazo controlado" },
        { id: "reimportacion", label: "Reimportación oficializada en término" },
        {
          id: "mayor_valor",
          label:
            "Si hubo perfeccionamiento: mayor valor determinado y tributos liquidados sobre esa diferencia",
        },
        { id: "identificacion_verificada", label: "Identificación de la mercadería verificada contra la salida" },
      ],
    },
  },
  {
    id: "expo_transito",
    label: "Tránsito de exportación",
    flujo: "exportacion",
    familia: "suspensiva",
    norma: "Código Aduanero, arts. 374 y ss.",
    cuando:
      "La mercadería ya destinada a exportación se traslada por el país hasta la aduana de salida.",
    plazo: null,
    autorizacion: {
      label: "Registro del tránsito",
      donde: "SINTIA (MIC/DTA) para el tránsito terrestre internacional",
      subtareas: [
        { id: "mic_dta", label: "MIC/DTA registrado en SINTIA con la CRT asociada" },
        { id: "ruta_plazo", label: "Ruta y plazo declarados (campo 40)" },
        { id: "precinto", label: "Unidad pesada y precintada por Aduana antes de la salida" },
      ],
    },
    cancelacion: {
      label: "Salida y cancelación",
      guia: "Se cancela con la salida efectiva por la aduana de frontera, dentro del plazo y la ruta declarados.",
      subtareas: [
        { id: "salida", label: "Salida por la aduana de frontera registrada" },
        { id: "transito_cancelado", label: "Tránsito cancelado" },
      ],
    },
  },
  {
    id: "expo_zona_franca",
    label: "Exportación desde zona franca al exterior",
    flujo: "exportacion",
    familia: "definitiva",
    norma: "Subrégimen EC18 — RG 270/98",
    cuando:
      "La mercadería que estaba en una zona franca sale al exterior. Se oficializa en la aduana con jurisdicción sobre la zona.",
    plazo: null,
    autorizacion: {
      label: "Egreso de la zona franca",
      donde: "Aduana de jurisdicción de la zona franca",
      subtareas: [
        { id: "subregimen", label: "Destinación oficializada por subrégimen EC18" },
        { id: "egreso_zf", label: "Egreso autorizado por la administración de la zona franca" },
      ],
    },
  },
];

export const DESTINACIONES: Destinacion[] = [...IMPO, ...EXPO];

/** Destinación por defecto según el tipo, para operaciones sin dato cargado. */
export const DESTINACION_POR_DEFECTO = {
  importacion: "impo_consumo",
  exportacion: "expo_consumo",
} as const;

export function destinacionPorId(id: string | null | undefined): Destinacion | null {
  if (!id) return null;
  return DESTINACIONES.find((d) => d.id === id) ?? null;
}

/** Las que se pueden elegir para un tipo de operación dado. */
export function destinacionesDe(flujo: "importacion" | "exportacion"): Destinacion[] {
  return DESTINACIONES.filter((d) => d.flujo === flujo);
}

/**
 * Resuelve la destinación de una operación, tolerando las viejas que solo
 * tienen `tipo`. Sin dato asumimos «a consumo», que es lo que se venía
 * modelando y lo que efectivamente son casi todas las carpetas ya cargadas.
 */
export function destinacionDe(
  tipo: string | null | undefined,
  destinacion: string | null | undefined,
): Destinacion {
  const explicita = destinacionPorId(destinacion);
  if (explicita) return explicita;
  const esExpo = (tipo ?? "").toLowerCase().startsWith("exp");
  return destinacionPorId(
    esExpo ? DESTINACION_POR_DEFECTO.exportacion : DESTINACION_POR_DEFECTO.importacion,
  )!;
}

/** true si el régimen suspende tributos en vez de cobrarlos. */
export function suspendeTributos(d: Destinacion): boolean {
  return d.familia === "suspensiva";
}

/**
 * Fecha de vencimiento del régimen a partir del día que empieza a correr.
 * Devuelve null cuando el plazo lo fija la autorización caso por caso.
 */
export function vencimientoDe(d: Destinacion, desde: Date): Date | null {
  if (!d.plazo) return null;
  const f = new Date(desde);
  f.setDate(f.getDate() + d.plazo.dias);
  return f;
}

export type EstadoPlazo = {
  nivel: "vencido" | "critico" | "proximo" | "holgado" | "sin_fecha";
  /** Días que faltan (negativo si ya venció). null si no hay fecha cargada. */
  dias: number | null;
  texto: string;
};

/**
 * Estado del plazo de un régimen suspensivo.
 *
 * Devuelve null para las definitivas, que no vencen. El caso «sin_fecha» no es
 * un detalle: una temporaria sin vencimiento cargado es exactamente la que se
 * pasa de fecha, porque nadie la está mirando. Por eso avisa igual.
 */
export function estadoPlazo(
  d: Destinacion | null,
  vence: string | null | undefined,
  hoy: Date = new Date(),
): EstadoPlazo | null {
  if (!d || d.familia !== "suspensiva") return null;

  const f = (vence ?? "").trim();
  if (!f) {
    return {
      nivel: "sin_fecha",
      dias: null,
      texto: d.plazo
        ? `Plazo sin cargar (${d.plazo.dias} días desde ${d.plazo.desde})`
        : "Plazo sin cargar",
    };
  }

  const fin = new Date(`${f}T00:00:00`);
  if (Number.isNaN(fin.getTime())) {
    return { nivel: "sin_fecha", dias: null, texto: "Plazo sin cargar" };
  }

  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const dias = Math.round((fin.getTime() - base.getTime()) / 86_400_000);

  if (dias < 0) {
    return {
      nivel: "vencido",
      dias,
      texto: `Régimen vencido hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "día" : "días"}`,
    };
  }
  if (dias === 0) return { nivel: "critico", dias, texto: "El régimen vence hoy" };
  // 30 días es el umbral porque cancelar no es instantáneo: hay que oficializar
  // una reexportación o pedir la prórroga, y la prórroga se pide ANTES de vencer.
  const nivel = dias <= 30 ? "critico" : dias <= 60 ? "proximo" : "holgado";
  return {
    nivel,
    dias,
    texto: `Vence en ${dias} ${dias === 1 ? "día" : "días"}`,
  };
}
