import "server-only";
import type { CandidatoNcm, Pregunta } from "./tipos";
import type { BloqueCandidatos } from "./motor";
import {
  formatearGrupoSimsListado,
  segmentosRamaLegal,
  textoLegalResumido,
  encabezadoTipificacionGrupo,
  tipificacionGrupoEsGenerica,
  prefijoSubpartidaCodigo,
  encabezadoLegalGenerico,
  tipificacionEncajaConHechos,
  partidaCorregidaPorSegmentosHechos,
  partidaCorregidaPorTipificacionNominal,
  partidaPreferidaPorCadenaHechos,
  partidaPreferidaPorRankingClaro,
  faltaDiscriminanteEntreHermanas,
  ncmPorCadenaHechosEnPartida,
  ncmPreferidaPorCadenaSegmentosHechos,
} from "./motor";
import {
  CRITERIO_PARQUET,
  INSTRUCCION_ELECCION_PARTIDA,
  INSTRUCCION_LECTURA_LISTADO,
  PRINCIPIO_ARTICULO_CLASIFICADO,
  PRINCIPIO_HECHOS,
  PRINCIPIO_PARTIDA_ESPECIFICA,
  PRINCIPIO_CIERRE,
  REGLA_LINEAS_RESIDUALES,
  REGLA_OPCIONES_SIN_CLASIFICACION,
} from "./principios-clasificacion";
import { registrarUsoTokens } from "./costo-ia";

const MODELO = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

export type PropuestaCruce = {
  partida: string;
  partidaDesc: string;
  ncm: string;
  descripcion?: string;
};

export type DescartadaCruce = {
  ncm: string;
  motivo: string;
};

export type IaRespuesta = {
  ncm?: string;
  /** Paso 1 del cruce en dos etapas: partida elegida (4 dígitos). */
  partida?: string;
  hechosCompletos?: boolean;
  propuestas?: Array<{ ncm: string }>;
  descripcion?: string;
  di?: number;
  justificacion?: string;
  preguntas?: Pregunta[];
  descartadas?: DescartadaCruce[];
  confirma?: boolean;
  /** Pregunta al importador cuando falta un dato para decidir entre candidatos. */
  faltaDato?: string | null;
  /** Opciones para el faltaDato (máx 4). */
  opciones?: string[];
};

