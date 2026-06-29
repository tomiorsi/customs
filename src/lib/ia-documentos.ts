import "server-only";
import {
  consolidarListaContenedores,
  detectarContenedorISO,
  extraerCodigosContenedor,
  normalizarViaCanon,
  resolverConflictosContenedor,
  type TipoContenedor,
  type ViaCanon,
} from "./costos-logistica";
import { DOC_LABELS, clasificarPorNombre, docLabelDe, type DocType } from "./docs";
import {
  contextoFechaReferenciaIA,
  hoyIsoArgentina,
  parseFechaComercial,
} from "./fechas";
import { enriquecerFormaPagoComercial } from "./pago-mercaderia";
import { contextoArticulosIA } from "./normas";
import { REF_APERTURA } from "./normas-registro";
import { contextoRetiroTransporteIA } from "./retiro-transporte";
import { nombrePaisCanonico, buscarPais } from "@/lib/cotizador";
import type { DocumentRow } from "./data";
import { extraccionDocVigente, parseExtraccionDoc } from "./data";
import { rawDatosDesdeCache } from "./extraccion-doc-cache";
/**
 * Lectura de documentos comerciales (proforma / factura / packing / BL) con
 * Claude. Soporta imágenes (jpg, png, webp, gif) y PDF. Devuelve datos
 * estructurados para pre-cargar la operación, más alertas y una NCM sugerida.
 */

// Modelo barato para tareas de TEXTO (clasificación, interpretación, arbitraje).
export const MODELO = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
/** Visión en lectura de PDFs: siempre Haiku salvo override explícito. */
export const MODELO_LECTURA =
  process.env.ANTHROPIC_MODEL_LECTURA || "claude-haiku-4-5";

