import "server-only";
import { ivaEstimado } from "./datos";
import {
  arancelPorNcm,
  candidatosDePartida,
  descripcionPartida,
  lineaNcmEnParquet,
  textoLegalResumido,
  paquetePartidasParaIa,
  cierreInvalidoPorHechos,
  ncmPreferidaPorTipificacion,
  ncmPreferidaPorRamaTipificadaHechos,
  ncmPreferidaPorCalificadorFinal,
  ncmPreferidaPorCadenaSegmentosHechos,
  ncmPreferidaSobreResidualHermana,
  resolverNcmEnPaquete,
  hayCompetenciaMaterialEntreBloques,
  materiaDeclaradaEnHechos,
  type BloqueCandidatos,
} from "./motor";
import {
  iaDisponible,
  cruzarCandidatos,
  expandirConsultaLegal,
  mensajeErrorIa,
} from "./ia";
import type { PropuestaCruce } from "./ia";
import {
  estadoClasificacion,
  textoParaFiltroParquet,
  textoParaSimsParquet,
  nombreBaseProducto,
  enriquecerContextoClasificacion,
} from "./estado-clasificacion";
import { opcionesParecenPreguntas, preguntaPideClasificacion } from "./preguntas-sistema";
import { marcoLegalClasificacion } from "./marco-legal";
import { INSTRUCCION_CIERRE_FORZADO } from "./principios-clasificacion";
import {
  CostoClasificacionExcedidoError,
  costoClasificacionUsd,
  reiniciarCostoClasificacion,
} from "./costo-ia";
import type {
  CandidatoNcm,
  ClasificacionResultado,
  ContextoClasificacion,
  PosicionEnMira,
  Pregunta,
  Respuesta,
} from "./tipos";

export type { ClasificacionResultado, ContextoClasificacion, PosicionEnMira } from "./tipos";
export {
  derivarEstadoExpediente,
  etiquetaEstado,
  ayudaEstado,
  type EstadoExpediente,
} from "./estado";

const MAX_OPCIONES = 4;
/** Máximo de preguntas al importador por clasificación (pipeline simplificado). */
const MAX_PREGUNTAS = 3;
const CLASIFICACION_TIMEOUT_MS = 45_000;

