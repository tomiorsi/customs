/**
 * Normativa del Boletín Oficial (Primera Sección) del día.
 *
 * La Primera Sección es la que publica leyes, decretos, resoluciones y
 * disposiciones: es donde aparece lo que cambia las reglas de una operación
 * (derechos, licencias, intervenciones, régimen cambiario). Las secciones
 * Segunda (sociedades) y Tercera/Cuarta (edictos y licitaciones) no traen
 * normativa, por eso no se leen acá.
 */

/**
 * Qué clase de control ejerce el organismo que dicta la norma. No es una
 * etiqueta decorativa: es el triage real de un despachante, porque cada
 * familia frena la carpeta en un punto distinto.
 */
export type FamiliaControl =
  | "aduana"
  | "comercio"
  | "sanitario"
  | "cambiario"
  | "general";

export type NormaBoletin = {
  /** Estable por día + código, sirve de key de React. */
  id: string;
  /** Organismo que la dicta, tal como lo publica el sumario. */
  organismo: string;
  /** "Decreto", "Resolución", "Resolución General", "Disposición"… */
  tipo: string;
  /** Número y año ("732/2026"). */
  numero: string;
  /** Código GDE ("RESOL-2026-347-APN-SGP"). */
  codigo: string;
  /** Síntesis del sumario; el BO no siempre la publica. */
  sumario: string;
  /** ¿Toca comercio exterior? */
  relevante: boolean;
  /** Por qué se marcó como relevante (organismo y/o términos que matchearon). */
  motivos: string[];
  /** Qué clase de control ejerce quien la dicta. */
  familia: FamiliaControl;
};

export type BoletinDelDia = {
  /** Fecha de la edición, ISO. */
  fecha: string | null;
  /** Fecha tal como la imprime el BO ("viernes 14 de agosto de 2026"). */
  fechaTexto: string | null;
  /** Número de edición ("35.971"). */
  numero: string | null;
  /** Año de publicación en números romanos, como lo imprime el BO ("CXXXIV"). */
  anioRomano: string | null;
  normas: NormaBoletin[];
  /** PDF oficial de la sección, para ir a la fuente. */
  url: string;
  error: string | null;
  consultado: string;
};

/**
 * Términos que delatan materia aduanera aunque el organismo sea otro
 * (un decreto de Presidencia puede cambiar derechos de exportación).
 */
export const TERMINOS_COMEX = [
  "ADUAN",
  "IMPORTACION",
  "IMPORTACIONES",
  "EXPORTACION",
  "EXPORTACIONES",
  "ARANCEL",
  "NOMENCLATURA",
  "MERCOSUR",
  "ANTIDUMPING",
  "DUMPING",
  "SALVAGUARDIA",
  "LICENCIA",
  "REINTEGRO",
  "DRAWBACK",
  "ZONA FRANCA",
  "COURIER",
  "DESPACHANTE",
  "COMERCIO EXTERIOR",
  "ORIGEN",
  "DIVISAS",
  "VENTANILLA UNICA",
];

/** Sin acentos y en mayúsculas, para comparar contra las listas de arriba. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Qué organismos componen cada familia de control, y qué mira un despachante
 * cuando aparece uno. El texto es material didáctico: se muestra al abrir la
 * norma para que el operador sepa dónde le puede pegar.
 */
export const FAMILIAS: {
  id: FamiliaControl;
  etiqueta: string;
  organismos: string[];
  queControla: string;
}[] = [
  {
    id: "aduana",
    etiqueta: "Aduana",
    organismos: [
      "ARCA",
      "AGENCIA DE RECAUDACION Y CONTROL ADUANERO",
      "ADMINISTRACION FEDERAL DE INGRESOS PUBLICOS",
      "DIRECCION GENERAL DE ADUANAS",
    ],
    queControla:
      "Las reglas del despacho: manifiestos, valoración, regímenes y controles en frontera. Lo que se publica acá cambia cómo se arma la carpeta.",
  },
  {
    id: "comercio",
    etiqueta: "Acceso al mercado",
    organismos: [
      "SECRETARIA DE COMERCIO",
      "SECRETARIA DE INDUSTRIA Y COMERCIO",
      "COMISION NACIONAL DE COMERCIO EXTERIOR",
      "GRUPO MERCADO COMUN",
      "MERCOSUR",
    ],
    queControla:
      "Si la mercadería puede entrar y a qué costo: licencias, aranceles, antidumping y salvaguardias. Acá aparece cuando un producto pasa a necesitar permiso.",
  },
  {
    id: "sanitario",
    etiqueta: "Habilitación sanitaria",
    organismos: [
      "SERVICIO NACIONAL DE SANIDAD Y CALIDAD AGROALIMENTARIA",
      "ADMINISTRACION NACIONAL DE MEDICAMENTOS",
      "INSTITUTO NACIONAL DE ALIMENTOS",
      "INSTITUTO NACIONAL DE VITIVINICULTURA",
      "INSTITUTO NACIONAL DE TECNOLOGIA INDUSTRIAL",
    ],
    queControla:
      "Habilita la mercadería por lo que es: alimentos, medicamentos, productos de origen animal o vegetal. Sin su certificado no se nacionaliza.",
  },
  {
    id: "cambiario",
    etiqueta: "Pagos al exterior",
    organismos: ["BANCO CENTRAL DE LA REPUBLICA ARGENTINA"],
    queControla:
      "Cuándo y cómo se gira la plata de una importación. No frena la mercadería, frena el pago al proveedor.",
  },
];