export function iaDocsDisponible(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type ArchivoIA = {
  /** Rol del documento, para que el modelo sepa qué está mirando. */
  rol: string;
  nombre: string;
  mediaType: string;
  base64: string;
};

export type CampoExtraido = keyof typeof CAMPOS_LABEL;

export const CAMPOS_LABEL = {
  contraparte: "Vendedor / exportador (importación)",
  pais_origen: "País de origen (producción)",
  pais_adquisicion: "País de adquisición (quién factura)",
  via: "Vía de transporte",
  mercaderia: "Descripción de la mercadería",
  ncm: "NCM (si figura en el documento)",
  marca: "Marca",
  cantidad: "Cantidad",
  unidad: "Unidad",
  bultos: "Bultos",
  tipo_embalaje: "Tipo de embalaje",
  peso_neto: "Peso neto (con unidad)",
  peso_bruto: "Peso bruto (con unidad)",
  volumen_cbm: "Volumen total (m³ / CBM)",
  incoterm: "Incoterm",
  moneda: "Moneda",
  valor_factura: "Valor de la factura (total)",
  valor_fob: "Valor FOB",
  valor_cif: "Valor CIF",
  flete: "Flete",
  seguro: "Seguro",
  forma_pago: "Forma de pago",
  liberacion_doc: "Liberación del transporte (origen/destino · original/telex)",
  fecha_factura: "Fecha de factura",
  plazo_pago_dias: "Plazo de pago (días)",
  contenedor: "Contenedor (números / detalle)",
  tipo_contenedor: "Tipo de contenedor",
  cantidad_contenedores: "Cantidad de contenedores",
} as const;

export type Alerta = { nivel: "ok" | "warn" | "error"; texto: string };

/** Datos que el cliente cargó al abrir la operación (base a contrastar). */
export type DatosCliente = {
  via?: string | null;
  forma_pago?: string | null;
  pais?: string | null;
  mercaderia?: string | null;
  estado?: string | null;
  incoterm?: string | null;
};

/** Estado de un campo al comparar lo que cargó el cliente vs. lo del documento. */
export type EstadoComparacion =
  | "igual" // coinciden
  | "difiere" // el cliente puso una cosa y el documento dice otra
  | "solo_cliente" // sólo lo cargó el cliente (el documento no lo aporta)
  | "solo_documento"; // dato nuevo del documento (el cliente no lo había puesto)

/** Comparación campo a campo: base del cliente contra lo leído del documento. */
export type CampoComparado = {
  campo: CampoExtraido;
  label: string;
  cliente: string;
  documento: string;
  estado: EstadoComparacion;
};

export type AperturaIA = {
  tipo_documento:
    | "pedido_compra"
    | "proforma"
    | "factura_comercial"
    | "desconocido";
  resumen: string;
  campos: Partial<Record<CampoExtraido, string>>;
  /** Base del cliente vs. documento, para que el operador dé el OK final. */
  comparacion: CampoComparado[];
  /**
   * Veredicto SEMÁNTICO de la IA para los campos ruidosos: true = dicen lo mismo
   * (aunque cambie el idioma o el instrumento), false = se contradicen de verdad.
   */
  equivalencias?: {
    forma_pago?: boolean;
    mercaderia?: boolean;
  } | null;
  cruce_packing?: string | null;
  alertas: Alerta[];
};

export type LineaCostoForwarder = {
  concepto: string;
  categoria:
    | "flete_internacional"
    | "seguro"
    | "gasto_origen"
    | "gasto_destino"
    | "gasto_documental"
    | "contingencia"
    | "otro";
  monto: number | null;
  moneda: string | null;
  ivaPct?: number | null;
  nota?: string | null;
};

export type CostosForwarderIA = {
  tipo_documento:
    | "cotizacion_forwarder"
    | "factura_gastos"
    | "seguro"
    | "desconocido";
  resumen: string;
  direccion: "importacion" | "exportacion" | "desconocido";
  via: "maritima" | "aerea" | "terrestre" | "desconocida";
  incoterm: string | null;
  moneda: string | null;
  flete: number | null;
  seguro: number | null;
  seguroIncluido: boolean;
  seguroNoIncluido: boolean;
  gastosOrigen: number | null;
  gastosDestino: number | null;
  gastosDocumentales: number | null;
  ivaGastos: number | null;
  totalGastosLocales: number | null;
  lineas: LineaCostoForwarder[];
  contingencias: string[];
  alertas: Alerta[];
};

function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** ¿Dos valores dicen "lo mismo"? Comparación tolerante (acentos, mayúsculas, contiene). */
function valoresEquivalentes(a: string, b: string): boolean {
  const x = normalizarTexto(a);
  const y = normalizarTexto(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * Compara lo que cargó el cliente al abrir (base) contra lo que extrajo la IA del
 * documento. No decide nada: deja la diferencia visible para que el operador dé
 * el OK final. El cliente sólo carga algunos campos (vía, pago, país, mercadería,
 * Incoterm), así que comparamos exactamente esos.
 *
 * Vía, país de origen e Incoterm son campos estructurados: alcanza con un match
 * tolerante (string). En cambio FORMA DE PAGO y MERCADERÍA generan diferencias
 * FALSAS con string-match (instrumento vs. condición de pago, o un producto
 * escrito en otro idioma): para esos usamos el veredicto SEMÁNTICO de la
 * IA y, ante la duda (sin veredicto), preferimos "igual" para no meter ruido.
 */
function compararCamposCliente(
  campos: Partial<Record<CampoExtraido, string>>,
  datos?: DatosCliente | null,
  equivalencias?: { forma_pago?: boolean; mercaderia?: boolean } | null,
): CampoComparado[] {
  if (!datos) return [];
  const pares: { campo: CampoExtraido; cliente?: string | null }[] = [
    { campo: "via", cliente: datos.via },
    { campo: "forma_pago", cliente: datos.forma_pago },
    { campo: "pais_origen", cliente: datos.pais },
    { campo: "mercaderia", cliente: datos.mercaderia },
    { campo: "incoterm", cliente: datos.incoterm },
  ];
  // Campos donde el string-match miente: confiamos en el veredicto de la IA.
  // undefined ⇒ true (no marcamos diferencia sin una contradicción real).
  const semantico: Partial<Record<CampoExtraido, boolean>> = {
    forma_pago: equivalencias?.forma_pago ?? true,
    mercaderia: equivalencias?.mercaderia ?? true,
  };
  const out: CampoComparado[] = [];
  for (const { campo, cliente } of pares) {
    const cli = (cliente ?? "").trim();
    const doc = (campos[campo] ?? "").trim();
    if (!cli && !doc) continue;
    let estado: EstadoComparacion;
    if (cli && doc) {
      const equivalente =
        campo in semantico
          ? (semantico[campo] as boolean) || valoresEquivalentes(cli, doc)
          : valoresEquivalentes(cli, doc);
      estado = equivalente ? "igual" : "difiere";
    } else if (cli) {
      estado = "solo_cliente";
    } else {
      estado = "solo_documento";
    }
    out.push({ campo, label: CAMPOS_LABEL[campo], cliente: cli, documento: doc, estado });
  }
  return out;
}

const MEDIA_IMG = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

type Bloque =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    }
  | {
      type: "document";
      source: { type: "base64"; media_type: "application/pdf"; data: string };
    };

type MetaLlamadaClaude = { etiqueta: string; detalle?: string; modelo?: string };

function contenidoUsaVision(contenido: Bloque[]): boolean {
  return contenido.some((b) => b.type === "document" || b.type === "image");
}

async function llamarClaudeRaw(
  system: string,
  contenido: Bloque[],
  maxTokens: number,
  meta?: MetaLlamadaClaude,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");

  const model =
    meta?.modelo ?? (contenidoUsaVision(contenido) ? MODELO_LECTURA : MODELO);

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: "user", content: contenido }],
    }),
  });

  if (!resp.ok) {
    const detalle = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${detalle.slice(0, 300)}`);
  }

  const data = (await resp.json()) as {
    content?: Array<{ text?: string }>;
  };

  return data.content?.[0]?.text?.trim() ?? "";
}

async function llamarClaude(
  system: string,
  contenido: Bloque[],
  maxTokens: number,
  meta?: MetaLlamadaClaude,
): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");

  const txt = await llamarClaudeRaw(system, contenido, maxTokens, meta);
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("La IA no devolvió un JSON válido.");
  return parsearJsonIA(m[0], apiKey, meta?.etiqueta);
}

/**
 * Lee bloques de contenido (texto + imágenes/PDF) y devuelve transcripción plana.
 */
export async function leerContenidoConVision(
  contenido: Bloque[],
  maxTokens: number,
  meta: MetaLlamadaClaude,
  opts?: { system?: string; modelo?: string },
): Promise<string> {
  const system =
    opts?.system ??
    "Leé el documento adjunto y transcribí todo lo que veas, tal como aparece. " +
    "Devolvé solo la transcripción literal, sin markdown, sin JSON y sin comentarios.";
  return llamarClaudeRaw(system, contenido, maxTokens, {
    ...meta,
    modelo: opts?.modelo ?? meta.modelo,
  });
}

/**
 * Lee un PDF o imagen y devuelve texto plano — sin JSON ni esquema.
 * Mismo enfoque que leer el adjunto en el chat: pasás el doc, transcribís.
 */
export async function leerArchivoConVision(
  archivo: ArchivoIA,
  maxTokens: number,
  meta: MetaLlamadaClaude,
  opts?: { userText?: string; system?: string; modelo?: string },
): Promise<string> {
  const bloque = bloqueDeArchivo(archivo);
  if (!bloque) throw new Error("Archivo no legible para visión");
  const userText = opts?.userText ?? archivo.nombre;
  return leerContenidoConVision(
    [{ type: "text", text: userText }, bloque],
    maxTokens,
    meta,
    opts?.system || opts?.modelo
      ? { system: opts.system, modelo: opts.modelo }
      : undefined,
  );
}

/** Llamada Sonnet/Haiku con PDF o imagen adjunta. */
export async function llamarClaudeVision(
  system: string,
  archivo: ArchivoIA,
  userText: string,
  maxTokens: number,
  meta: MetaLlamadaClaude,
): Promise<Record<string, unknown>> {
  const bloque = bloqueDeArchivo(archivo);
  if (!bloque) throw new Error("Archivo no legible para visión");
  return llamarClaude(
    system,
    [{ type: "text", text: userText }, bloque],
    maxTokens,
    meta,
  );
}

/** Llamada IA solo texto (modelo barato); sin PDFs ni imágenes. */
export async function invocarIATexto(
  system: string,
  userText: string,
  maxTokens: number,
  meta: MetaLlamadaClaude,
): Promise<Record<string, unknown>> {
  return llamarClaude(system, [{ type: "text", text: userText }], maxTokens, meta);
}

/** Texto plano (sin JSON) — arbitraje, transcripciones. */
export async function invocarIATextoPlano(
  system: string,
  userText: string,
  maxTokens: number,
  meta: MetaLlamadaClaude,
): Promise<string> {
  return llamarClaudeRaw(system, [{ type: "text", text: userText }], maxTokens, meta);
}

function repararJsonSimple(raw: string): string {
  return raw
    // Comas colgantes antes de cerrar objetos/arrays.
    .replace(/,\s*([}\]])/g, "$1")
    // Caracteres invisibles que a veces se cuelan en respuestas largas.
    .replace(/[\u0000-\u001F]+/g, " ")
    .trim();
}

async function parsearJsonIA(
  raw: string,
  apiKey: string,
  origenEtiqueta?: string,
): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const simple = repararJsonSimple(raw);
    try {
      return JSON.parse(simple) as Record<string, unknown>;
    } catch (e) {
      const reparado = await repararJsonConClaude(simple, apiKey, origenEtiqueta);
      try {
        return JSON.parse(reparado) as Record<string, unknown>;
      } catch {
        const detalle = e instanceof Error ? e.message : "JSON inválido";
        const ctx = origenEtiqueta ? ` (${origenEtiqueta})` : "";
        throw new Error(
          `La IA devolvió un JSON mal formado${ctx}: ${detalle}. ` +
            "Suele pasar si la respuesta se cortó por tamaño; probá de nuevo.",
        );
      }
    }
  }
}

async function repararJsonConClaude(
  raw: string,
  apiKey: string,
  origenEtiqueta?: string,
): Promise<string> {
  const system =
    "Sos un reparador estricto de JSON. Recibís un JSON inválido y devolvés " +
    "el mismo contenido convertido a JSON válido. No agregues explicación, " +
    "markdown ni campos nuevos.";
  const userText =
    "Repará este JSON y devolvé exclusivamente el objeto JSON válido:\n\n" + raw;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: Math.min(8192, Math.max(2500, Math.ceil(raw.length / 2.5))),
      temperature: 0,
      system,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: userText }],
        },
      ],
    }),
  });

  if (!resp.ok) return raw;
  const data = (await resp.json()) as {
    content?: Array<{ text?: string }>;
  };

  const txt = data.content?.[0]?.text?.trim() ?? raw;
  return txt.match(/\{[\s\S]*\}/)?.[0] ?? txt;
}

function bloqueDeArchivo(a: ArchivoIA): Bloque | null {
  if (a.mediaType === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: a.base64 },
    };
  }
  if (MEDIA_IMG.has(a.mediaType)) {
    return {
      type: "image",
      source: { type: "base64", media_type: a.mediaType, data: a.base64 },
    };
  }
  return null;
}

/** Analiza los documentos de apertura y devuelve datos estructurados. */
export async function analizarApertura(
  archivos: ArchivoIA[],
  tipoOperacion: string,
  datosCliente?: DatosCliente | null,
): Promise<AperturaIA> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");

  const utilizables = archivos
    .map((a) => ({ a, b: bloqueDeArchivo(a) }))
    .filter((x): x is { a: ArchivoIA; b: Bloque } => x.b !== null);

  if (utilizables.length === 0) {
    throw new Error("No hay documentos legibles (subí PDF o imagen).");
  }

  const esExpo = tipoOperacion.toLowerCase().startsWith("exp");

  const system =
    "Sos despachante de aduana argentino. Te paso documentos de apertura de una " +
    (esExpo ? "EXPORTACIÓN" : "IMPORTACIÓN") +
    " (Paso 1: cotización preliminar). Extraé los datos del JSON, contrastá con la " +
    "base del cliente si te la paso, y devolvé alertas accionables.\n" +
    contextoRetiroTransporteIA(datosCliente?.via, datosCliente?.forma_pago) +
    "\nRespondé EXCLUSIVAMENTE JSON válido.\n";

  const esquema =
    "{" +
    '"tipo_documento":"pedido_compra|proforma|factura_comercial|desconocido",' +
    '"resumen":"2-3 frases con lo esencial de la operación",' +
    '"campos":{' +
    '"contraparte":"","pais_origen":"","pais_adquisicion":"","via":"","mercaderia":"","ncm":"","marca":"",' +
    '"cantidad":"","unidad":"","bultos":"","tipo_embalaje":"","peso_neto":"",' +
    '"peso_bruto":"","volumen_cbm":"","incoterm":"","moneda":"","valor_factura":"",' +
    '"valor_fob":"","valor_cif":"","flete":"","seguro":"","forma_pago":"","liberacion_doc":"","contenedor":"",' +
    '"tipo_contenedor":"","cantidad_contenedores":""},' +
    '"equivalencias":{"forma_pago":true,"mercaderia":true},' +
    '"cruce_packing":"texto o null",' +
    '"alertas":[{"nivel":"ok|warn|error","texto":""}]' +
    "}";

  const baseCliente = datosCliente
    ? [
        datosCliente.via && `- Vía: ${datosCliente.via}`,
        datosCliente.forma_pago && `- Forma de pago: ${datosCliente.forma_pago}`,
        datosCliente.pais && `- País: ${datosCliente.pais}`,
        datosCliente.mercaderia && `- Mercadería: ${datosCliente.mercaderia}`,
        datosCliente.estado && `- Estado: ${datosCliente.estado}`,
        datosCliente.incoterm && `- Incoterm: ${datosCliente.incoterm}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  // Grounding: texto literal de los artículos de origen/triangulación del ROM.
  const marcoNormativo = await contextoArticulosIA(REF_APERTURA);

  const contenido: Bloque[] = [
    {
      type: "text",
      text:
        (marcoNormativo ? marcoNormativo + "\n\n" : "") +
        (baseCliente
          ? "Datos que cargó el cliente al abrir (BASE a contrastar con los " +
            "documentos):\n" +
            baseCliente +
            "\n\n"
          : "") +
        "Documentos adjuntos:\n" +
        utilizables.map((x) => `- ${x.a.rol}: ${x.a.nombre}`).join("\n") +
        "\n\nDevolvé el JSON con EXACTAMENTE este formato (omití claves de " +
        "'campos' que no encuentres):\n" +
        esquema,
    },
    ...utilizables.map((x) => x.b),
  ];

  const parsed = (await llamarClaude(system, contenido, 1500, {
    etiqueta: "apertura.analisis-docs",
    detalle: `${utilizables.length} archivo(s)`,
  })) as AperturaIA;
  // Limpiamos campos vacíos para no pisar datos con "".
  const campos = parsed.campos ?? {};
  for (const k of Object.keys(campos) as CampoExtraido[]) {
    const v = campos[k];
    if (v == null || String(v).trim() === "") delete campos[k];
  }

  // Normalizamos el tipo de contenedor a un valor canónico. Si la IA no devolvió
  // uno válido, lo inferimos del texto de 'contenedor', 'tipo_embalaje' o la vía.
  const VALIDOS: TipoContenedor[] = [
    "20STD", "40STD", "40HC", "20RF", "40RF", "LCL", "AEREO",
  ];
  const tcRaw = (campos.tipo_contenedor ?? "").toUpperCase().replace(/\s/g, "");
  let tipoCont: TipoContenedor | null = VALIDOS.includes(tcRaw as TipoContenedor)
    ? (tcRaw as TipoContenedor)
    : null;
  if (!tipoCont) {
    tipoCont =
      detectarContenedorISO(campos.tipo_contenedor) ??
      detectarContenedorISO(campos.contenedor) ??
      detectarContenedorISO(campos.tipo_embalaje);
  }
  if (tipoCont) campos.tipo_contenedor = tipoCont;
  else delete campos.tipo_contenedor;

  // Normalizamos la vía a uno de los valores válidos (define el paso a paso).
  if (campos.via) {
    const raw = campos.via.toLowerCase();
    let via: "maritima" | "aerea" | "terrestre" | null = null;
    if (/mar[íi]tim|sea|ocean|vessel|buque|fob|cif|cfr|fas/.test(raw)) via = "maritima";
    else if (/a[ée]re|air|awb|gu[íi]a a[ée]rea|avi[óo]n/.test(raw)) via = "aerea";
    else if (/terrestre|camion|cami[óo]n|road|truck|crt|frontera|carretera/.test(raw)) via = "terrestre";
    if (via) campos.via = via;
    else delete campos.via;
  }

  parsed.campos = campos;
  if (!Array.isArray(parsed.alertas)) parsed.alertas = [];
  // Comparación base del cliente vs. documento (la decisión final es del operador).
  parsed.comparacion = compararCamposCliente(
    campos,
    datosCliente,
    parsed.equivalencias,
  );
  return parsed;
}

