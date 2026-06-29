import "server-only";

import { verificarLecturaConPdf } from "@/lib/resolver-lectura-dual";
import { DOC_LABELS, type DocType } from "@/lib/docs";
import type { DocumentRow } from "@/lib/data";
import { parseExtraccionDoc, extraccionDocVigente } from "@/lib/data";
import { rawDatosDesdeCache } from "@/lib/extraccion-doc-cache";
import {
  type AlertaLectura,
  aplicarCorreccionesLectura,
  auditarLectura,
} from "@/lib/auditoria-lectura";
import {
  analizarDiferenciaLectura,
  dualValidacionLectura,
  embebidoEsConfiable,
  extraerCapaTextoPdf,
  textosLecturaIdenticos,
  type MetaLectura,
} from "@/lib/capa-texto-pdf";
import { interpretarLecturaDocumento, serializarDatosDocumento } from "@/lib/interpretacion-documento";
import {
  type ArchivoIA,
  type DatosDocumentoOperacion,
  VACIO_DATOS_DOC,
  leerArchivoConVision,
  leerContenidoConVision,
  iaDocsDisponible,
  MODELO_LECTURA,
  normalizarDatosDocumentoOperacion,
} from "@/lib/ia-documentos";
import { imagenesPdfEscaneo, type PaginaImagen } from "@/lib/pdf-preparar";

/** Par etiqueta → valor tal como aparece en el PDF. */
export type ParLeido = { etiqueta: string; valor: string };

/** Tabla tal como aparece en el PDF. */
export type TablaLeida = {
  titulo?: string;
  columnas: string[];
  filas: string[][];
};

export type LecturaDocumento = {
  texto: string;
  pares: ParLeido[];
  tablas: TablaLeida[];
};

export type LecturaBrutaDocumento = LecturaDocumento & {
  meta_lectura?: MetaLectura;
  bloques?: { region: string; lineas: string[] }[];
  vacios?: unknown[];
  formalidades_visuales?: unknown[];
  notas_layout?: string;
  elementos?: unknown[];
};

export type VacioInterpretacion = {
  campo: string;
  donde: string;
  motivo: string;
};

export type ResultadoPipelineDocumento = {
  tipo: DocType;
  resumen: string;
  datos: DatosDocumentoOperacion;
  lectura: LecturaDocumento;
  lectura_bruta: LecturaBrutaDocumento;
  meta_lectura: MetaLectura | null;
  vacios_interpretacion: VacioInterpretacion[];
  alertas_lectura: AlertaLectura[];
};

/** Por página en multipágina — evita truncar salida a 2048 tokens. */
const MAX_TOKENS_POR_PAGINA = 2048;
const MAX_TOKENS_REVISION = 512;

const SYSTEM_LECTURA =
  "Leé el documento adjunto y transcribí todo lo que veas, tal como aparece. " +
  "Devolvé solo la transcripción literal, sin markdown, sin JSON y sin comentarios.";

const SYSTEM_REVISION =
  "Mirá la imagen. Estos códigos pueden estar mal: {fragmentos}. " +
  "Leé cada uno carácter por carácter. " +
  "Respondé SOLO líneas: VALOR_LEIDO -> VALOR_CORRECTO";

type BloqueVision =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: "image/jpeg" | "image/png";
        data: string;
      };
    };

function bloquesUnaPagina(nombre: string, p: PaginaImagen, total: number): BloqueVision[] {
  const bloques: BloqueVision[] = [
    {
      type: "text",
      text: total > 1 ? `${nombre} — página ${p.n} de ${total}` : nombre,
    },
    {
      type: "image",
      source: {
        type: "base64",
        media_type: p.mediaType,
        data: p.base64,
      },
    },
  ];
  return bloques;
}

async function visionTranscribirPaginas(
  archivo: ArchivoIA,
  paginas: PaginaImagen[],
): Promise<string> {
  if (paginas.length <= 1) {
    const p = paginas[0];
    if (!p) return "";
    return leerContenidoConVision(
      bloquesUnaPagina(archivo.nombre, p, 1),
      MAX_TOKENS_POR_PAGINA,
      { etiqueta: "doc.leer-pdf", detalle: archivo.nombre, modelo: MODELO_LECTURA },
      { system: SYSTEM_LECTURA, modelo: MODELO_LECTURA },
    );
  }

  const partes: string[] = [];
  for (const p of paginas) {
    const t = await leerContenidoConVision(
      bloquesUnaPagina(archivo.nombre, p, paginas.length),
      MAX_TOKENS_POR_PAGINA,
      {
        etiqueta: "doc.leer-pdf",
        detalle: `${archivo.nombre} p${p.n}`,
        modelo: MODELO_LECTURA,
      },
      { system: SYSTEM_LECTURA, modelo: MODELO_LECTURA },
    );
    if (t.trim()) partes.push(t.trim());
  }
  return partes.join("\n\n");
}