function soloDigitos(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

function contarRespuestas(respuestas: Respuesta[]): number {
  return respuestas.filter((r) => r.pregunta?.trim() && r.opcion?.trim()).length;
}

function puedePreguntar(respuestas: Respuesta[]): boolean {
  return contarRespuestas(respuestas) < MAX_PREGUNTAS;
}

async function cruceForzado(args: {
  hechos: string;
  bloques: BloqueCandidatos[];
  marcoLegal: string;
}): Promise<Awaited<ReturnType<typeof cruzarCandidatos>>> {
  return cruzarCandidatos({
    hechos: args.hechos + `\n\n[INSTRUCCIÓN]: ${INSTRUCCION_CIERRE_FORZADO}`,
    bloques: args.bloques,
    marcoLegal: args.marcoLegal,
  });
}

async function finalizarDesdeCruce(
  producto: string,
  cruce: Awaited<ReturnType<typeof cruzarCandidatos>>,
  bloques: BloqueCandidatos[],
): Promise<ClasificacionResultado | null> {
  if (cruce.confirma !== true || !cruce.ncm?.trim()) return null;
  const ncm = resolverNcmEnPaquete(cruce.ncm.trim(), bloques) ?? cruce.ncm.trim();
  const ncmDigitos = soloDigitos(ncm);
  const ncmsCandidatos = new Set(bloques.flatMap((b) => b.sims.map((s) => soloDigitos(s.codigo))));
  if (!ncmsCandidatos.has(ncmDigitos)) return null;
  const p4 = ncmDigitos.slice(0, 4);
  const hip = await reconstruirHipotesis(ncm, p4);
  if (!hip) return null;
  const propuestasAll = propuestasDesdeBloques(bloques);
  // Si el motor afinó la línea, `justificacion`/`descartadas` de la IA quedaron vacíos
  // (referían a otra NCM): armamos la fundamentación del cierre real, no la del modelo.
  const justificacion = cruce.justificacion?.trim()
    ? cruce.justificacion
    : justificacionLineaFinal(hip.ncm, textoLegalResumido(hip.exacto));
  const enMira = await armarPosicionesEnMira(propuestasAll, ncm, cruce.descartadas);
  return armarFinal(producto, hip, justificacion, propuestasAll, enMira);
}

/** Fundamentación del cierre cuando el motor eligió la línea específica (RGI 3 a)/6). */
function justificacionLineaFinal(ncm: string, textoLegal: string): string {
  return (
    `Clasificado en ${ncm}: ${textoLegal}. ` +
    `Dentro de la partida se eligió la línea que describe el artículo (RGI 3 a) y RGI 6): ` +
    `la subpartida o ítem específico prevalece sobre las hermanas genéricas o residuales de la misma familia.`
  );
}

function normalizarPregunta(p: Pregunta): Pregunta {
  return {
    ...p,
    opciones: (p.opciones ?? []).slice(0, MAX_OPCIONES),
    permiteTextoLibre: p.permiteTextoLibre !== false,
    maxOpcionesBotones: Math.min(p.maxOpcionesBotones ?? MAX_OPCIONES, MAX_OPCIONES),
  };
}

function sinResultado(
  producto: string,
  extra?: Partial<ClasificacionResultado>,
): ClasificacionResultado {
  return { producto, via: "ia", decision: "SIN_RESULTADO", ...extra };
}

type Hipotesis = {
  partida4: string;
  partidaDesc: string;
  ncm: string;
  exacto: CandidatoNcm;
  ia: { ncm: string; descripcion?: string };
  candidatos: CandidatoNcm[];
};

function preguntar(producto: string, pregunta: Pregunta): ClasificacionResultado {
  return {
    producto,
    via: "ia",
    decision: "NEEDS_AI",
    preguntas: [normalizarPregunta(pregunta)],
    fasePregunta: "partida",
  };
}

function partidasDesdePropuestas(propuestas: PropuestaCruce[]): string[] {
  return [...new Set(propuestas.map((p) => p.partida))].sort();
}

function resultadoConDisputa(
  base: ClasificacionResultado,
  propuestas: PropuestaCruce[],
): ClasificacionResultado {
  const partidas = partidasDesdePropuestas(propuestas);
  if (partidas.length < 2) return base;
  return { ...base, partidasEnJuego: partidas };
}

async function reconstruirHipotesis(ncm: string, partida4: string): Promise<Hipotesis | null> {
  const candidatos = await candidatosDePartida(partida4);
  const d = soloDigitos(ncm);
  const exacto = candidatos.find((c) => soloDigitos(c.codigo) === d);
  if (!exacto) return null;
  const partidaDesc = (await descripcionPartida(partida4)) || "";
  return {
    partida4,
    partidaDesc,
    ncm: exacto.codigo,
    exacto,
    ia: { ncm: exacto.codigo, descripcion: exacto.descripcion },
    candidatos,
  };
}

async function armarPosicionesEnMira(
  propuestas: PropuestaCruce[],
  ncmGanadora: string,
  descartadasIa?: Array<{ ncm?: string; motivo?: string }>,
): Promise<PosicionEnMira[]> {
  const ganadoraD = soloDigitos(ncmGanadora);

  // Solo mostrar las que la IA mencionó explícitamente en descartadas (máx 3)
  const descartadas = (descartadasIa ?? []).filter((d) => {
    const clave = soloDigitos(d.ncm ?? "");
    return clave.length >= 6 && clave !== ganadoraD;
  }).slice(0, 3);

  if (!descartadas.length) return [];

  const propuestaPorDigitos = new Map(propuestas.map((p) => [soloDigitos(p.ncm), p]));

  const out: PosicionEnMira[] = [];
  for (const d of descartadas) {
    const clave = soloDigitos(d.ncm ?? "");
    const p = propuestaPorDigitos.get(clave);
    if (!p) continue;
    const arancelNcm = await arancelPorNcm(p.ncm);
    const linea = await lineaNcmEnParquet(p.ncm);
    out.push({
      ncm: p.ncm,
      descripcion: linea ? textoLegalResumido(linea) : (p.descripcion ?? "").trim(),
      motivo: (d.motivo ?? "").trim() || undefined,
      di: arancelNcm?.di,
    });
  }
  return out;
}

async function armarFinal(
  producto: string,
  hip: Hipotesis,
  justificacion: string | undefined,
  propuestas: PropuestaCruce[],
  posicionesEnMira?: PosicionEnMira[],
): Promise<ClasificacionResultado> {
  const arancelNcm = await arancelPorNcm(hip.ncm);
  const base: ClasificacionResultado = {
    producto,
    via: "ia",
    decision: "DIRECTO",
    ncm: hip.ncm,
    partida: hip.partida4,
    partidaDesc: hip.partidaDesc,
    descripcion: hip.exacto.descripcion,
    derecho: arancelNcm?.di ?? hip.exacto.di,
    iva: arancelNcm?.iva ?? ivaEstimado(soloDigitos(hip.ncm)),
    ivaEstimado: arancelNcm?.ivaEstimado ?? !arancelNcm,
    justificacion,
    preguntas: [],
    posicionesEnMira: posicionesEnMira?.length ? posicionesEnMira : undefined,
  };
  return resultadoConDisputa(base, propuestas);
}

/** Construye PropuestaCruce[] desde BloqueCandidatos[] para armarPosicionesEnMira. */
function propuestasDesdeBloques(bloques: BloqueCandidatos[]): PropuestaCruce[] {
  return bloques.flatMap((b) =>
    b.sims.map((s) => ({
      partida: b.partida,
      partidaDesc: b.partidaDesc,
      ncm: s.codigo,
      descripcion: s.descripcion,
    })),
  );
}

async function clasificarProductoInterno(
  producto: string,
  respuestas?: Respuesta[],
  contexto?: ContextoClasificacion,
): Promise<ClasificacionResultado> {
  reiniciarCostoClasificacion();
  const listaRespuestas = respuestas ?? [];
  const ctx = await enriquecerContextoClasificacion(producto, contexto, listaRespuestas);

  const nombreBase = nombreBaseProducto(producto);
  const textoFiltro = textoParaFiltroParquet(producto, listaRespuestas);
  const textoSims = textoParaSimsParquet(producto, listaRespuestas);
  const hechos = estadoClasificacion({
    producto,
    respuestas: listaRespuestas,
    ncmMaquinaPadre: ctx.ncmMaquina,
    equipoReferencia: ctx.equipoReferencia,
  });

  // Fase 0 (barata): traduce la descripción comercial a términos del nomenclador
  // para el retrieval. No toca HECHOS (los hechos legales siguen siendo lo declarado).
  const terminosExpansion = await expandirConsultaLegal(producto);

  // Motor: partidas candidatas + todas las SIMs; la IA elige NCM con marco legal.
  const bloques = await paquetePartidasParaIa(
    { textoNombreBase: nombreBase, textoFiltro, textoSims },
    terminosExpansion,
  );
  if (!bloques.length) {
    return sinResultado(producto, {
      justificacion: "No encontramos partidas en el nomenclador. Ampliá la descripción del artículo.",
    });
  }

  // Marco legal para las partidas candidatas
  const marcoLegal = await marcoLegalClasificacion(bloques.map((b) => b.partida));

  // IA: cruce legal en una sola llamada
  const cruce = await cruzarCandidatos({ hechos, bloques, marcoLegal });

  // NCM confirmada por la IA (completar sufijo SIM truncado; corrección RGI 3 a) si residual global)
  const ncmCruceRaw = cruce.ncm?.trim();
  const ncmCruce =
    cruce.confirma === true && ncmCruceRaw
      ? (resolverNcmEnPaquete(ncmCruceRaw, bloques) ?? ncmCruceRaw)
      : ncmCruceRaw;
  const ncmTipificado =
    cruce.confirma === true && ncmCruce
      ? (ncmPreferidaPorTipificacion(hechos, bloques, ncmCruce) ?? ncmCruce)
      : ncmCruce;
  const ncmRamaTip =
    cruce.confirma === true && ncmTipificado
      ? (ncmPreferidaPorRamaTipificadaHechos(hechos, bloques, ncmTipificado) ?? ncmTipificado)
      : ncmTipificado;
  const ncmCalificador =
    cruce.confirma === true && ncmRamaTip
      ? (ncmPreferidaPorCalificadorFinal(hechos, bloques, ncmRamaTip) ?? ncmRamaTip)
      : ncmRamaTip;
  const ncmResidualHermana =
    cruce.confirma === true && ncmCalificador
      ? (ncmPreferidaSobreResidualHermana(hechos, bloques, ncmCalificador) ?? ncmCalificador)
      : ncmCalificador;
  const ncmCorregido =
    cruce.confirma === true && ncmResidualHermana
      ? (ncmPreferidaPorCadenaSegmentosHechos(hechos, bloques, ncmResidualHermana) ??
        ncmResidualHermana)
      : ncmResidualHermana;
  const cruceResuelto =
    ncmCruce && ncmCruce !== ncmCruceRaw ? { ...cruce, ncm: ncmCruce } : cruce;
  // Al afinar la línea (RGI 3 a)/6), la justificación y descartadas del modelo
  // apuntan a otra NCM: se descartan para regenerar el cierre real más abajo.
  const cruceFinal =
    ncmCorregido && ncmCorregido !== ncmCruce
      ? { ...cruceResuelto, ncm: ncmCorregido, justificacion: undefined, descartadas: undefined }
      : cruceResuelto;

  if (
    cruceFinal.confirma === true &&
    cruceFinal.ncm?.trim() &&
    !cierreInvalidoPorHechos(hechos, cruceFinal.ncm, bloques)
  ) {
    const final = await finalizarDesdeCruce(producto, cruceFinal, bloques);
    if (final) return final;
    return sinResultado(producto, {
      justificacion: "La posición sugerida no está en el listado del nomenclador. Intentá de nuevo.",
    });
  }

  const preguntaInvalida = cruce.faltaDato ? preguntaPideClasificacion(cruce.faltaDato) : false;
  const opcionesInvalidas = opcionesParecenPreguntas(cruce.opciones ?? []);

  // Material sin declarar: solo si el cruce no cerró ya con NCM válida.
  if (
    cruceFinal.confirma !== true &&
    puedePreguntar(listaRespuestas) &&
    hayCompetenciaMaterialEntreBloques(bloques) &&
    !materiaDeclaradaEnHechos(hechos)
  ) {
    return preguntar(producto, {
      pregunta: "¿De qué material está hecho el artículo?",
      opciones: ["Caucho", "Plástico", "Metal", "Textil", "Otro / no sé"].slice(0, MAX_OPCIONES),
      permiteTextoLibre: true,
      maxOpcionesBotones: MAX_OPCIONES,
    });
  }

  // Preguntar antes de forzar cierre: descripción corta o dato que falta.
  if (
    cruce.faltaDato?.trim() &&
    puedePreguntar(listaRespuestas) &&
    !preguntaInvalida &&
    !opcionesInvalidas
  ) {
    const opciones = (cruce.opciones ?? []).slice(0, MAX_OPCIONES);
    const preguntaObj: Pregunta = {
      pregunta: cruce.faltaDato,
      opciones,
      permiteTextoLibre: true,
      maxOpcionesBotones: Math.min(Math.max(opciones.length, 1), MAX_OPCIONES),
    };
    return preguntar(producto, preguntaObj);
  }

  // Cierre forzado solo si no compiten materias distintas sin declarar en HECHOS.
  if (!hayCompetenciaMaterialEntreBloques(bloques)) {
    const cruceForce = await cruceForzado({ hechos, bloques, marcoLegal });
    if (
      cruceForce.confirma === true &&
      cruceForce.ncm?.trim() &&
      !cierreInvalidoPorHechos(hechos, cruceForce.ncm, bloques)
    ) {
      const finalForzado = await finalizarDesdeCruce(producto, cruceForce, bloques);
      if (finalForzado) return finalForzado;
    }
  }

  return sinResultado(producto, {
    justificacion:
      cruce.justificacion?.trim() ||
      cruce.faltaDato?.trim() ||
      "No se pudo determinar la posición arancelaria con los datos disponibles.",
  });
}

export async function clasificarProducto(
  producto: string,
  respuestas?: Respuesta[],
  contexto?: ContextoClasificacion,
): Promise<ClasificacionResultado> {
  if (!iaDisponible()) return sinResultado(producto);
  try {
    return await Promise.race([
      clasificarProductoInterno(producto, respuestas, contexto),
      new Promise<ClasificacionResultado>((_, reject) => {
        setTimeout(() => reject(new Error("CLASIFICACION_TIMEOUT")), CLASIFICACION_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    if (e instanceof CostoClasificacionExcedidoError) {
      console.warn(
        `clasificarProducto: costo excedido ~$${costoClasificacionUsd().toFixed(3)}`,
      );
      return sinResultado(producto, {
        justificacion: e.message,
      });
    }
    if (e instanceof Error && e.message === "CLASIFICACION_TIMEOUT") {
      console.warn(`clasificarProducto: timeout ${CLASIFICACION_TIMEOUT_MS}ms`);
      return sinResultado(producto, {
        justificacion:
          "La clasificación superó el tiempo límite. Revisá la descripción o probá de nuevo.",
      });
    }
    console.error("clasificarProducto:", e);
    const { texto } = mensajeErrorIa(e);
    return sinResultado(producto, { justificacion: texto });
  }
}