/**
 * Primera vez con un producto: arma una DESCRIPCIÓN TÉCNICA para clasificar,
 * combinando lo que cargó el cliente con los documentos del paso 1 (proforma,
 * pedido, factura, ficha técnica/catálogo, packing). NO clasifica ni devuelve
 * NCM: solo consolida los datos relevantes para que después el nomenclador
 * decida (o pregunte). Si no hay documentos legibles, devuelve la descripción
 * del cliente tal cual.
 */
export async function describirProductoDesdeDocs(
  archivos: ArchivoIA[],
  descripcionCliente: string,
): Promise<string> {
  const base = (descripcionCliente ?? "").trim();
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const adjuntos = (archivos ?? [])
    .map((a) => ({ a, b: bloqueDeArchivo(a) }))
    .filter((x): x is { a: ArchivoIA; b: Bloque } => x.b !== null);

  if (!apiKey || adjuntos.length === 0) return base;

  const system =
    "Sos un despachante de aduana argentino experto en clasificación NCM. Te paso " +
    "la descripción que dio el cliente y los documentos de la operación (proforma, " +
    "pedido, factura, ficha técnica/catálogo, packing). Tu tarea es CONSOLIDAR una " +
    "descripción TÉCNICA del producto, ÚTIL PARA CLASIFICARLO, combinando todo.\n" +
    "- Incluí: qué es, material/composición (con % si figura), función/uso, " +
    "presentación/forma, estado (nuevo/usado), marca/modelo y cualquier dato que " +
    "defina la partida o la subposición.\n" +
    "- NO clasifiques, NO inventes datos, NO devuelvas NCM. Solo describí lo que " +
    "surge de la descripción del cliente y los documentos.\n" +
    "- Un solo párrafo, español, claro y técnico, máximo ~400 caracteres.\n" +
    "- Respondé EXCLUSIVAMENTE un JSON válido: {\"descripcion\":\"...\"}.";

  const contenido: Bloque[] = [
    {
      type: "text",
      text:
        `Descripción del cliente: ${base || "(sin descripción)"}\n\n` +
        "Documentos adjuntos:\n" +
        adjuntos.map((x) => `- ${x.a.rol}: ${x.a.nombre}`).join("\n") +
        '\n\nDevolvé el JSON: {"descripcion":"..."}',
    },
    ...adjuntos.map((x) => x.b),
  ];

  try {
    const parsed = (await llamarClaude(system, contenido, 400, {
      etiqueta: "clasificador.descripcion-producto",
      detalle: `${adjuntos.length} doc(s)`,
    })) as {
      descripcion?: string;
    };
    const desc = (parsed.descripcion ?? "").trim();
    return desc.length >= 3 ? desc : base;
  } catch {
    return base;
  }
}

/* ───────── Confirmación de NCM conocida (producto repetido) ───────── */

export type ConfirmacionNcm = {
  /** ¿La posición arancelaria corresponde al producto? */
  encaja: boolean;
  confianza: "alta" | "media" | "baja";
  justificacion: string;
  /** Punto a revisar (p.ej. un detalle del producto que podría cambiar la apertura). */
  observacion?: string | null;
};

/**
 * Para productos que el cliente YA operó con nosotros: el operador carga la NCM
 * conocida y la IA solo CONFIRMA que la posición encaja con el producto (no
 * reclasifica). Lee la descripción del cliente y, si está, la ficha técnica /
 * proforma adjuntas.
 */
export async function confirmarPosicionNcm(args: {
  ncm: string;
  producto: string;
  posicionOficial?: string | null;
  diOficial?: number | null;
  archivos?: ArchivoIA[];
}): Promise<ConfirmacionNcm> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");

  const { ncm, producto, posicionOficial, diOficial, archivos } = args;

  const system =
    "Sos un clasificador arancelario experto en la NCM/SIM de Argentina. El " +
    "operador YA sabe la posición (el cliente repitió un producto que ya operó " +
    "con nosotros). Tu único trabajo es CONFIRMAR si la NCM indicada corresponde " +
    "al producto descripto, NO reclasificar.\n" +
    "- Si el producto encaja claramente en esa posición, 'encaja': true y " +
    "confianza 'alta'.\n" +
    "- Si NO encaja o la posición parece de otra mercadería, 'encaja': false y " +
    "explicá por qué en 'justificacion'.\n" +
    "- Si encaja pero hay un detalle del producto que podría cambiar la apertura " +
    "(p.ej. un porcentaje, un material o una variante que abre a otra subposición), " +
    "dejalo en 'observacion'.\n" +
    "- Respondé EXCLUSIVAMENTE un JSON válido, sin texto extra ni markdown.";

  const esquema =
    '{"encaja":true,"confianza":"alta|media|baja",' +
    '"justificacion":"1-2 frases","observacion":"texto o null"}';

  const ctx = [
    `NCM a confirmar: ${ncm}`,
    posicionOficial ? `Posición oficial (nomenclador): ${posicionOficial}` : "",
    diOficial != null ? `Derecho de Importación oficial: ${diOficial}%` : "",
    `Producto (descripción del cliente): ${producto || "(sin descripción)"}`,
  ]
    .filter(Boolean)
    .join("\n");

  const adjuntos = (archivos ?? [])
    .map((a) => ({ a, b: bloqueDeArchivo(a) }))
    .filter((x): x is { a: ArchivoIA; b: Bloque } => x.b !== null);

  const contenido: Bloque[] = [
    {
      type: "text",
      text:
        ctx +
        (adjuntos.length
          ? "\n\nAdjuntos (ficha técnica / documentos):\n" +
            adjuntos.map((x) => `- ${x.a.rol}: ${x.a.nombre}`).join("\n")
          : "") +
        `\n\nDevolvé el JSON con este formato exacto:\n${esquema}`,
    },
    ...adjuntos.map((x) => x.b),
  ];

  const parsed = (await llamarClaude(system, contenido, 500, {
    etiqueta: "ncm.confirmar-repetido",
  })) as ConfirmacionNcm;
  return {
    encaja: Boolean(parsed.encaja),
    confianza: parsed.confianza ?? "media",
    justificacion: parsed.justificacion ?? "",
    observacion: parsed.observacion ?? null,
  };
}

/* ───────────────── Paso 2: validación de la documentación ───────────────── */

export type FaltanteIA = { doc: string; motivo: string; ref?: string };

export type TramiteIA = { nombre: string | null; link: string | null };