export function iaDisponible(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function mensajeErrorIa(e: unknown): {
  texto: string;
  transitorio: boolean;
} {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  if (msg.includes("ANTHROPIC_API_KEY no configurada")) {
    return { texto: "La IA no está configurada (falta ANTHROPIC_API_KEY).", transitorio: false };
  }
  const transitorio =
    /Anthropic (429|529|5\d\d)/.test(msg) ||
    /overloaded|api_error|internal server error|rate.?limit/i.test(msg);
  return {
    transitorio,
    texto: transitorio
      ? "Servicio de IA temporalmente no disponible. Esperá unos segundos y probá de nuevo."
      : "No se pudo clasificar el producto. Probá de nuevo.",
  };
}

async function llamarUnaVezRaw(system: string, user: string, maxTokens = 900): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");

  const intentar = async (): Promise<string> => {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: maxTokens,
        temperature: 0,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!resp.ok) {
      const detalle = await resp.text();
      throw new Error(`Anthropic ${resp.status}: ${detalle.slice(0, 300)}`);
    }
    const data = (await resp.json()) as {
      content?: Array<{ text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const input = data.usage?.input_tokens ?? 0;
    const output = data.usage?.output_tokens ?? 0;
    if (input || output) registrarUsoTokens(input, output);
    return data.content?.[0]?.text?.trim() ?? "";
  };

  try {
    return await intentar();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const reintentar =
      /Anthropic (429|529|5\d\d)/.test(msg) ||
      /overloaded|api_error|internal server error/i.test(msg);
    if (!reintentar) throw e;
    await new Promise((r) => setTimeout(r, 2000));
    return intentar();
  }
}

function extraerObjetoJson(texto: string, start: number): string {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < texto.length; i++) {
    const c = texto[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return texto.slice(start, i + 1);
    }
  }
  let tail = texto.slice(start);
  let inStr = false;
  let esc = false;
  for (let i = 0; i < tail.length; i++) {
    const c = tail[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
  }
  if (inStr) tail += '"';
  const abrir = (tail.match(/\{/g) ?? []).length;
  const cerrar = (tail.match(/\}/g) ?? []).length;
  if (cerrar < abrir) tail += "}".repeat(abrir - cerrar);
  return tail;
}

function extraerJson(txt: string): IaRespuesta {
  const limpio = txt
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = limpio.indexOf("{");
  if (start < 0) throw new Error("Respuesta de IA sin JSON");
  try {
    return JSON.parse(extraerObjetoJson(limpio, start)) as IaRespuesta;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Respuesta de IA con JSON inválido: ${msg}`);
  }
}

async function pedir(system: string, user: string, maxTokens = 900): Promise<IaRespuesta> {
  const systemFinal =
    system + "\nRespondé únicamente con un objeto JSON válido, sin markdown ni texto extra.\n";
  try {
    return extraerJson(await llamarUnaVezRaw(systemFinal, user, maxTokens));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!/JSON/i.test(msg)) throw e;
    return extraerJson(
      await llamarUnaVezRaw(systemFinal, user, Math.min(maxTokens * 2, 2048)),
    );
  }
}

// ─── Cruce en dos pasos: partida → NCM ───────────────────────────────────────

const SYSTEM_CRUCE_PARTIDA =
  "Clasificador NCM Argentina — Paso 1: elegir PARTIDA (4 dígitos).\n" +
  PRINCIPIO_ARTICULO_CLASIFICADO +
  PRINCIPIO_HECHOS +
  PRINCIPIO_PARTIDA_ESPECIFICA +
  INSTRUCCION_ELECCION_PARTIDA +
  REGLA_OPCIONES_SIN_CLASIFICACION +
  "NO REPITAS: Si HECHOS ya contiene una respuesta sobre completitud, función, material u otro dato, NO hagas una pregunta sobre ese mismo dato.\n" +
  "TAREA: Elegí UNA partida del listado cuyo encabezado o ramas tipificadas encajen con HECHOS. No elijas NCM todavía.\n" +
  "1. Si HECHOS permite elegir → partida (4 dígitos literal del listado), confirma:true, justificacion (máx. 240 caracteres).\n" +
  "2. Si falta UN dato factual para decidir entre partidas → confirma:false, faltaDato (una sola pregunta), opciones (máx 4).\n" +
  "3. Si ninguna partida encaja → confirma:false, faltaDato:null.\n";

const SYSTEM_CRUCE_SIM =
  "Clasificador NCM Argentina — Paso 2: elegir NCM dentro de la partida elegida.\n" +
  PRINCIPIO_ARTICULO_CLASIFICADO +
  PRINCIPIO_HECHOS +
  PRINCIPIO_PARTIDA_ESPECIFICA +
  PRINCIPIO_CIERRE +
  CRITERIO_PARQUET +
  INSTRUCCION_LECTURA_LISTADO +
  REGLA_LINEAS_RESIDUALES +
  REGLA_OPCIONES_SIN_CLASIFICACION +
  "NO REPITAS: Si HECHOS ya contiene una respuesta sobre completitud, función, material u otro dato, NO hagas una pregunta sobre ese mismo dato.\n" +
  "TAREA: Elegí UN NCM del listado de esta partida.\n" +
  "1. Si HECHOS permite elegir → ncm (literal completo del listado, con sufijo SIM si figura), confirma:true, justificacion (máx. 240 caracteres; cita RGI), descartadas (MÁXIMO 3). Antes de cerrar, recorré el listado: si alguna «Tipificación legal» encaja con el tipo u operación declarada en HECHOS, elegí un NCM de esa rama y no una residual global de la partida.\n" +
  "2. Si falta UN dato factual para decidir entre candidatos específicos → confirma:false, faltaDato (una sola pregunta), opciones (máx 4).\n" +
  "3. Si ningún candidato encaja → confirma:false, faltaDato:null.\n" +
  "Solo NCM del listado provisto. Nunca inventes códigos.\n";

const MAX_TIPIFICACIONES_RESUMEN = 14;

function puntajeTipificacionParaHechos(tip: string, hechos: string): number {
  if (!tip.trim()) return 0;
  let score = tipificacionEncajaConHechos(tip, hechos) ? 2 : 0;
  for (const seg of tip.split(" > ")) {
    if (tipificacionEncajaConHechos(seg, hechos)) score++;
  }
  return score;
}

function bloqueResumenPartidas(bloques: BloqueCandidatos[], hechos: string): string {
  return bloques
    .map((b) => {
      const tips = new Set<string>();
      for (const s of b.sims) {
        for (const seg of segmentosRamaLegal(s).slice(0, -1)) {
          if (!encabezadoLegalGenerico(seg)) tips.add(seg.trim());
        }
      }
      const sorted = [...tips].sort(
        (a, b) =>
          puntajeTipificacionParaHechos(b, hechos) -
            puntajeTipificacionParaHechos(a, hechos) || a.localeCompare(b),
      );
      const tipList = sorted.slice(0, MAX_TIPIFICACIONES_RESUMEN).join("; ");
      const extra = tipList ? `\n  Ramas tipificadas (muestra): ${tipList}` : "";
      return `PARTIDA ${b.partida}: ${b.partidaDesc}${extra}`;
    })
    .join("\n\n");
}

async function cruzarPartida(args: {
  hechos: string;
  bloques: BloqueCandidatos[];
  marcoLegal: string;
}): Promise<IaRespuesta> {
  const esquema =
    '{"partida":"","confirma":false,"justificacion":"","faltaDato":null,"opciones":[]}';
  const user =
    `${args.hechos}\n\n` +
    `MARCO LEGAL (RGI, notas, nomenclador):\n${args.marcoLegal}\n\n` +
    `PARTIDAS CANDIDATAS (elegí UNA; no elijas NCM todavía):\n${bloqueResumenPartidas(args.bloques, args.hechos)}\n\n` +
    `JSON:\n${esquema}`;
  return pedir(SYSTEM_CRUCE_PARTIDA, user, 1024);
}

async function cruzarSimsEnPartida(args: {
  hechos: string;
  bloque: BloqueCandidatos;
  marcoLegal: string;
  eleccionPartida?: string;
}): Promise<IaRespuesta> {
  const esquema =
    '{"ncm":"","confirma":false,"justificacion":"","descartadas":[{"ncm":"","motivo":""}],"faltaDato":null,"opciones":[]}';
  const notaPartida = args.eleccionPartida
    ? `PARTIDA ELEGIDA (Paso 1): ${args.eleccionPartida}\n\n`
    : "";
  const user =
    `${args.hechos}\n\n` +
    `${notaPartida}` +
    `MARCO LEGAL (RGI, notas, nomenclador):\n${args.marcoLegal}\n\n` +
    `POSICIONES CANDIDATAS (solo estas; no inventes otras):\n${bloquePaqueteCandidatos([args.bloque])}\n\n` +
    `JSON:\n${esquema}`;
  return pedir(SYSTEM_CRUCE_SIM, user, 900);
}

/** Agrupa SIMs por subpartida (8 dígitos) para que la IA compare hermanas sin perder el menú completo. */
function prefijoSubpartida(codigo: string): string {
  return prefijoSubpartidaCodigo(codigo);
}

function encabezadoTipificacionLegal(
  sims: Array<{ codigo: string; descripcion?: string; ruta?: string }>,
): string {
  return encabezadoTipificacionGrupo(sims);
}

/** Grupos con tipificación nominal antes que cadenas enteras de encabezados residuales. */
function prioridadGrupoListado(
  sims: Array<{ codigo: string; descripcion?: string; ruta?: string }>,
): number {
  return tipificacionGrupoEsGenerica(sims) ? 1 : 0;
}

function bloquePaqueteCandidatos(bloques: BloqueCandidatos[]): string {
  return bloques
    .map((b) => {
      const porSub = new Map<string, typeof b.sims>();
      for (const s of b.sims) {
        const k = prefijoSubpartida(s.codigo);
        const arr = porSub.get(k) ?? [];
        arr.push(s);
        porSub.set(k, arr);
      }
      const lista = [...porSub.entries()]
        .sort(([subA, simsA], [subB, simsB]) => {
          const pa = prioridadGrupoListado(simsA);
          const pb = prioridadGrupoListado(simsB);
          if (pa !== pb) return pa - pb;
          return subA.localeCompare(subB);
        })
        .map(([sub, sims]) => {
          const tip = encabezadoTipificacionLegal(sims);
          const lineas = formatearGrupoSimsListado(sims);
          const tipLine = tip ? `  Tipificación legal: ${tip}\n` : "";
          return `[${sub}]\n${tipLine}${lineas}`;
        })
        .join("\n\n");
      return `PARTIDA ${b.partida}: ${b.partidaDesc}\n${lista}`;
    })
    .join("\n\n");
}

async function cerrarSimsEnPartida(args: {
  hechos: string;
  marcoLegal: string;
  bloque: BloqueCandidatos;
  partida: string;
}): Promise<IaRespuesta> {
  const paso2 = await cruzarSimsEnPartida({
    hechos: args.hechos,
    bloque: args.bloque,
    marcoLegal: args.marcoLegal,
    eleccionPartida: args.partida,
  });

  const faltaDisc = faltaDiscriminanteEntreHermanas(args.bloque, args.hechos);
  if (faltaDisc && paso2.confirma !== true) {
    return {
      confirma: false,
      faltaDato: faltaDisc.faltaDato,
      opciones: faltaDisc.opciones,
      partida: args.partida,
    };
  }

  const ncmIa = paso2.ncm?.trim();
  if (ncmIa && paso2.confirma === true) {
    const corregida = ncmPreferidaPorCadenaSegmentosHechos(args.hechos, [args.bloque], ncmIa);
    if (corregida && corregida !== ncmIa) {
      // La justificación/descartadas de la IA describen `ncmIa`; se regeneran aguas abajo.
      return {
        ...paso2,
        ncm: corregida,
        justificacion: undefined,
        descartadas: undefined,
        partida: args.partida,
      };
    }
  }

  return { ...paso2, ncm: ncmIa, partida: args.partida };
}

/**
 * Cruce legal en dos pasos: partida → NCM dentro de esa partida.
 * Con una sola partida candidata, salta el paso 1.
 */
export async function cruzarCandidatos(args: {
  hechos: string;
  bloques: BloqueCandidatos[];
  marcoLegal: string;
}): Promise<IaRespuesta> {
  if (!args.bloques.length) {
    return { confirma: false, faltaDato: null, justificacion: "Sin partidas candidatas." };
  }

  if (args.bloques.length === 1) {
    return cerrarSimsEnPartida({
      hechos: args.hechos,
      bloque: args.bloques[0]!,
      marcoLegal: args.marcoLegal,
      partida: args.bloques[0]!.partida,
    });
  }

  const paso1 = await cruzarPartida(args);
  if (paso1.confirma !== true || !paso1.partida?.trim()) {
    const partidaFb =
      partidaPreferidaPorCadenaHechos(args.bloques, args.hechos) ??
      partidaPreferidaPorRankingClaro(args.bloques, args.hechos);
    if (partidaFb) {
      const bloqueFb = args.bloques.find((b) => b.partida === partidaFb);
      if (bloqueFb) {
        return cerrarSimsEnPartida({
          hechos: args.hechos,
          bloque: bloqueFb,
          marcoLegal: args.marcoLegal,
          partida: partidaFb,
        });
      }
    }
    return paso1;
  }

  let partida = paso1.partida.replace(/\D/g, "").slice(0, 4);
  // Correcciones de partida por encaje léxico con HECHOS (retrieval, general; no por dominio).
  const corregidaNom = partidaCorregidaPorTipificacionNominal(args.bloques, args.hechos, partida);
  if (corregidaNom) partida = corregidaNom;
  // La cadena facturada prevalece sobre coincidencias en calificadores posteriores.
  const corregidaSeg = partidaCorregidaPorSegmentosHechos(args.bloques, args.hechos, partida);
  if (corregidaSeg) partida = corregidaSeg;
  const corregidaCadena = partidaPreferidaPorCadenaHechos(args.bloques, args.hechos);
  if (corregidaCadena) partida = corregidaCadena;

  const bloque = args.bloques.find((b) => b.partida === partida);
  if (!bloque) {
    return {
      confirma: false,
      faltaDato: null,
      justificacion: `La partida sugerida (${paso1.partida}) no está en el listado del nomenclador.`,
    };
  }

  return cerrarSimsEnPartida({
    hechos: args.hechos,
    bloque,
    marcoLegal: args.marcoLegal,
    partida,
  });
}
