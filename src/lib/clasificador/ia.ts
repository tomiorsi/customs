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
} from "./motor";
import {
  CRITERIO_PARQUET,
  INSTRUCCION_CRUCE,
  INSTRUCCION_LECTURA_LISTADO,
  PRINCIPIO_ARTICULO_CLASIFICADO,
  PRINCIPIO_HECHOS,
  PRINCIPIO_HIPOTESIS_EN_DISPUTA,
  PRINCIPIO_PARTIDA_ESPECIFICA,
  PRINCIPIO_CIERRE,
  REGLA_LINEAS_RESIDUALES,
  REGLA_OPCIONES_SIN_CLASIFICACION,
  REGLAS_FASE1_PLAN,
  REGLAS_FASE2_PROPUESTAS,
} from "./principios-clasificacion";
import { registrarUsoTokens } from "./costo-ia";

const MODELO = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

const SYSTEM_FASE1 =
  "Clasificador NCM Argentina.\n" +
  PRINCIPIO_ARTICULO_CLASIFICADO +
  PRINCIPIO_HECHOS +
  PRINCIPIO_PARTIDA_ESPECIFICA +
  REGLA_OPCIONES_SIN_CLASIFICACION +
  REGLAS_FASE1_PLAN +
  "\nJSON: hechosCompletos (boolean), preguntas (array; cada ítem con id, pregunta, opciones, rutas). Devolvé el array completo con todas las preguntas del árbol simultáneamente.\n";

const SYSTEM_FASE2 =
  "Clasificador NCM Argentina.\n" +
  PRINCIPIO_ARTICULO_CLASIFICADO +
  PRINCIPIO_HECHOS +
  PRINCIPIO_PARTIDA_ESPECIFICA +
  PRINCIPIO_HIPOTESIS_EN_DISPUTA +
  REGLAS_FASE2_PROPUESTAS +
  "\nJSON: propuestas (array de {ncm}). Máximo 6 NCMs.\n";

const SYSTEM_CRUCE =
  "Clasificador NCM Argentina — Fase 3 cruce legal.\n" +
  INSTRUCCION_CRUCE +
  "JSON: ncm, confirma, descripcion, justificacion.\n";

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
    return extraerJson(await llamarUnaVezRaw(systemFinal, user, maxTokens));
  }
}

function bloquePartidasCandidatas(candidatas: PartidaCandidata[]): string {
  return candidatas
    .map((c) => {
      const subs = c.subpartidas?.length
        ? "\n" +
          c.subpartidas
            .map((s) => `    ↳ ${s.codigo}: ${s.descripcion}`)
            .join("\n")
        : "";
      return `- ${c.partida}: ${c.descripcion}${subs}`;
    })
    .join("\n");
}

export type BloquePartidaPosiciones = {
  partida: string;
  partidaDesc: string;
  candidatos: CandidatoNcm[];
};

function bloquePosicionesPartidas(bloques: BloquePartidaPosiciones[]): string {
  return bloques
    .map((b) => {
      const lista = b.candidatos
        .map((c) => `- ${c.codigo} | ${textoLegalResumido(c)}`)
        .join("\n");
      return `PARTIDA ${b.partida}: ${b.partidaDesc}\n${lista}`;
    })
    .join("\n\n");
}