export type IntervencionIA = {
  /** Organismo (SENASA, ANMAT, INAL, ENACOM, INTI, etc.). */
  organismo: string;
  /** Régimen/motivo de la intervención. */
  motivo: string;
  /** "requerida": validada por VUCE; "verificar": registrada pero a confirmar. */
  nivel: "requerida" | "verificar";
  /** Resumen oficial del régimen (VUCE). */
  resumen?: string | null;
  /** Trámites TAD asociados (VUCE). */
  tramites?: TramiteIA[];
};

export type DocumentacionIA = {
  estado: "completa" | "incompleta" | "inconsistente";
  listo_para_oficializar: boolean;
  resumen: string;
  faltantes: FaltanteIA[];
  inconsistencias: string[];
  /**
   * Intervenciones de terceros organismos según la NCM (datos OFICIALES de VUCE,
   * no las infiere la IA). Las completa el endpoint, no el modelo.
   */
  intervenciones: IntervencionIA[];
  /** Regímenes/beneficios opcionales según la NCM (VUCE). */
  regimenes?: IntervencionIA[];
  /** Origen de las intervenciones: "vuce" oficial o "sin_ncm" si no hay NCM. */
  intervenciones_fuente?: "vuce" | "sin_ncm";
  alertas: Alerta[];
  /** Texto sugerido para pedirle al cliente lo que falta (vacío si no falta). */
  mensaje_cliente: string;
  /** Datos de logística detectados del BL / transporte (si están). */
  logistica?: {
    tipo_contenedor?: string;
    cantidad_contenedores?: string;
    volumen_cbm?: string;
    contenedor?: string;
    transbordo?: boolean;
    ruta_transbordo?: string;
    puerto_transbordo?: string;
    buque_salida?: string;
    buque_arribo?: string;
    declaracion_transbordo?: boolean;
  } | null;
  /**
   * Valores comerciales detectados en los documentos del paso (Paso 2 o 3).
   * Cualquier archivo puede aportarlos (factura, BL/AWB, aviso de gastos, etc.).
   * Si un documento abre FOB + flete + seguro, van por separado; si sólo trae
   * total, va en valor_factura.
   */
  comercial?: {
    valor_factura?: string;
    valor_fob?: string;
    valor_cif?: string;
    flete?: string;
    seguro?: string;
    incoterm?: string;
    moneda?: string;
  } | null;
  /**
   * Vía de transporte inferida de la factura/packing (Paso 2) o del BL/AWB (Paso 3).
   * Define qué rubros de logística aplican más adelante.
   */
  via?: ViaCanon | null;
  /**
   * Forma de pago y liberación del transporte leídos de factura/pedido/BL.
   * Al persistirse, reordenan el paso a paso del retiro en la etapa 3.
   */
  pago?: {
    forma_pago?: string;
    liberacion_doc?: string;
    /** Fecha de emisión de la factura (DD/MM/AAAA o ISO). */
    fecha_factura?: string;
    /** Plazo de pago en días (30, 60, 90…). */
    plazo_pago_dias?: string;
  } | null;
};

/**
 * Convierte un monto en texto (lo que devuelve la IA) a número. Asume formato US
 * de factura (coma = separador de miles, punto = decimal) y descarta símbolos,
 * letras y espacios. Devuelve null si no hay un número válido.
 */
