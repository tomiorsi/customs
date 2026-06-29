/**
 * Autocertificación de origen del MERCOSUR (Declaración de Origen).
 *
 * Régimen de Origen MERCOSUR (ROM) aprobado por la Decisión CMC N° 05/23,
 * incorporado al ACE 18 por el Ducentésimo Décimo Octavo (218°) Protocolo
 * Adicional, vigente desde el 18/07/2024. Reemplaza al régimen de la
 * Decisión CMC N° 01/09.
 *
 * Novedad central (Art. 26 "Prueba de origen"): la prueba de origen puede
 * adoptar DOS modalidades a elección del Estado Parte exportador:
 *   a) Certificado de Origen emitido por una ENTIDAD HABILITADA (cámaras), o
 *   b) DECLARACIÓN DE ORIGEN completada por el propio exportador o productor
 *      = "autocertificación" (Art. 30), confeccionada sobre un documento
 *      comercial (factura, remito/delivery note, contrato, etc.).
 *
 * La autocertificación es OPTATIVA por país y cada Estado Parte la habilita
 * para SUS exportadores con 6 meses de aviso previo (Art. 26). Como país
 * importador (Argentina), aceptamos la autocertificación cuando el país de
 * ORIGEN ya la implementó.
 *
 * Requisitos de validez del documento: información mínima del Apéndice V e
 * instructivo del Apéndice VI del 218° PA al ACE 18.
 *
 * No importa "server-only": se usa también en componentes cliente y plantillas.
 */

import { buscarPais } from "./cotizador";

/** Identificación de la norma base (para mostrar y para el contexto de la IA). */
export const ROM = {
  decision: "Decisión CMC N° 05/23",
  protocolo: "218° Protocolo Adicional al ACE 18",
  vigenteDesde: "2024-07-18",
  articuloPrueba: "Art. 26 (Prueba de origen)",
  articuloDeclaracion: "Art. 30 (Declaración de origen)",
  validezMeses: 12, // Art. 27
  guardaAnios: 5, // Art. 32
} as const;

/**
 * Estado de la autocertificación según el país de ORIGEN:
 * - "vigente": el país exportador ya la implementó y está operativa.
 * - "pendiente": adoptó la norma pero su entrada en vigor es futura.
 * - "no_implementado": es Mercosur pero todavía exige CO por entidad habilitada.
 * - "no_aplica": el origen no integra el Mercosur (ACE 18), no corresponde.
 */
export type EstadoAutocert =
  | "vigente"
  | "pendiente"
  | "no_implementado"
  | "no_aplica";

export type AutocertOrigen = {
  /** Nombre del país de origen (si se reconoció). */
  pais: string | null;
  /** ¿El origen integra el Mercosur (ACE 18)? */
  esMercosur: boolean;
  estado: EstadoAutocert;
  /** ¿A la fecha de referencia se acepta una autocertificación de ese origen? */
  vigente: boolean;
  /** Fecha de entrada en vigor en el país exportador (ISO), si aplica. */
  desde?: string;
  /** Norma del país exportador que la implementó. */
  norma?: string;
  /** Explicación lista para mostrar y para el contexto de la IA. */
  nota: string;
};

/**
 * Países de ORIGEN que adoptaron la autocertificación (Declaración de Origen)
 * para sus exportaciones intra-Mercosur (ACE 18), con su fecha de entrada en
 * vigor y la norma interna. Estado a jun-2026:
 * - Brasil: operativo desde 01/03/2025 (Portaria SECEX 373/2024).
 * - Uruguay: para el ACE 18 rige desde 01/10/2026 (Res. MEF 3.003/026, abr-2026).
 * - Paraguay y Bolivia: todavía no la habilitaron → siguen con CO por entidad.
 */
const IMPLEMENTACION: Record<string, { desde: string; norma: string }> = {
  brasil: { desde: "2025-03-01", norma: "Portaria SECEX 373/2024" },
  uruguay: { desde: "2026-10-01", norma: "Resolución MEF 3.003/026" },
};