/** Fase 1: plan de hechos (hasta 5 preguntas en árbol, una sola llamada). */
export async function planificarHechos(
  estado: string,
  candidatas: PartidaCandidata[],
  opts?: { sinPropuestasEnParquet?: boolean; justificacionRechazo?: string },
): Promise<IaRespuesta> {
  const esRetry = !!opts?.justificacionRechazo;
  const esquema = esRetry
    ? '{"hechosCompletos":false,"preguntas":[{"id":"1","pregunta":"","opciones":["A","B"],"rutas":[{"opcion":"A","consecuencia":"listo"},{"opcion":"B","consecuencia":"listo"}]}]}'
    : '{"hechosCompletos":false,"preguntas":[{"id":"1","pregunta":"","opciones":["A","B"],"rutas":[{"opcion":"A","consecuencia":"pregunta:2"},{"opcion":"B","consecuencia":"listo"}]},{"id":"2","pregunta":"","opciones":["C","D"],"rutas":[{"opcion":"C","consecuencia":"listo"}]}]}';
  const notaRetry = opts?.justificacionRechazo
    ? "\n\nATENCIÓN: el nomenclador ya tiene propuestas pero las rechazó porque falta UN dato específico en HECHOS. " +
      "Motivo exacto del rechazo: " + opts.justificacionRechazo.slice(0, 400) +
      "\nGenerá UNA SOLA PREGUNTA (preguntas con exactamente 1 elemento) que pida ese dato puntual con opciones mutuamente excluyentes. " +
      "No regeneres el árbol completo. El esquema es hechosCompletos:false, preguntas:[{id:\"1\", ...}].\n"
    : opts?.sinPropuestasEnParquet
    ? "\n\nATENCIÓN: ninguna posición del nomenclador encajó con los HECHOS actuales. " +
      "Replanificá el cuestionario: hechosCompletos:false y preguntas con lo que aún falta.\n"
    : "";
  const user =
    `${estado}${notaRetry}\n\n` +
    `PARTIDAS CANDIDATAS (qué datos pueden faltar):\n` +
    `${bloquePartidasCandidatas(candidatas)}\n\n` +
    `JSON:\n${esquema}`;
  return pedir(SYSTEM_FASE1, user, 1300);
}


function bloquePartidasDescartadas(
  descartadas: Array<{ partida: string; motivo?: string }>,
): string {
  if (!descartadas.length) return "";
  const lineas = descartadas.map((d) => {
    const motivo = (d.motivo ?? "").trim();
    const breve =
      motivo.length > 160 ? `${motivo.slice(0, 157).trim()}…` : motivo;
    return `- ${d.partida}${breve ? `: ${breve}` : ""}`;
  });
  return (
    "PARTIDAS DESCARTADAS (cruce legal previo; no proponer NCM de estas partidas):\n" +
    `${lineas.join("\n")}\n\n`
  );
}

/** Fase 2: NCM del parquet que encajan con HECHOS completos. */
export async function identificarPropuestas(args: {
  estado: string;
  partidas: BloquePartidaPosiciones[];
  partidasDescartadas?: Array<{ partida: string; motivo?: string }>;
  sinPropuestasAnterior?: boolean;
}): Promise<IaRespuesta> {
  const esquema = '{"propuestas":[{"ncm":""}]}';
  const notaRetry = args.sinPropuestasAnterior
    ? "ATENCIÓN: en el intento anterior no hubo propuestas. " +
      "Revisá TODAS las partidas del listado e incluí cada NCM cuyo texto legal encaje con HECHOS.\n\n"
    : "";
  // Si hay candidatos de múltiples partidas, avisar a la IA que evalúe cada una
  // e intente cubrir más de una familia cuando varias puedan encajar.
  // Límite explícito de propuestas para evitar truncamiento de JSON.
  const notaMultiPartidas =
    args.partidas.length >= 2
      ? `Hay candidatos de ${args.partidas.length} partidas distintas. Evaluá el encabezado de CADA PARTIDA (no solo las líneas individuales). Si el encabezado describe el tipo o función del artículo, incluí al menos un NCM de esa partida en propuestas. Máximo 6 propuestas en total.\n\n`
      : "";
  const user =
    `${args.estado}\n\n` +
    `${notaRetry}` +
    `${notaMultiPartidas}` +
    "Solo NCM que aparecen en el listado de posiciones provisto (no inventes códigos).\n\n" +
    `${bloquePartidasDescartadas(args.partidasDescartadas ?? [])}` +
    `${bloquePosicionesPartidas(args.partidas)}\n\n` +
    `JSON:\n${esquema}`;
  return pedir(SYSTEM_FASE2, user, 400);
}

// ─── Pipeline simplificado: un solo cruce legal ──────────────────────────────