async function visionRevisarFragmentos(
  archivo: ArchivoIA,
  paginas: PaginaImagen[],
  fragmentos: string[],
): Promise<string> {
  const system = SYSTEM_REVISION.replace("{fragmentos}", fragmentos.join(", "));
  const p = paginas[0];
  if (!p) return "";
  return leerContenidoConVision(
    bloquesUnaPagina(archivo.nombre, p, paginas.length),
    MAX_TOKENS_REVISION,
    {
      etiqueta: "doc.revisar-iso",
      detalle: archivo.nombre,
      modelo: MODELO_LECTURA,
    },
    { system, modelo: MODELO_LECTURA },
  );
}

/**
 * Escaneo o capa no confiable: Haiku visión → ISO 6346.
 */
async function transcribirConVision(
  archivo: ArchivoIA,
  buf: Buffer,
  paginas: PaginaImagen[],
): Promise<{ texto: string; alertas: AlertaLectura[] }> {
  let texto = await visionTranscribirPaginas(archivo, paginas);
  let { alertas, revisar } = auditarLectura(texto);

  if (revisar.length > 0) {
    const correcciones = await visionRevisarFragmentos(archivo, paginas, revisar);
    texto = aplicarCorreccionesLectura(texto, correcciones);
    alertas = auditarLectura(texto).alertas;
  }

  return { texto, alertas };
}

async function visionDesdePdf(
  archivo: ArchivoIA,
  buf: Buffer,
): Promise<{ texto: string; alertas: AlertaLectura[] }> {
  const paginas = imagenesPdfEscaneo(buf);
  if (paginas.length) {
    return transcribirConVision(archivo, buf, paginas);
  }
  const texto = await leerArchivoConVision(
    archivo,
    MAX_TOKENS_POR_PAGINA,
    {
      etiqueta: "doc.leer-pdf",
      detalle: archivo.nombre,
      modelo: MODELO_LECTURA,
    },
    {
      userText: archivo.nombre,
      system: SYSTEM_LECTURA,
      modelo: MODELO_LECTURA,
    },
  );
  const alertas = auditarLectura(texto).alertas;
  return { texto, alertas };
}

function metaDesdeCapa(
  capa: ReturnType<typeof extraerCapaTextoPdf>,
  fuente: MetaLectura["fuente"],
  extra?: Partial<MetaLectura>,
): MetaLectura {
  return {
    fuente,
    paginas: capa.paginas,
    chars_embebido: capa.texto.length,
    texto_embebido: capa.tieneTexto ? capa.texto : undefined,
    confiable_embebido: embebidoEsConfiable(capa),
    ...extra,
  };
}

async function transcribirPdf(
  archivo: ArchivoIA,
  buf: Buffer,
): Promise<{
  texto: string;
  alertas: AlertaLectura[];
  meta: MetaLectura;
  interpretar: boolean;
}> {
  const capa = extraerCapaTextoPdf(buf);
  const confiable = embebidoEsConfiable(capa);

  // PDF nativo confiable, sin API: capa embebida ($0); interpretar sin validación dual.
  if (confiable && !iaDocsDisponible()) {
    const alertas = auditarLectura(capa.texto).alertas;
    return {
      texto: capa.texto,
      alertas,
      meta: metaDesdeCapa(capa, "embebido"),
      interpretar: true,
    };
  }

  // PDF nativo confiable + API: visión de control; solo re-verifica PDF si hay conflicto real.
  if (confiable && dualValidacionLectura() && iaDocsDisponible()) {
    const vision = await visionDesdePdf(archivo, buf);
    const diff = analizarDiferenciaLectura(capa.texto, vision.texto);
    const identicos = textosLecturaIdenticos(capa.texto, vision.texto);
    const metaBase = metaDesdeCapa(capa, "embebido", {
      texto_vision: vision.texto,
      lectura_validada_dual: identicos || diff.equivalente,
    });

    if (identicos || diff.equivalente) {
      return {
        texto: capa.texto,
        alertas: auditarLectura(capa.texto).alertas,
        meta: metaBase,
        interpretar: true,
      };
    }

    const paginas = imagenesPdfEscaneo(buf);
    const verificado = await verificarLecturaConPdf(
      archivo,
      paginas,
      capa.texto,
      vision.texto,
      diff.conflictos,
    );
    const textoFinal = verificado?.trim() || capa.texto;
    const alertas = auditarLectura(textoFinal).alertas;

    return {
      texto: textoFinal,
      alertas,
      meta: metaDesdeCapa(capa, verificado ? "verificada" : "embebido", {
        texto_vision: vision.texto,
        lectura_validada_dual: false,
        lectura_verificada_pdf: Boolean(verificado?.trim()),
      }),
      interpretar: textoFinal.trim().length > 0,
    };
  }

  // PDF nativo confiable, dual off (LECTURA_SIN_VALIDAR_VISION=1): embebido directo.
  if (confiable) {
    const alertas = auditarLectura(capa.texto).alertas;
    return {
      texto: capa.texto,
      alertas,
      meta: metaDesdeCapa(capa, "embebido"),
      interpretar: true,
    };
  }

  // Escaneo / capa rota: visión IA.
  if (!iaDocsDisponible()) {
    const alertas: AlertaLectura[] = [];
    if (!capa.tieneTexto) {
      alertas.push({
        tipo: "lectura_vacia",
        fragmento: "",
        detalle: "PDF sin capa de texto y visión IA no disponible",
      });
    } else {
      alertas.push({
        tipo: "lectura_vacia",
        fragmento: "",
        detalle: "Capa de texto del PDF insuficiente; configure API para visión",
      });
    }
    return {
      texto: capa.texto,
      alertas: [...alertas, ...auditarLectura(capa.texto).alertas],
      meta: metaDesdeCapa(capa, capa.tieneTexto ? "embebido" : "vision"),
      interpretar: capa.tieneTexto,
    };
  }

  const vision = await visionDesdePdf(archivo, buf);
  return {
    texto: vision.texto,
    alertas: vision.alertas,
    meta: metaDesdeCapa(capa, "vision", { texto_vision: vision.texto }),
    interpretar: vision.texto.trim().length > 0,
  };
}