/** Las cuatro secciones del Boletín y para qué sirve cada una acá. */
export const SECCIONES_BO = [
  {
    n: 1,
    nombre: "Legislación y Avisos Oficiales",
    detalle:
      "Leyes, decretos, resoluciones y disposiciones. Es la única que cambia las reglas, y es la que leemos en esta pantalla.",
    leemos: true,
  },
  {
    n: 2,
    nombre: "Sociedades y Avisos Judiciales",
    detalle:
      "Contratos, sociedades, convocatorias y edictos judiciales. No dicta normativa aduanera.",
    leemos: false,
  },
  {
    n: 3,
    nombre: "Contrataciones",
    detalle:
      "Licitaciones y compras del Estado. Trae edictos aduaneros sueltos, pero no normativa.",
    leemos: false,
  },
  {
    n: 4,
    nombre: "Registro de Dominios de Internet",
    detalle: "Altas de dominios .ar. Nada que ver con comercio exterior.",
    leemos: false,
  },
];

/** A qué familia pertenece el organismo que dicta la norma. */
export function familiaDeOrganismo(organismo: string): FamiliaControl {
  const org = normalizar(organismo);
  for (const f of FAMILIAS) {
    if (f.organismos.some((o) => org.includes(o))) return f.id;
  }
  return "general";
}

/** Qué significa cada prefijo del código GDE. */
const PREFIJOS_GDE: Record<string, string> = {
  LEY: "Ley",
  DECTO: "Decreto",
  DECAD: "Decisión administrativa",
  RESOL: "Resolución",
  RESGC: "Resolución general",
  RESFC: "Resolución de firma conjunta",
  DI: "Disposición",
  ACOR: "Acordada",
  IF: "Informe",
  PV: "Providencia",
};

export type ParteGde = { valor: string; que: string };

/**
 * Desarma un código GDE ("RESOL-2026-347-APN-SGP") en sus partes.
 * Es el identificador con el que se pide un expediente, y leerlo de memoria
 * es de las primeras cosas que aprende un operador nuevo.
 */
export function decodificarGde(codigo: string): ParteGde[] {
  const limpio = codigo.trim();
  if (!limpio) return [];

  const m = limpio.match(/^([A-Z]+)-(\d{4})-([\d.]+)-([A-Z]+)(?:-(.+))?$/i);
  if (!m) return [];

  const [, prefijo, anio, numero, ambito, reparticionRaw] = m;
  const partes: ParteGde[] = [
    {
      valor: prefijo,
      que: PREFIJOS_GDE[prefijo.toUpperCase()] ?? "Tipo de acto",
    },
    { valor: anio, que: "Año" },
    { valor: numero, que: "Número" },
    {
      valor: ambito,
      que: ambito.toUpperCase() === "APN" ? "Administración Pública Nacional" : "Ámbito",
    },
  ];

  if (reparticionRaw) {
    // "DNM#MSG" = repartición que firma # organismo del que depende. No siempre
    // es un ministerio: puede ser un ente autárquico (DIR#CNV, por ejemplo).
    const [reparticion, dependencia] = reparticionRaw.split("#");
    partes.push({ valor: reparticion, que: "Repartición que lo firma" });
    if (dependencia) {
      partes.push({ valor: dependencia, que: "Organismo del que depende" });
    }
  }

  return partes;
}

/**
 * Marca una norma como de comercio exterior y explica por qué.
 * Devolvemos los motivos para que la UI pueda mostrarlos: un filtro que no
 * puede justificar lo que descartó es un filtro en el que no se puede confiar.
 */
export function evaluarRelevancia(campos: {
  organismo: string;
  sumario: string;
  codigo: string;
}): { relevante: boolean; motivos: string[] } {
  const org = normalizar(campos.organismo);
  const texto = normalizar(
    `${campos.organismo} ${campos.sumario} ${campos.codigo}`,
  );
  const motivos: string[] = [];

  // Los organismos de las familias son, por definición, los que nos importan:
  // así el filtro y el triage por familia no pueden quedar desalineados.
  for (const f of FAMILIAS) {
    const match = f.organismos.find((o) => org.includes(o));
    if (match) {
      motivos.push(match);
      break;
    }
  }
  for (const t of TERMINOS_COMEX) {
    if (texto.includes(t)) motivos.push(t);
  }

  return { relevante: motivos.length > 0, motivos: [...new Set(motivos)] };
}