const SYSTEM_CRUCE_DIRECTO =
  "Clasificador NCM Argentina.\n" +
  PRINCIPIO_ARTICULO_CLASIFICADO +
  PRINCIPIO_HECHOS +
  PRINCIPIO_PARTIDA_ESPECIFICA +
  PRINCIPIO_CIERRE +
  CRITERIO_PARQUET +
  INSTRUCCION_LECTURA_LISTADO +
  REGLA_LINEAS_RESIDUALES +
  REGLA_OPCIONES_SIN_CLASIFICACION +
  "NO REPITAS: Si HECHOS ya contiene una respuesta sobre completitud, función, material u otro dato, NO hagas una pregunta sobre ese mismo dato.\n" +
  "TAREA (una sola respuesta):\n" +
  "1. Si HECHOS permite elegir → ncm (literal del listado), confirma:true, justificacion (breve; cita RGI y motivo principal), descartadas (MÁXIMO 3 alternativas con motivo legal breve). Antes de cerrar, recorré el listado: si alguna «Tipificación legal» encaja con el tipo u operación declarada en HECHOS, elegí un NCM de esa rama y no una residual global de la partida.\n" +
  "2. Si falta UN dato factual para decidir entre candidatos específicos → confirma:false, faltaDato (una sola pregunta), opciones (máx 4). Si HECHOS ya alcanza para una línea específica (RGI 3 a)), confirma:true; no elijas residual por defecto.\n" +
  "3. Si ningún candidato encaja → confirma:false, faltaDato:null.\n" +
  "Solo NCM del listado provisto. Nunca inventes códigos.\n";

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

/**
 * Cruce legal en una sola llamada a la IA.
 * El motor entrega partidas candidatas con todas sus SIMs; la IA elige el NCM o pide un dato que falta.
 */
export async function cruzarCandidatos(args: {
  hechos: string;
  bloques: BloqueCandidatos[];
  marcoLegal: string;
}): Promise<IaRespuesta> {
  const esquema =
    '{"ncm":"","confirma":false,"justificacion":"","descartadas":[{"ncm":"","motivo":""}],"faltaDato":null,"opciones":[]}';
  const user =
    `${args.hechos}\n\n` +
    `MARCO LEGAL (RGI, notas, nomenclador):\n${args.marcoLegal}\n\n` +
    `POSICIONES CANDIDATAS (solo estas; no inventes otras):\n${bloquePaqueteCandidatos(args.bloques)}\n\n` +
    `JSON:\n${esquema}`;
  return pedir(SYSTEM_CRUCE_DIRECTO, user, 1200);
}

// ─────────────────────────────────────────────────────────────────────────────

/** Fase 3: cruce legal entre propuestas. */
export async function cruzarPropuestas(args: {
  producto: string;
  propuestas: PropuestaCruce[];
  marcoLegal: string;
}): Promise<IaRespuesta> {
  const bloques = args.propuestas
    .map(
      (p, i) =>
        `PROPUESTA ${i + 1}: partida ${p.partida} — ${p.partidaDesc}\n` +
        `NCM: ${p.ncm}\n` +
        (p.descripcion ? `${p.descripcion}\n` : ""),
    )
    .join("\n");
  const multi = args.propuestas.length >= 2;
  const esquema = multi
    ? '{"ncm":"","confirma":false,"descripcion":"","justificacion":"","descartadas":[{"ncm":"","motivo":""}]}'
    : '{"ncm":"","confirma":false,"descripcion":"","justificacion":""}';
  const notaMulti = multi
    ? "HAY VARIAS PROPUESTAS: elegí UNA (ncm) aplicando RGI y notas del MARCO LEGAL.\n" +
      "En descartadas: cada NCM no elegida con motivo legal.\n\n"
    : "UNA SOLA PROPUESTA: confirma:true solo si el texto legal completo encaja con HECHOS; " +
      "confirma:false si la línea exige una condición no escrita en HECHOS.\n\n";
  const user =
    `PRODUCTO Y HECHOS:\n${args.producto}\n\n` +
    `${notaMulti}` +
    `MARCO LEGAL (RGI, notas, nomenclador):\n${args.marcoLegal}\n\n` +
    `PROPUESTAS (${args.propuestas.length}):\n${bloques}\nJSON:\n${esquema}`;
  return pedir(SYSTEM_CRUCE, user, 950);
}