async function transcribirArchivo(
  archivo: ArchivoIA,
): Promise<{
  texto: string;
  alertas: AlertaLectura[];
  meta: MetaLectura | null;
  interpretar: boolean;
}> {
  if (archivo.mediaType === "application/pdf") {
    return transcribirPdf(archivo, Buffer.from(archivo.base64, "base64"));
  }

  if (!iaDocsDisponible()) {
    return {
      texto: "",
      alertas: [
        {
          tipo: "lectura_vacia",
          fragmento: "",
          detalle: "Imagen sin visión IA disponible",
        },
      ],
      meta: null,
      interpretar: false,
    };
  }

  const opts = {
    userText: archivo.nombre,
    system: SYSTEM_LECTURA,
    modelo: MODELO_LECTURA,
  };
  const metaLog = {
    etiqueta: "doc.leer-pdf",
    detalle: archivo.nombre,
    modelo: MODELO_LECTURA,
  };
  const texto = await leerArchivoConVision(
    archivo,
    MAX_TOKENS_POR_PAGINA,
    metaLog,
    opts,
  );
  return {
    texto,
    alertas: auditarLectura(texto).alertas,
    meta: {
      fuente: "vision",
      paginas: 1,
      chars_embebido: 0,
      confiable_embebido: false,
      texto_vision: texto,
    },
    interpretar: texto.trim().length > 0,
  };
}

function vacioLectura(): LecturaDocumento {
  return { texto: "", pares: [], tablas: [] };
}

function normalizarLectura(raw: Record<string, unknown>): LecturaDocumento {
  const texto = String(raw.texto ?? "").trim();

  const pares: ParLeido[] = [];
  if (Array.isArray(raw.pares)) {
    for (const p of raw.pares) {
      if (!p || typeof p !== "object") continue;
      const o = p as Record<string, unknown>;
      const etiqueta = String(o.etiqueta ?? "").trim();
      const valor = String(o.valor ?? "").trim();
      if (!etiqueta && !valor) continue;
      pares.push({ etiqueta: etiqueta || "?", valor });
    }
  }

  const tablas: TablaLeida[] = [];
  if (Array.isArray(raw.tablas)) {
    for (const t of raw.tablas) {
      if (!t || typeof t !== "object") continue;
      const o = t as Record<string, unknown>;
      const columnas = Array.isArray(o.columnas)
        ? o.columnas.map((c) => String(c ?? "").trim()).filter(Boolean)
        : [];
      const filas: string[][] = [];
      if (Array.isArray(o.filas)) {
        for (const f of o.filas) {
          if (!Array.isArray(f)) continue;
          const fila = f.map((c) => String(c ?? "").trim());
          if (fila.some(Boolean)) filas.push(fila);
        }
      }
      if (!columnas.length && !filas.length) continue;
      const item: TablaLeida = { columnas, filas };
      const titulo = String(o.titulo ?? "").trim();
      if (titulo) item.titulo = titulo;
      tablas.push(item);
    }
  }

  return { texto, pares, tablas };
}

export function lecturaTieneContenido(lectura: LecturaDocumento): boolean {
  if (lectura.texto.trim().length > 20) return true;
  if (lectura.pares.some((p) => p.valor.trim())) return true;
  if (lectura.tablas.some((t) => t.filas.length > 0)) return true;
  return false;
}