function clave(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function fmtFecha(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Determina si una autocertificación de origen es válida según el país de
 * ORIGEN y la fecha de referencia (por defecto, hoy).
 */
export function autocertificacionOrigen(
  paisOrigen: string | null | undefined,
  ref: Date = new Date(),
): AutocertOrigen {
  const pais = buscarPais(paisOrigen);
  const nombre = pais?.nombre ?? (paisOrigen?.trim() || null);
  const esMercosur = pais?.preferencia === "mercosur";

  if (!esMercosur) {
    return {
      pais: nombre,
      esMercosur: false,
      estado: "no_aplica",
      vigente: false,
      nota:
        `El origen ${nombre ?? "indicado"} no integra el Mercosur (ACE 18): la ` +
        "autocertificación del Régimen de Origen Mercosur NO aplica. La prueba " +
        "de origen, si la hay, se rige por el acuerdo que corresponda.",
    };
  }

  const impl = IMPLEMENTACION[clave(pais!.nombre)];
  if (!impl) {
    return {
      pais: nombre,
      esMercosur: true,
      estado: "no_implementado",
      vigente: false,
      nota:
        `${nombre} integra el Mercosur pero todavía NO habilitó la ` +
        "autocertificación para sus exportadores: la prueba de origen debe ser " +
        "un Certificado de Origen emitido por una entidad habilitada (no se " +
        "acepta declaración de origen / autocertificación de este origen).",
    };
  }

  const desde = new Date(`${impl.desde}T00:00:00`);
  const vigente = ref.getTime() >= desde.getTime();
  return {
    pais: nombre,
    esMercosur: true,
    estado: vigente ? "vigente" : "pendiente",
    vigente,
    desde: impl.desde,
    norma: impl.norma,
    nota: vigente
      ? `${nombre} ya implementó la autocertificación de origen (${impl.norma}, ` +
        `vigente desde el ${fmtFecha(impl.desde)}): se ACEPTA una Declaración de ` +
        "Origen hecha por el exportador o productor sobre un documento comercial, " +
        "como alternativa válida al Certificado de Origen por entidad habilitada. " +
        `Debe cumplir la información mínima del Apéndice V (${ROM.protocolo}).`
      : `${nombre} adoptó la autocertificación (${impl.norma}) pero recién entra ` +
        `en vigor el ${fmtFecha(impl.desde)}: hasta esa fecha NO se acepta la ` +
        "declaración de origen de este origen; la prueba debe ser un Certificado " +
        "de Origen emitido por entidad habilitada.",
  };
}

/**
 * Arma el bloque de contexto sobre autocertificación que se le pasa a la IA en
 * el paso de documentación, según el país de origen.
 *
 * Sólo aporta lo que el parquet NO puede saber: si ESE origen ya habilitó la
 * autocertificación (capa dinámica por país). El detalle de validez de la
 * declaración (información mínima, texto exacto, reglas de emisión y tercer
 * operador) lo provee el MARCO NORMATIVO (Apéndices V y VI del ROM en el parquet).
 */
export function contextoAutocertIA(info: AutocertOrigen): string {
  const cabecera =
    `Régimen de Origen Mercosur (${ROM.decision}, ${ROM.protocolo}, vigente ` +
    `desde el ${fmtFecha(ROM.vigenteDesde)}). La prueba de origen puede ser un ` +
    "Certificado de Origen emitido por una entidad habilitada, O una Declaración " +
    "de Origen / AUTOCERTIFICACIÓN hecha por el propio exportador o productor " +
    "sobre un documento comercial.";

  const lineas: string[] = [cabecera, `Situación del origen: ${info.nota}`];

  if (info.esMercosur && info.vigente) {
    lineas.push(
      "De este origen SÍ se acepta la autocertificación: si el documento de " +
        "origen adjunto es una declaración del exportador o productor (texto " +
        "firmado en la factura, remito o contrato, sin sello de cámara), es VÁLIDA. " +
        "Controlá su contenido contra el Apéndice V (información mínima y texto de " +
        "la declaración) y el Apéndice VI (reglas de emisión) del MARCO NORMATIVO.",
    );
  } else if (info.esMercosur) {
    lineas.push(
      "De este origen NO se acepta todavía una autocertificación: si el " +
        "documento adjunto es una declaración de origen del exportador (y no un " +
        "Certificado de Origen emitido por entidad habilitada), marcalo como " +
        "inconsistencia y pedí el Certificado de Origen Mercosur tradicional.",
    );
  }

  return lineas.join("\n");
}
