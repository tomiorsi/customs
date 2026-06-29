import type { RefArticulo } from "./normas";

/**
 * Registro de conocimiento (semilla de la "Capa 3"): conecta cada tema que el
 * motor evalúa con el/los artículo(s) de fondo que lo sustentan, para inyectar
 * su texto literal como grounding de la IA y poder citar la norma.
 *
 * Los números fueron verificados contra data/Normas/normas.parquet:
 *   ROM (Dec. CMC 05/23):
 *     4  Calificación de origen
 *     18 Expedición directa
 *     19 Tercer operador (triangulación)
 *     26 Prueba de origen (2 modalidades)
 *     27 Validez de la prueba de origen
 *     30 Declaración de origen (autocertificación)
 *     31 Declaración jurada de origen
 *     Ap. IV  Instructivo del certificado por entidad (incl. tercer operador)
 *     Ap. V   Información mínima de la declaración de origen + texto exacto
 *     Ap. VI  Instructivo de la declaración de origen (tercer operador)
 *   Acuerdo de Valoración OMC (Ley 24.425):
 *     1  Valor de transacción
 *     8  Ajustes al valor
 *
 * El DETALLE OPERATIVO (qué exige cada modalidad, tercer operador, texto de la
 * declaración) ya NO está hardcodeado en TS: vive en los APÉNDICES del parquet y
 * se inyecta literal acá. La regla GENERAL de "remisiones" del
 * PRINCIPIO_FUNDAMENTACION (ia-documentos.ts) + contextoArticulosIA evita que una
 * remisión a un apéndice NO reproducido (p.ej. Ap. II) se lea como requisito.
 *
 * A medida que el motor cubra más casos (régimen de importación/exportación,
 * infracciones, etc.) se agregan acá las referencias al Código Aduanero.
 */

export const REFERENCIAS = {
  origen: [
    { norma: "ROM", art: 4 },
    { norma: "ROM", art: 18 },
    { norma: "ROM", art: 19 },
    { norma: "ROM", art: 26 },
    { norma: "ROM", art: 27 },
    { norma: "ROM", art: 30 },
    { norma: "ROM", art: 31 },
    { norma: "ROM", art: "Ap. IV" },
    { norma: "ROM", art: "Ap. V" },
    { norma: "ROM", art: "Ap. VI" },
  ],
  valoracion: [
    { norma: "VAL", art: 1 },
    { norma: "VAL", art: 8 },
  ],
  /** Código Aduanero: documentación y despacho de importación. */
  importacion: [
    { norma: "CA", art: 130 },
    { norma: "CA", art: 131 },
    { norma: "CA", art: 132 },
    { norma: "CA", art: 217 },
    { norma: "CA", art: 218 },
  ],
} satisfies Record<string, RefArticulo[]>;

/** Marco normativo para el Paso 2 (validación de documentación): origen + valor. */
export const REF_DOCUMENTACION: RefArticulo[] = [
  ...REFERENCIAS.origen,
  ...REFERENCIAS.valoracion,
  ...REFERENCIAS.importacion,
];

/** Marco normativo para la apertura (Paso 1): foco en origen / triangulación. */
export const REF_APERTURA: RefArticulo[] = [
  { norma: "ROM", art: 18 },
  { norma: "ROM", art: 19 },
  { norma: "ROM", art: 26 },
  { norma: "ROM", art: "Ap. IV" },
  { norma: "ROM", art: "Ap. VI" },
];