function montoDesdeTexto(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const limpio = v.replace(/[^0-9.,-]/g, "").replace(/,/g, "").trim();
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza el bloque comercial que devuelve la IA (strings → montos limpios). */
function normalizarComercial(
  com: unknown,
): NonNullable<DocumentacionIA["comercial"]> | null {
  if (!com || typeof com !== "object") return null;
  const raw = com as Record<string, unknown>;
  const limpio = (v: unknown): string | undefined => {
    const n = montoDesdeTexto(v);
    return n != null && n > 0 ? String(n) : undefined;
  };
  const norm: NonNullable<DocumentacionIA["comercial"]> = {};
  const vf = limpio(raw.valor_factura);
  const fob = limpio(raw.valor_fob);
  const cif = limpio(raw.valor_cif);
  const fl = limpio(raw.flete);
  const se = limpio(raw.seguro);
  if (vf) norm.valor_factura = vf;
  if (fob) norm.valor_fob = fob;
  if (cif) norm.valor_cif = cif;
  if (fl) norm.flete = fl;
  if (se) norm.seguro = se;
  const inc = String(raw.incoterm ?? "").trim().toUpperCase();
  if (inc) norm.incoterm = inc;
  const mon = String(raw.moneda ?? "").trim().toUpperCase();
  if (mon) norm.moneda = mon;
  return Object.keys(norm).length ? norm : null;
}

/** Normaliza forma de pago y liberación del transporte. */
function normalizarPago(
  pago: unknown,
): NonNullable<DocumentacionIA["pago"]> | null {
  if (!pago || typeof pago !== "object") return null;
  const raw = pago as Record<string, unknown>;
  const out: NonNullable<DocumentacionIA["pago"]> = {};
  const fp = String(raw.forma_pago ?? "").trim();
  const lib = String(raw.liberacion_doc ?? "").trim();
  let ff = String(raw.fecha_factura ?? "").trim();
  const plazo = String(raw.plazo_pago_dias ?? "").trim();
  if (lib) out.liberacion_doc = lib;
  if (ff) {
    const iso = parseFechaComercial(ff);
    out.fecha_factura = iso ?? ff;
  }
  if (plazo) out.plazo_pago_dias = plazo.replace(/\D/g, "");
  const plazoNum = out.plazo_pago_dias ? Number(out.plazo_pago_dias) : null;
  const formaFinal = enriquecerFormaPagoComercial(fp, plazoNum);
  if (formaFinal) out.forma_pago = formaFinal;
  return Object.keys(out).length ? out : null;
}

function normalizarViaDocumento(raw: unknown): ViaCanon | null {
  return normalizarViaCanon(String(raw ?? ""));
}

const VALIDOS_CONTENEDOR: TipoContenedor[] = [
  "20STD",
  "40STD",
  "40HC",
  "20RF",
  "40RF",
  "LCL",
  "AEREO",
];

/** Normaliza tipo/cantidad/CBM leídos de packing o BL. */
function normalizarLogisticaDocumento(
  log: unknown,
): NonNullable<DocumentacionIA["logistica"]> | null {
  if (!log || typeof log !== "object") return null;
  const src = log as Record<string, unknown>;
  const out: NonNullable<DocumentacionIA["logistica"]> = {};
  const tcRaw = String(src.tipo_contenedor ?? "")
    .toUpperCase()
    .replace(/\s/g, "");
  let tipo = VALIDOS_CONTENEDOR.includes(tcRaw as TipoContenedor)
    ? (tcRaw as TipoContenedor)
    : null;
  if (!tipo) {
    tipo =
      detectarContenedorISO(String(src.tipo_contenedor ?? "")) ??
      detectarContenedorISO(String(src.contenedor ?? ""));
  }
  if (tipo) out.tipo_contenedor = tipo;
  const cont = String(src.contenedor ?? "").trim();
  if (cont) {
    const resueltos = resolverConflictosContenedor(extraerCodigosContenedor(cont));
    if (resueltos.length) {
      out.contenedor = resueltos.join(", ");
      out.cantidad_contenedores = String(resueltos.length);
    }
  } else {
    const cant = String(src.cantidad_contenedores ?? "").trim();
    if (cant) out.cantidad_contenedores = cant;
  }
  const cbm = String(src.volumen_cbm ?? "").trim();
  if (cbm) out.volumen_cbm = cbm;
  return Object.keys(out).length ? out : null;
}

export type ParteDocumento = {
  /** Etiqueta tal como figura en el PDF (Seller, Buyer, Consignee, etc.). */
  etiqueta: string;
  nombre: string;
  domicilio?: string;
  pais?: string;
  identificacion?: string;
};

export type MercaderiaDocumento = {
  contraparte?: string;
  mercaderia?: string;
  ncm?: string;
  marca?: string;
  cantidad?: string;
  unidad?: string;
  bultos?: string;
  tipo_embalaje?: string;
  peso_neto?: string;
  peso_bruto?: string;
};

export type OrigenDocumento = {
  pais_origen?: string;
  pais_adquisicion?: string;
  pais_procedencia?: string;
  pais_destino?: string;
};

export type TransporteDocumento = {
  transporte_doc_nro?: string;
  transportista?: string;
  puerto_origen?: string;
  puerto_destino?: string;
  eta?: string;
  medio_transporte?: string;
};

/** Sellos, firmas y entidad emisora leídos visualmente en el PDF (cualquier doc). */
export type FormalidadesDocumento = {
  entidad_emisora?: string;
  sellos_firmas_vistos?: string;
  observaciones_visuales?: string;
};

export type DatosDocumentoOperacion = {
  comercial: NonNullable<DocumentacionIA["comercial"]> | null;
  via: ViaCanon | null;
  logistica: NonNullable<DocumentacionIA["logistica"]> | null;
  mercaderia: MercaderiaDocumento | null;
  partes: ParteDocumento[] | null;
  origen: OrigenDocumento | null;
  transporte: TransporteDocumento | null;
  pago: NonNullable<DocumentacionIA["pago"]> | null;
  formalidades: FormalidadesDocumento | null;
};

export const VACIO_DATOS_DOC: DatosDocumentoOperacion = {
  comercial: null,
  via: null,
  logistica: null,
  mercaderia: null,
  partes: null,
  origen: null,
  transporte: null,
  pago: null,
  formalidades: null,
};

/** Normaliza el bloque `datos` de una respuesta IA al shape reconciliable. */
export function normalizarDatosDocumentoOperacion(
  raw: Record<string, unknown>,
): DatosDocumentoOperacion {
  const comercial = normalizarComercial(raw.datos && typeof raw.datos === "object"
      ? (raw.datos as Record<string, unknown>).comercial ?? raw.comercial
    : raw.comercial);
  const mercaderiaRaw = normalizarMercaderiaDocumento(
    raw.datos && typeof raw.datos === "object"
      ? (raw.datos as Record<string, unknown>).mercaderia ?? raw.mercaderia
      : raw.mercaderia,
  );
  const transporte = normalizarTransporteDocumento(
      raw.datos && typeof raw.datos === "object"
        ? (raw.datos as Record<string, unknown>).transporte ?? raw.transporte
        : raw.transporte,
    );
  const origen = enriquecerOrigenDocumento(
    normalizarOrigenDocumento(
      raw.datos && typeof raw.datos === "object"
        ? (raw.datos as Record<string, unknown>).origen ?? raw.origen
        : raw.origen,
    ),
    transporte,
  );
  return {
    comercial,
    via: normalizarViaDocumento(
      raw.datos && typeof raw.datos === "object"
        ? (raw.datos as Record<string, unknown>).via ?? raw.via
        : raw.via,
    ),
    logistica: normalizarLogisticaDocumento(
      raw.datos && typeof raw.datos === "object"
        ? (raw.datos as Record<string, unknown>).logistica ?? raw.logistica
        : raw.logistica,
    ),
    mercaderia: filtrarMercaderiaRuidoComercial(mercaderiaRaw, comercial),
    partes: normalizarPartes(
      raw.datos && typeof raw.datos === "object"
        ? (raw.datos as Record<string, unknown>).partes ?? raw.partes
        : raw.partes,
    ),
    origen,
    transporte,
    pago: normalizarPago(
      raw.datos && typeof raw.datos === "object"
        ? (raw.datos as Record<string, unknown>).pago ?? raw.pago
        : raw.pago,
    ),
    formalidades: normalizarFormalidadesDocumento(
      raw.datos && typeof raw.datos === "object"
        ? (raw.datos as Record<string, unknown>).formalidades ?? raw.formalidades
        : raw.formalidades,
    ),
  };
}

function strCampo(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  return s ? s : undefined;
}

function pesoCampo(v: unknown): string | undefined {
  const n = montoDesdeTexto(v);
  return n != null && n > 0 ? String(n) : strCampo(v);
}

const UNIDAD_PESO_DOC =
  /\b(mt|mts|m\.?t\.?|tm|ton|tons|tonelada|toneladas|kg|kilogram|kilogramos|metric ton|lb|lbs)\b/i;
const UNIDAD_BULTO_DOC =
  /\b(bag|bags|bolsa|bolsas|sack|sacks|bulto|bultos|package|packages|pcs|pieces)\b/i;

/** Interpreta notación latina 200.000 MT → 200 MT (toneladas, no miles). */
function interpretarMedidaLatina(texto: string): string {
  const t = texto.trim();
  const m = t.match(/^([\d.,]+)\s*([A-Za-z][A-Za-z0-9.' ]*)$/);
  if (!m) return t;
  const numStr = m[1]!;
  const unit = m[2]!.trim();
  if (/^\d{1,4}\.000$/.test(numStr) && /\b(MT|MTS|TM|TON|TNE)\b/i.test(unit)) {
    return `${numStr.split(".")[0]} ${unit}`;
  }
  if (/^\d{1,4},000$/.test(numStr) && /\b(MT|MTS|TM|TON|TNE)\b/i.test(unit)) {
    return `${numStr.split(",")[0]} ${unit}`;
  }
  return t;
}

/** Canoniza toneladas a «N MT» para UI y reconciliación. */
function canonizarPesoConUnidad(v: string): string {
  const t = v.trim();
  if (/\bmetric tons?\b/i.test(t)) {
    const n = montoDesdeTexto(t);
    return n != null ? `${n} MT` : t.replace(/\bmetric tons?\b/i, "MT");
  }
  return interpretarMedidaLatina(t);
}

/** Conserva unidad del PDF; no convierte toneladas a kg en extracción. */
function preservarMedida(raw: unknown, unidad?: string): string | undefined {
  const literal = strCampo(raw);
  if (literal) {
    if (UNIDAD_BULTO_DOC.test(literal) && !UNIDAD_PESO_DOC.test(literal)) {
      return literal;
    }
    if (UNIDAD_PESO_DOC.test(literal) || /\d/.test(literal)) {
      return interpretarMedidaLatina(literal);
    }
  }
  const num = pesoCampo(raw);
  if (!num) return undefined;
  return anexarUnidad(num, unidad) ?? num;
}

function montoNormalizado(v: unknown): string | null {
  const n = montoDesdeTexto(v);
  return n != null ? String(n) : null;
}

/** Descarta cantidad/peso que repite el total de la factura (error frecuente en CO). */
function filtrarMercaderiaRuidoComercial(
  merc: MercaderiaDocumento | null,
  comercial: DatosDocumentoOperacion["comercial"],
): MercaderiaDocumento | null {
  if (!merc) return null;
  const vf = montoNormalizado(comercial?.valor_factura);
  if (!vf) return merc;
  const out = { ...merc };
  if (out.cantidad && montoNormalizado(out.cantidad) === vf) delete out.cantidad;
  if (out.peso_neto && montoNormalizado(out.peso_neto) === vf) delete out.peso_neto;
  if (out.peso_bruto && montoNormalizado(out.peso_bruto) === vf) {
    delete out.peso_bruto;
  }
  return Object.keys(out).length ? out : null;
}

function anexarUnidad(valor?: string, unidad?: string): string | undefined {
  const v = String(valor ?? "").trim();
  const u = String(unidad ?? "").trim();
  if (!v) return undefined;
  if (!u) return v;
  const esc = u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`\\b${esc}\\b`, "i").test(v)) return v;
  return `${v} ${u}`;
}

function normalizarPartes(raw: unknown): ParteDocumento[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ParteDocumento[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const src = item as Record<string, unknown>;
    const etiqueta = strCampo(src.etiqueta);
    const nombre = strCampo(src.nombre);
    if (!etiqueta || !nombre) continue;
    const parte: ParteDocumento = { etiqueta, nombre };
    const dom = strCampo(src.domicilio);
    const pais = strCampo(src.pais);
    const id = strCampo(src.identificacion);
    if (dom) parte.domicilio = dom;
    if (pais) parte.pais = pais;
    if (id) parte.identificacion = id;
    out.push(parte);
  }
  return out.length ? out : null;
}

/** Vendedor/exportador para importación (preferir partes[] sobre contraparte ambigua). */
export function vendedorDesdeExtraccion(
  datos: Pick<DatosDocumentoOperacion, "partes" | "mercaderia">,
): string | undefined {
  const patrones = [
    /\bseller\b/i,
    /\bvendedor\b/i,
    /\bexportador\b/i,
    /\bshipper\b/i,
    /\bsold to\b/i,
  ];
  for (const p of datos.partes ?? []) {
    if (patrones.some((re) => re.test(p.etiqueta))) {
      const linea = [p.nombre, p.domicilio, p.pais].filter(Boolean).join(", ");
      if (linea.trim()) return linea.trim();
    }
  }
  return datos.mercaderia?.contraparte;
}

function normalizarMercaderiaDocumento(raw: unknown): MercaderiaDocumento | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const out: MercaderiaDocumento = {};
  const contraparte = strCampo(src.contraparte);
  const mercaderia = strCampo(src.mercaderia);
  const ncm = strCampo(src.ncm);
  const marca = strCampo(src.marca);
  const unidad = strCampo(src.unidad);
  const tipoEmb = strCampo(src.tipo_embalaje);

  const cantidadRaw = strCampo(src.cantidad) ?? pesoCampo(src.cantidad);
  const cantidadBase = anexarUnidad(cantidadRaw, unidad) ?? cantidadRaw;
  const cantidad = cantidadBase ? interpretarMedidaLatina(cantidadBase) : undefined;

  const bultosRaw = strCampo(src.bultos) ?? pesoCampo(src.bultos);
  let bultos = bultosRaw;

  const pnTexto = strCampo(src.peso_neto);
  const pbTexto = strCampo(src.peso_bruto);
  let pn: string | undefined;
  let pb: string | undefined;

  if (pnTexto) {
    if (UNIDAD_BULTO_DOC.test(pnTexto) && !UNIDAD_PESO_DOC.test(pnTexto)) {
      if (!bultos) bultos = pnTexto;
    } else {
      pn = canonizarPesoConUnidad(
        preservarMedida(pnTexto, unidad) ?? interpretarMedidaLatina(pnTexto),
      );
    }
  }
  if (pbTexto) {
    if (UNIDAD_BULTO_DOC.test(pbTexto) && !UNIDAD_PESO_DOC.test(pbTexto)) {
      if (!bultos) bultos = pbTexto;
    } else {
      pb = canonizarPesoConUnidad(
        preservarMedida(pbTexto, unidad) ?? interpretarMedidaLatina(pbTexto),
      );
    }
  }

  if (contraparte) out.contraparte = contraparte;
  if (mercaderia) out.mercaderia = mercaderia;
  if (ncm) out.ncm = ncm;
  if (marca) out.marca = marca;
  if (cantidad) out.cantidad = cantidad;
  if (unidad) out.unidad = unidad;
  if (bultos) out.bultos = bultos;
  if (tipoEmb) out.tipo_embalaje = tipoEmb;
  if (pn) out.peso_neto = pn;
  if (pb) out.peso_bruto = pb;
  completarUnidadPeso(out);
  return Object.keys(out).length ? out : null;
}

/** Si el peso es solo número, hereda MT/ton de cantidad o del otro peso. */
function completarUnidadPeso(merc: MercaderiaDocumento): void {
  const refUnidad =
    [merc.cantidad, merc.peso_neto, merc.peso_bruto]
      .filter(Boolean)
      .find((x) => UNIDAD_PESO_DOC.test(String(x))) ?? "";
  for (const key of ["peso_neto", "peso_bruto"] as const) {
    const v = merc[key];
    if (!v || UNIDAD_PESO_DOC.test(v)) continue;
    const n = montoDesdeTexto(v);
    if (n == null) continue;
    if (/\b(mt|mts|ton|metric ton)\b/i.test(refUnidad)) {
      merc[key] = `${n} MT`;
    }
  }
}

function normalizarOrigenDocumento(raw: unknown): OrigenDocumento | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const out: OrigenDocumento = {};
  for (const k of [
    "pais_origen",
    "pais_adquisicion",
    "pais_procedencia",
    "pais_destino",
  ] as const) {
    const v = strCampo(src[k]);
    if (v) out[k] = v;
  }
  return completarOrigenDocumento(Object.keys(out).length ? out : null);
}