export function serializarLectura(lectura: LecturaDocumento): string {
  const lineas: string[] = ["LECTURA DEL PDF:"];
  if (lectura.texto.trim()) {
    lineas.push(lectura.texto.trim());
  }
  for (const p of lectura.pares) {
    lineas.push(`${p.etiqueta}: ${p.valor}`);
  }
  for (const t of lectura.tablas) {
    if (t.titulo) lineas.push(`[${t.titulo}]`);
    if (t.columnas.length) lineas.push("| " + t.columnas.join(" | ") + " |");
    for (const fila of t.filas) {
      lineas.push("| " + fila.join(" | ") + " |");
    }
  }
  return lineas.join("\n");
}

export async function pipelineDocumentoSubido(
  archivo: ArchivoIA,
  opts?: { tipoConocido?: DocType | null; contextoOperacion?: string | null },
): Promise<ResultadoPipelineDocumento> {
  const tipo = opts?.tipoConocido ?? "otro";

  const vacio: ResultadoPipelineDocumento = {
    tipo,
    resumen: "",
    datos: { ...VACIO_DATOS_DOC },
    lectura: vacioLectura(),
    lectura_bruta: vacioLectura(),
    meta_lectura: null,
    vacios_interpretacion: [],
    alertas_lectura: [],
  };

  try {
    const { texto: transcripcion, alertas, meta, interpretar } =
      await transcribirArchivo(archivo);
    const lectura: LecturaDocumento = {
      texto: transcripcion.trim(),
      pares: [],
      tablas: [],
    };
    const lecturaBruta: LecturaBrutaDocumento = {
      ...lectura,
      ...(meta ? { meta_lectura: meta } : {}),
    };
    const vacios: VacioInterpretacion[] = [];
    if (!lecturaTieneContenido(lectura)) {
      vacios.push({
        campo: "documento_completo",
        donde: "PDF",
        motivo: "lectura vacía",
      });
    }
    for (const a of alertas) {
      vacios.push({
        campo: a.fragmento || a.tipo,
        donde: "lectura",
        motivo: a.detalle,
      });
    }

    let datos: DatosDocumentoOperacion = { ...VACIO_DATOS_DOC };
    if (lecturaTieneContenido(lectura) && interpretar) {
      datos = await interpretarLecturaDocumento({
        texto: lectura.texto,
        nombreArchivo: archivo.nombre,
        tipo,
        rol: archivo.rol,
        contextoOperacion: opts?.contextoOperacion ?? null,
      });
    }

    const resumenDatos =
      datos.mercaderia?.mercaderia?.slice(0, 80) ??
      datos.comercial?.incoterm ??
      "";
    const resumen =
      resumenDatos.trim() ||
      lectura.texto.slice(0, 240);

    return {
      tipo,
      resumen,
      datos,
      lectura,
      lectura_bruta: lecturaBruta,
      meta_lectura: meta,
      vacios_interpretacion: vacios,
      alertas_lectura: alertas,
    };
  } catch (err) {
    console.error(`[doc.leer-pdf] ${archivo.nombre}:`, err);
    return vacio;
  }
}

type DocMeta = Pick<
  DocumentRow,
  "doc_type" | "file_name" | "stored_name" | "size" | "extraccion_ia"
>;

function lecturaDesdeCache(doc: DocMeta): LecturaDocumento | null {
  const cache = parseExtraccionDoc(doc.extraccion_ia);
  if (!cache || !extraccionDocVigente(doc, cache)) return null;
  const bruta = cache.lectura_bruta;
  if (!bruta || typeof bruta !== "object") return null;
  return normalizarLectura(bruta as Record<string, unknown>);
}

export function contextoDocumentosParaCruce(docs: DocMeta[]): string | null {
  const lineas: string[] = [];
  for (const d of docs) {
    const lectura = lecturaDesdeCache(d);
    const raw = rawDatosDesdeCache(d);
    const label = DOC_LABELS[d.doc_type as DocType] ?? d.doc_type;
    const cache = parseExtraccionDoc(d.extraccion_ia);

    if (!lectura && !raw) continue;

    lineas.push(`=== ${label} (${d.file_name}) ===`);
    if (cache?.resumen?.trim()) lineas.push(cache.resumen.trim());
    if (lectura && lecturaTieneContenido(lectura)) {
      lineas.push(serializarLectura(lectura));
    }
    if (raw && typeof raw === "object") {
      lineas.push(
        serializarDatosDocumento(
          normalizarDatosDocumentoOperacion({ datos: raw }),
        ),
      );
    }
    lineas.push("");
  }
  return lineas.length ? lineas.join("\n").trim() : null;
}

export const lecturaBrutaTieneContenido = lecturaTieneContenido;
export const serializarLecturaBruta = serializarLectura;