/** Canoniza nombres de país; no mezcla campos distintos (origen ≠ procedencia). */
export function completarOrigenDocumento(
  raw: OrigenDocumento | null,
): OrigenDocumento | null {
  if (!raw) return null;
  const out: OrigenDocumento = {};
  for (const k of [
    "pais_origen",
    "pais_adquisicion",
    "pais_procedencia",
    "pais_destino",
  ] as const) {
    const c = nombrePaisCanonico(raw[k]);
    if (c) out[k] = c;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Origen de la mercadería ≠ país del vendedor. Usa procedencia/puerto si hace falta.
 */
function enriquecerOrigenDocumento(
  origen: OrigenDocumento | null,
  transporte: TransporteDocumento | null,
): OrigenDocumento | null {
  const out: OrigenDocumento = { ...(origen ?? {}) };

  if (!out.pais_origen?.trim() && out.pais_procedencia?.trim()) {
    out.pais_origen = out.pais_procedencia;
  }

  const puerto = transporte?.puerto_origen?.trim() ?? "";
  if (!out.pais_origen?.trim() && puerto) {
    for (const frag of puerto.split(/[,/]/).map((s) => s.trim()).filter(Boolean)) {
      const canon = nombrePaisCanonico(frag) ?? buscarPais(frag)?.nombre ?? null;
      if (canon) {
        out.pais_origen = canon;
        break;
      }
    }
  }

  const o = nombrePaisCanonico(out.pais_origen);
  const a = nombrePaisCanonico(out.pais_adquisicion);
  const p = nombrePaisCanonico(out.pais_procedencia);
  if (o && a && p && o === a && p !== o) {
    out.pais_origen = p;
  }

  return completarOrigenDocumento(Object.keys(out).length ? out : null);
}

/** Une países de todos los documentos y completa origen si falta. */
export function fusionarYCompletarOrigen(
  documentos: Array<{ datos: DatosDocumentoOperacion }>,
): OrigenDocumento | null {
  const acc: OrigenDocumento = {};
  for (const { datos } of documentos) {
    const o = datos.origen;
    if (!o) continue;
    for (const k of [
      "pais_origen",
      "pais_adquisicion",
      "pais_procedencia",
      "pais_destino",
    ] as const) {
      if (!acc[k] && o[k]) acc[k] = o[k];
    }
  }
  return completarOrigenDocumento(Object.keys(acc).length ? acc : null);
}

function normalizarTransporteDocumento(raw: unknown): TransporteDocumento | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const out: TransporteDocumento = {};
  const docNro = strCampo(src.transporte_doc_nro);
  const transportista = strCampo(src.transportista);
  const po = strCampo(src.puerto_origen);
  const pd = strCampo(src.puerto_destino);
  const etaRaw = strCampo(src.eta);
  const eta = etaRaw ? parseFechaComercial(etaRaw) : null;
  const medio = strCampo(src.medio_transporte);
  if (docNro) out.transporte_doc_nro = docNro;
  if (transportista) out.transportista = transportista;
  if (po) out.puerto_origen = po;
  if (pd) out.puerto_destino = pd;
  if (eta) out.eta = eta;
  if (medio) out.medio_transporte = medio;
  return Object.keys(out).length ? out : null;
}

function normalizarFormalidadesDocumento(raw: unknown): FormalidadesDocumento | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const out: FormalidadesDocumento = {};
  const entidad = strCampo(src.entidad_emisora);
  const sellos = strCampo(src.sellos_firmas_vistos);
  const obs = strCampo(src.observaciones_visuales);
  if (entidad) out.entidad_emisora = entidad;
  if (sellos) out.sellos_firmas_vistos = sellos;
  if (obs) out.observaciones_visuales = obs;
  return Object.keys(out).length ? out : null;
}

/**
 * Lee de UN documento todos los datos reconciliables (comercial, mercadería,
 * origen, transporte, pago, logística). Alimenta el motor global de reconciliación.
 */
export async function extraerDatosDocumentoOperacion(
  archivo: ArchivoIA,
  doc?: Pick<DocumentRow, "stored_name" | "size" | "extraccion_ia"> | null,
  opts?: { ignorarCache?: boolean },
): Promise<DatosDocumentoOperacion> {
  if (doc && !opts?.ignorarCache) {
    const cache = parseExtraccionDoc(doc.extraccion_ia);
    if (extraccionDocVigente(doc, cache) && cache?.datos) {
      return normalizarDatosDocumentoOperacion({ datos: cache.datos });
    }
  }

  const bloque = bloqueDeArchivo(archivo);
  if (!bloque) return { ...VACIO_DATOS_DOC };

  try {
    const { pipelineDocumentoSubido } = await import("./ia-extraccion");
    const r = await pipelineDocumentoSubido(archivo, {});
    return r.datos;
  } catch {
    return { ...VACIO_DATOS_DOC };
  }
}

/** Resultado de la IA al resolver un conflicto entre documentos. */
export type ValorElegidoIA = {
  valor: string | null;
  documento: string;
  motivo: string;
  /**
   * ocr = mismo dato leído mal en distintos PDFs; real = los documentos muestran
   * valores de negocio distintos; ilegible = no se pudo leer con certeza.
   */
  naturaleza: "ocr" | "real" | "ilegible";
};

/** Conflicto de lectura entre documentos, listo para resolución batch. */
export type ConflictoDocumentoBatch = {
  id: string;
  campo: string;
  descripcion?: string;
  contexto?: string;
  candidatos: string[];
  tipoConflicto: "ocr_variante" | "valores_distintos";
  fuentes: {
    rol: string;
    nombre: string;
    archivo: ArchivoIA;
  }[];
};

function candidatoCoincide(valor: string, candidatos: string[]): string | null {
  const v = valor.trim();
  if (!v) return null;
  const idx = candidatos.findIndex(
    (c) => c.trim().toLowerCase() === v.toLowerCase() || c.trim() === v,
  );
  return idx >= 0 ? candidatos[idx]! : null;
}

function textoConflictoBatch(c: ConflictoDocumentoBatch): string {
  const intro =
    c.tipoConflicto === "ocr_variante"
      ? "OCR ambiguo: distintos documentos leyeron distinto el MISMO dato."
      : "Valores distintos entre documentos.";
  return (
    `id: ${c.id}\n` +
    `Campo: ${c.campo}` +
    (c.contexto ? `\nContexto: ${c.contexto}` : "") +
    (c.descripcion ? `\n${c.descripcion}` : "") +
    `\n${intro}\n` +
    "Candidatos:\n" +
    c.candidatos.map((v, i) => `  ${i + 1}. ${v}`).join("\n")
  );
}

/**
 * Re-compara los PDFs de cada conflicto y resuelve por claridad visual.
 * Agrupa por conjunto de archivos: no manda 6 PDFs si el par es packing+factura.
 */
export async function resolverConflictosDocumentosBatch(
  conflictos: ConflictoDocumentoBatch[],
): Promise<Map<string, ValorElegidoIA | null>> {
  const out = new Map<string, ValorElegidoIA | null>();
  if (conflictos.length === 0) return out;

  const porPdfs = new Map<string, ConflictoDocumentoBatch[]>();
  for (const c of conflictos) {
    const key = c.fuentes
      .map((f) => f.nombre)
      .sort()
      .join("|");
    const g = porPdfs.get(key) ?? [];
    g.push(c);
    porPdfs.set(key, g);
  }

  for (const grupo of porPdfs.values()) {
    const parcial = await resolverConflictosDocumentosUnGrupo(grupo);
    for (const [id, v] of parcial) out.set(id, v);
  }

  return out;
}

async function resolverConflictosDocumentosUnGrupo(
  conflictos: ConflictoDocumentoBatch[],
): Promise<Map<string, ValorElegidoIA | null>> {
  const out = new Map<string, ValorElegidoIA | null>();
  if (conflictos.length === 0) return out;

  const pdfs = new Map<string, { rol: string; nombre: string; archivo: ArchivoIA }>();
  for (const c of conflictos) {
    for (const f of c.fuentes) {
      pdfs.set(f.nombre, f);
    }
  }

  const bloques: Bloque[] = [
    {
      type: "text",
      text:
        `Hay ${conflictos.length} conflicto(s) de lectura entre documentos.\n` +
        "Por cada uno: naturaleza ocr|real|ilegible; valor si es OCR (el más claro); " +
        "null si es diferencia real o ilegible.\n\n" +
        "Conflictos:\n\n" +
        conflictos.map((c) => textoConflictoBatch(c)).join("\n\n---\n\n") +
        '\n\nRespondé TODOS los conflictos.\n\n' +
        'JSON: {"conflictos":[{"id":"...","naturaleza":"ocr|real|ilegible","legible":true|false,' +
        '"valor":"..."|null,"documento":"nombre del archivo o vacío","motivo":"..."}]}',
    },
  ];

  for (const f of pdfs.values()) {
    bloques.push({
      type: "text",
      text: `\n--- ${f.rol} · ${f.nombre} ---\n`,
    });
    const b = bloqueDeArchivo(f.archivo);
    if (b) bloques.push(b);
  }

  const maxTokens = Math.min(4096, 400 + conflictos.length * 450);

  try {
    const parsed = (await llamarClaude(
      "Resolvés conflictos de lectura entre documentos de una operación.",
      bloques,
      maxTokens,
      {
        etiqueta: "doc.conflictos-batch",
        detalle: `${pdfs.size} PDF(s) · ${conflictos.length} conflicto(s)`,
      },
    )) as {
      conflictos?: Array<{
        id?: unknown;
        naturaleza?: unknown;
        legible?: unknown;
        valor?: unknown;
        documento?: unknown;
        motivo?: unknown;
      }>;
    };

    const items = Array.isArray(parsed.conflictos) ? parsed.conflictos : [];
    const porId = new Map(conflictos.map((c) => [c.id, c]));

    for (const item of items) {
      const id = String(item.id ?? "").trim();
      const def = porId.get(id);
      if (!def) continue;

      const legible = item.legible !== false;
      const motivo = String(item.motivo ?? "").trim() || "sin detalle";
      const documento = String(item.documento ?? "").trim();
      const naturalezaRaw = String(item.naturaleza ?? "")
        .toLowerCase()
        .trim();

      let naturaleza: ValorElegidoIA["naturaleza"];
      if (!legible || naturalezaRaw === "ilegible") {
        naturaleza = "ilegible";
      } else if (
        naturalezaRaw === "real" ||
        naturalezaRaw.startsWith("distint")
      ) {
        naturaleza = "real";
      } else if (naturalezaRaw === "ocr" || naturalezaRaw.includes("misma")) {
        naturaleza = "ocr";
      } else {
        naturaleza =
          def.tipoConflicto === "ocr_variante" ? "ocr" : "real";
      }

      if (naturaleza === "real" || naturaleza === "ilegible") {
        out.set(id, { valor: null, documento, motivo, naturaleza });
        continue;
      }

      const literal = candidatoCoincide(String(item.valor ?? ""), def.candidatos);
      if (literal) {
        out.set(id, { valor: literal, documento, motivo, naturaleza: "ocr" });
      } else {
        out.set(id, {
          valor: null,
          documento,
          motivo: motivo || "no se pudo alinear con un candidato",
          naturaleza: "ilegible",
        });
      }
    }

    for (const c of conflictos) {
      if (!out.has(c.id)) {
        out.set(c.id, {
          valor: null,
          documento: "",
          motivo: "sin respuesta de la IA",
          naturaleza: "ilegible",
        });
      }
    }
  } catch {
    for (const c of conflictos) {
      out.set(c.id, {
        valor: null,
        documento: "",
        motivo: "error al resolver conflicto",
        naturaleza: "ilegible",
      });
    }
  }

  return out;
}

export type {
  LecturaDocumento,
  LecturaBrutaDocumento,
  VacioInterpretacion,
} from "./ia-extraccion";

/* ───────── Clasificación automática de un documento al subirlo ───────── */

/**
 * Lee un documento con la IA y devuelve el tipo (DocType) más probable.
 * Si la IA no está disponible o falla, cae a la clasificación por nombre.
 */
export async function clasificarDocumentoIA(
  archivo: ArchivoIA,
): Promise<DocType> {
  const porNombre = clasificarPorNombre(archivo.nombre);
  if (!iaDocsDisponible()) return porNombre;

  const bloque = bloqueDeArchivo(archivo);
  if (!bloque) return porNombre;

  const tipos = Object.keys(DOC_LABELS) as DocType[];
  const system =
    "Identificá el tipo de este documento aduanero/comercial.\n" +
    `Códigos válidos: ${tipos.join(", ")}.\n` +
    'JSON: {"tipo":"<codigo>"}.';

  try {
    const parsed = await llamarClaude(
      system,
      [
        {
          type: "text",
          text: `Nombre del archivo: ${archivo.nombre}\nDecí qué tipo de documento es.`,
        },
        bloque,
      ],
      120,
      { etiqueta: "doc.clasificar-tipo", detalle: archivo.nombre },
    );
    const tipo = String((parsed as { tipo?: string }).tipo ?? "").trim();
    return (tipos as string[]).includes(tipo) ? (tipo as DocType) : porNombre;
  } catch {
    return porNombre;
  }
}

/** Hallazgo del análisis por documento, con su posible resolución cruzada. */
export type HallazgoItem = {
  nivel: "ok" | "warn" | "error";
  texto: string;
  /** Artículo del marco (p. ej. «ROM · Art. 26»). Obligatorio en warn/error. */
  ref?: string;
  /**
   * Códigos de documento que RESUELVEN este hallazgo pendiente: cuando alguno
   * llega a la operación y es válido, la alerta se borra sola (resolución
   * cruzada en lib/data → resolverHallazgosIA).
   */
  requiereDoc?: DocType[];
};

/** Resultado del análisis automático de UN documento al subirse. */
export type HallazgoDocumento = {
  tipo: DocType;
  resumen: string;
  hallazgos: HallazgoItem[];
};

/** Análisis al subir: solo lectura del PDF (sin cruce). */
export type AnalisisDocumentoSubido = HallazgoDocumento & {
  datos: DatosDocumentoOperacion;
  lectura_bruta?: import("./ia-extraccion").LecturaDocumento;
  vacios_interpretacion?: import("./ia-extraccion").VacioInterpretacion[];
};

/** Subida: lectura del PDF + interpretación estructurada (Haiku texto si hay API). */
export async function leerDocumentoSubido(
  archivo: ArchivoIA,
  opts?: {
    tipoConocido?: DocType | null;
    contextoOperacion?: string | null;
  },
): Promise<
  Pick<
    AnalisisDocumentoSubido,
    "tipo" | "datos" | "resumen" | "lectura_bruta" | "vacios_interpretacion"
  >
> {
  const fallbackTipo = opts?.tipoConocido ?? "otro";
  const vacio = {
    tipo: fallbackTipo,
    resumen: "",
    datos: { ...VACIO_DATOS_DOC },
    lectura_bruta: { texto: "", pares: [], tablas: [] },
    vacios_interpretacion: [] as import("./ia-extraccion").VacioInterpretacion[],
  };

  try {
    const { pipelineDocumentoSubido } = await import("./ia-extraccion");
    const r = await pipelineDocumentoSubido(archivo, {
      tipoConocido: opts?.tipoConocido,
      contextoOperacion: opts?.contextoOperacion,
    });
    return {
      tipo: r.tipo,
      resumen: r.resumen,
      datos: r.datos,
      lectura_bruta: r.lectura_bruta,
      vacios_interpretacion: r.vacios_interpretacion,
    };
  } catch {
    return vacio;
  }
}

/** Subida: lectura + interpretación. Cruce normativo = manual. */
export async function analizarDocumentoSubido(
  archivo: ArchivoIA,
  opts?: {
    tipoConocido?: DocType | null;
    contextoOperacion?: string | null;
  },
): Promise<AnalisisDocumentoSubido> {
  const leido = await leerDocumentoSubido(archivo, opts);
  return { ...leido, hallazgos: [] };
}

export async function analizarDocumentoSubidoCompleto(
  archivo: ArchivoIA,
  opts?: Parameters<typeof analizarDocumentoSubido>[1],
): Promise<AnalisisDocumentoSubido> {
  return analizarDocumentoSubido(archivo, opts);
}

function numCosto(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d.,-]/g, "").trim();
  if (!s) return null;
  const coma = s.includes(",");
  const punto = s.includes(".");
  if (coma && punto) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (coma) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function limpiarLineaCosto(raw: Partial<LineaCostoForwarder>): LineaCostoForwarder {
  const categorias = new Set<LineaCostoForwarder["categoria"]>([
    "flete_internacional",
    "seguro",
    "gasto_origen",
    "gasto_destino",
    "gasto_documental",
    "contingencia",
    "otro",
  ]);
  const categoria = categorias.has(raw.categoria as LineaCostoForwarder["categoria"])
    ? (raw.categoria as LineaCostoForwarder["categoria"])
    : "otro";
  return {
    concepto: String(raw.concepto ?? "Costo").trim() || "Costo",
    categoria,
    monto: numCosto(raw.monto),
    moneda: raw.moneda ? String(raw.moneda).trim().toUpperCase() : null,
    ivaPct: numCosto(raw.ivaPct),
    nota: raw.nota ? String(raw.nota).trim() : null,
  };
}

/**
 * Lee cotizaciones/facturas de forwarder, naviera, aerolínea o transportista y
 * devuelve costos normalizados. Sirve para impo/expo y para AWB/BL/CRT:
 * flete, seguro (si existe) y gastos locales reales. Si el documento dice que
 * el seguro NO está incluido, se marca para que el motor use el 1% de respaldo.
 */
export async function analizarCostosForwarder(args: {
  archivos: ArchivoIA[];
  tipoOperacion: string;
  via?: string | null;
  incoterm?: string | null;
}): Promise<CostosForwarderIA> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY no configurada");

  const utilizables = args.archivos
    .map((a) => ({ a, b: bloqueDeArchivo(a) }))
    .filter((x): x is { a: ArchivoIA; b: Bloque } => x.b !== null);
  if (utilizables.length === 0) {
    throw new Error("No hay cotizaciones legibles (subí PDF o imagen).");
  }

  const esExpo = args.tipoOperacion.toLowerCase().startsWith("exp");
  const system =
    "Sos un despachante de aduana argentino experto en costos logísticos. " +
    "Te paso cotizaciones/facturas de un forwarder, naviera, aerolínea, terminal " +
    "o transportista. Tu tarea es extraer COSTOS REALES para alimentar una " +
    "cotización aduanera.\n" +
    `Contexto de la operación: ${esExpo ? "EXPORTACIÓN" : "IMPORTACIÓN"}. ` +
    `Vía cargada: ${args.via ?? "sin definir"}. Incoterm cargado: ${args.incoterm ?? "sin definir"}.\n` +
    "- Detectá si el documento corresponde a importación o exportación. Si dice " +
    "'cotización de exportación' o la ruta sale de Argentina, es exportación; si " +
    "la ruta llega a Argentina, es importación.\n" +
    "- Detectá la vía: AWB/air/aerolínea/TCA → aerea; BL/ocean/vessel/naviera/" +
    "THC → maritima; CRT/truck/road/camión → terrestre.\n" +
    "- Clasificá cada línea en: flete_internacional, seguro, gasto_origen, " +
    "gasto_destino, gasto_documental, contingencia u otro. No inventes importes.\n" +
    "- FLETE: sumá los cargos de transporte principal y recargos propios del " +
    "flete (fuel, security, MBC, BAF, CAF, PSS/GRI si están cotizados con monto). " +
    "Si sólo hay tarifa por kg/contenedor y peso/cantidad, calculá el total cuando " +
    "sea claro. Si no es claro, dejá flete null y explicalo en alertas.\n" +
    "- SEGURO: si hay un ítem de seguro/insurance con monto, devolvelo en 'seguro' " +
    "y seguroIncluido=true. Si el documento dice 'no incluye seguro' o similar, " +
    "seguro=null y seguroNoIncluido=true. Si no menciona nada, ambos false.\n" +
    "- GASTOS LOCALES: en exportación, los gastos de Argentina son gastosOrigen " +
    "(TCA, AWB, handling, manejo documentación, gastos operativos, THC origen, " +
    "consolidación, despacho exportación, pickup local si está cotizado). En " +
    "importación, los gastos de Argentina son gastosDestino (THC destino, BL fee, " +
    "delivery order, ISPS, ZAP, desconsolidación, TCA destino, depósito fiscal, " +
    "descarga, agente, gastos operativos). Sumá también el IVA discriminado sobre " +
    "estos gastos en 'ivaGastos'.\n" +
    "- CONTINGENCIAS: demurrage, detention, storage, pick-up cancellation, multas, " +
    "inspecciones, reempaque, forklift, certificados no cotizados: listalos en " +
    "'contingencias' pero NO los sumes si no tienen monto concreto.\n" +
    "- Moneda: usá USD/ARS/etc. Si una línea dice '+ IVA' y no calcula importe, " +
    "poné ivaPct=21 y sumá el IVA en ivaGastos cuando el monto base esté claro.\n" +
    "- Respondé EXCLUSIVAMENTE JSON válido, sin markdown.";

  const esquema =
    "{" +
    '"tipo_documento":"cotizacion_forwarder|factura_gastos|seguro|desconocido",' +
    '"resumen":"qué cotiza y ruta/alcance",' +
    '"direccion":"importacion|exportacion|desconocido",' +
    '"via":"maritima|aerea|terrestre|desconocida",' +
    '"incoterm":"FCA/FOB/CFR/CIF/etc o null",' +
    '"moneda":"USD/ARS/etc o null",' +
    '"flete":123.45,' +
    '"seguro":123.45,' +
    '"seguroIncluido":true,' +
    '"seguroNoIncluido":false,' +
    '"gastosOrigen":123.45,' +
    '"gastosDestino":123.45,' +
    '"gastosDocumentales":123.45,' +
    '"ivaGastos":123.45,' +
    '"totalGastosLocales":123.45,' +
    '"lineas":[{"concepto":"","categoria":"flete_internacional|seguro|gasto_origen|gasto_destino|gasto_documental|contingencia|otro","monto":123.45,"moneda":"USD","ivaPct":21,"nota":""}],' +
    '"contingencias":[""],' +
    '"alertas":[{"nivel":"ok|warn|error","texto":""}]' +
    "}";

  const contenido: Bloque[] = [
    {
      type: "text",
      text:
        "Documentos adjuntos:\n" +
        utilizables.map((x) => `- ${x.a.rol}: ${x.a.nombre}`).join("\n") +
        "\n\nDevolvé el JSON con este formato. Usá null cuando no haya dato:\n" +
        esquema,
    },
    ...utilizables.map((x) => x.b),
  ];

  const parsed = (await llamarClaude(system, contenido, 1700, {
    etiqueta: "forwarder.extraer-costos",
    detalle: `${utilizables.length} archivo(s)`,
  })) as Partial<CostosForwarderIA>;
  const via = ["maritima", "aerea", "terrestre", "desconocida"].includes(
    String(parsed.via),
  )
    ? (parsed.via as CostosForwarderIA["via"])
    : "desconocida";
  const direccion = ["importacion", "exportacion", "desconocido"].includes(
    String(parsed.direccion),
  )
    ? (parsed.direccion as CostosForwarderIA["direccion"])
    : esExpo
      ? "exportacion"
      : "importacion";
  const tipoDocumento = [
    "cotizacion_forwarder",
    "factura_gastos",
    "seguro",
    "desconocido",
  ].includes(String(parsed.tipo_documento))
    ? (parsed.tipo_documento as CostosForwarderIA["tipo_documento"])
    : "desconocido";
  const lineas = Array.isArray(parsed.lineas)
    ? parsed.lineas.map((l) => limpiarLineaCosto(l))
    : [];
  const alertas = Array.isArray(parsed.alertas)
    ? parsed.alertas
        .map((a) => ({
          nivel: (["ok", "warn", "error"].includes(String(a?.nivel))
            ? a?.nivel
            : "warn") as Alerta["nivel"],
          texto: String(a?.texto ?? "").trim(),
        }))
        .filter((a) => a.texto)
    : [];

  return {
    tipo_documento: tipoDocumento,
    resumen: String(parsed.resumen ?? "").trim(),
    direccion,
    via,
    incoterm: parsed.incoterm ? String(parsed.incoterm).trim().toUpperCase() : null,
    moneda: parsed.moneda ? String(parsed.moneda).trim().toUpperCase() : null,
    flete: numCosto(parsed.flete),
    seguro: numCosto(parsed.seguro),
    seguroIncluido: Boolean(parsed.seguroIncluido),
    seguroNoIncluido: Boolean(parsed.seguroNoIncluido),
    gastosOrigen: numCosto(parsed.gastosOrigen),
    gastosDestino: numCosto(parsed.gastosDestino),
    gastosDocumentales: numCosto(parsed.gastosDocumentales),
    ivaGastos: numCosto(parsed.ivaGastos),
    totalGastosLocales: numCosto(parsed.totalGastosLocales),
    lineas,
    contingencias: Array.isArray(parsed.contingencias)
      ? parsed.contingencias.map((x) => String(x).trim()).filter(Boolean)
      : [],
    alertas,
  };
}
