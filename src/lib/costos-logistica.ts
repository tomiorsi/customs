/**
 * Costos de logística nacional de una importación (Argentina, 2026) y su
 * ubicación en el timeline del despacho.
 *
 * Fuentes (orientativas, editables por el operador):
 * - Informe CIRA "Comparación de costos portuarios" (oct-2024): los gastos
 *   locales por contenedor en Buenos Aires van de ~USD 1.000 a 1.800 dentro del
 *   forzoso; BA es el puerto más caro de la región (40HC entre 50% y 500% más).
 * - Estudio SELA del Puerto de Buenos Aires (taxonomía de rubros de terminal y
 *   agencia marítima).
 * - Tarifario CMA CGM Argentina (BL fee, Delivery Order, terminal access, THC).
 * - AGP Res. 148/2025: cargo ZAP USD 14,50 por contenedor lleno (sin bonificar
 *   desde 1/1/2026).
 * - Demurrage/detention: USD 50–200+/día por contenedor pasado el forzoso
 *   (DRY ~7 días, REEFER ~3). Es un RIESGO, no un costo por defecto.
 *
 * El VEP de tributos lo paga el cliente directo (no entra en el adelanto). El
 * adelanto que pide el despachante cubre la logística. El retiro del contenedor
 * se habilita con la carta de compromiso y garantía (anual o puntual), que es un
 * requisito documental, no un costo.
 */

/** Tipo de contenedor (o modalidad sin contenedor). */
export type TipoContenedor =
  | "20STD"
  | "40STD"
  | "40HC"
  | "20RF"
  | "40RF"
  | "LCL"
  | "AEREO";

export type ModalidadCarga = "FCL" | "LCL" | "AEREO";

export const TIPOS_CONTENEDOR: {
  value: TipoContenedor;
  label: string;
  modalidad: ModalidadCarga;
}[] = [
  { value: "20STD", label: "Contenedor 20' estándar", modalidad: "FCL" },
  { value: "40STD", label: "Contenedor 40' estándar", modalidad: "FCL" },
  { value: "40HC", label: "Contenedor 40' High Cube", modalidad: "FCL" },
  { value: "20RF", label: "Contenedor 20' refrigerado (reefer)", modalidad: "FCL" },
  { value: "40RF", label: "Contenedor 40' refrigerado (reefer)", modalidad: "FCL" },
  { value: "LCL", label: "Carga suelta / consolidada (LCL)", modalidad: "LCL" },
  { value: "AEREO", label: "Carga aérea", modalidad: "AEREO" },
];

export function modalidadDe(tipo: TipoContenedor): ModalidadCarga {
  return TIPOS_CONTENEDOR.find((t) => t.value === tipo)?.modalidad ?? "FCL";
}

export function labelTipoContenedor(tipo: TipoContenedor | null | undefined): string {
  if (!tipo) return "Sin definir";
  return TIPOS_CONTENEDOR.find((t) => t.value === tipo)?.label ?? tipo;
}

/* ─────────────────── Detección por código ISO 6346 ─────────────────── */

/**
 * Detecta el tipo de contenedor a partir de un texto (código ISO 6346 del BL,
 * p.ej. "22G1", "45G1", "45R1", o descripciones como "40 HC", "20 reefer").
 * Devuelve null si no reconoce nada.
 *
 * ISO 6346 — primer dígito = largo (2=20', 4=40', L=45'), segundo = altura/tipo
 * (2=estándar 8'6", 5=High Cube 9'6"), últimos = tipo (G=general, R=reefer).
 */
export function detectarContenedorISO(
  texto: string | null | undefined,
): TipoContenedor | null {
  if (!texto) return null;
  const t = texto.toUpperCase();

  // 1) Código ISO 6346 explícito (4 chars): 22G1, 42G1, 45G1, 45R1, 22R1...
  const iso = t.match(/\b([24L])([0-9])([GRUPTHBVS])[0-9]\b/);
  if (iso) {
    const largo = iso[1];
    const alt = iso[2];
    const tipo = iso[3];
    const esReefer = tipo === "R";
    if (largo === "2") return esReefer ? "20RF" : "20STD";
    if (largo === "4" || largo === "L") {
      if (esReefer) return "40RF";
      return alt === "5" || alt === "6" || largo === "L" ? "40HC" : "40STD";
    }
  }

  // 2) Texto libre.
  const reefer = /\b(REEFER|REFRIGERAD|RF\b)/.test(t);
  const hc = /\b(HIGH\s*CUBE|HC|HQ)\b/.test(t);
  const c20 = /\b(20'|20\s*(PIES|FT|FEET|FOOT|HC|GP|DV|DC|RF))/.test(t) || /\b1\s*X\s*20\b/.test(t);
  const c40 = /\b(40'|40\s*(PIES|FT|FEET|FOOT|HC|GP|DV|DC|RF))/.test(t) || /\b1\s*X\s*40\b/.test(t);
  if (c40 || hc) {
    if (reefer) return "40RF";
    return hc ? "40HC" : "40STD";
  }
  if (c20) return reefer ? "20RF" : "20STD";

  // 3) Indicios de modalidad sin contenedor.
  if (/\bLCL\b|CONSOLIDAD|GROUPAGE|CARGA SUELTA/.test(t)) return "LCL";
  if (/\bAWB\b|A[ÉE]REO|AIR\s*WAYBILL|GU[ÍI]A A[ÉE]REA/.test(t)) return "AEREO";

  return null;
}

/** Cuenta contenedores a partir de los números de contenedor presentes (ABCU1234567). */
export function contarContenedores(texto: string | null | undefined): number {
  if (!texto) return 0;
  return extraerCodigosContenedor(texto).length;
}

/** Extrae códigos ISO 6346 (4 letras + 6–7 dígitos) en orden de aparición. */
export function extraerCodigosContenedor(
  texto: string | null | undefined,
): string[] {
  if (!texto?.trim()) return [];
  const matches = texto.toUpperCase().match(/\b[A-Z]{4}\s?\d{6,7}\b/g);
  if (!matches) return [];
  return matches.map((m) => m.replace(/\s/g, ""));
}

/** Valida el dígito verificador ISO 6346 (11 caracteres: owner + serial + check). */
export function esContenedorIso6346Valido(codigo: string): boolean {
  const c = codigo.toUpperCase().replace(/\s/g, "");
  if (!/^[A-Z]{4}\d{7}$/.test(c)) return false;
  const map: Record<string, number> = {};
  let n = 10;
  for (let i = 0; i < 26; i++) {
    while (n % 11 === 0) n++;
    map[String.fromCharCode(65 + i)] = n++;
  }
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = c[i];
    const v = /[0-9]/.test(ch) ? parseInt(ch, 10) : map[ch];
    if (v == null) return false;
    sum += v * 2 ** i;
  }
  const check = sum % 11;
  const esperado = check === 10 ? 0 : check;
  return parseInt(c[10], 10) === esperado;
}

function distanciaEdicion(a: string, b: string): number {
  if (a.length !== b.length) return Math.max(a.length, b.length);
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

/**
 * Deja una sola entrada por contenedor real: quita duplicados exactos y, si la IA
 * listó dos códigos casi iguales (OCR), descarta el inválido ISO (p. ej. 4436063
 * vs 1436063). NO fusiona contenedores distintos del mismo owner (MRKU… ×2).
 */
export function resolverConflictosContenedor(codigos: string[]): string[] {
  const unicos: string[] = [];
  const vistos = new Set<string>();
  for (const raw of codigos) {
    const c = raw.toUpperCase().replace(/\s/g, "");
    if (vistos.has(c)) continue;
    vistos.add(c);
    unicos.push(c);
  }

  const eliminar = new Set<string>();
  for (let i = 0; i < unicos.length; i++) {
    for (let j = i + 1; j < unicos.length; j++) {
      const a = unicos[i]!;
      const b = unicos[j]!;
      // Variante OCR: mismo owner, o mismo serial con typo en el prefijo (TCKU vs TGKU).
      const mismoOwner = a.slice(0, 4) === b.slice(0, 4);
      const mismoSerial = a.slice(4) === b.slice(4);
      if ((!mismoOwner && !mismoSerial) || distanciaEdicion(a, b) > 2) continue;
      const va = esContenedorIso6346Valido(a);
      const vb = esContenedorIso6346Valido(b);
      if (va && !vb) eliminar.add(b);
      else if (vb && !va) eliminar.add(a);
      // Ambos válidos: posible duplicado lógico u OCR ambiguo → lo resuelve
      // la unión de contenedores en reconciliarDocumentosOperacion (sin IA).
    }
  }

  return unicos.filter((c) => !eliminar.has(c));
}

/** Agrupa variantes OCR del mismo contenedor (mismo owner, ≤2 dígitos de diferencia). */
export function detectarGruposConflictoContenedor(
  codigos: string[],
): { variantes: string[] }[] {
  const unicos = [...new Set(codigos.map((c) => c.toUpperCase().replace(/\s/g, "")))];
  const usados = new Set<string>();
  const grupos: { variantes: string[] }[] = [];
  for (let i = 0; i < unicos.length; i++) {
    const a = unicos[i]!;
    if (usados.has(a)) continue;
    const grupo = [a];
    for (let j = i + 1; j < unicos.length; j++) {
      const b = unicos[j]!;
      if (usados.has(b)) continue;
      const mismoOwner = a.slice(0, 4) === b.slice(0, 4);
      const mismoSerial = a.slice(4) === b.slice(4);
      if ((mismoOwner || mismoSerial) && distanciaEdicion(a, b) <= 2) {
        grupo.push(b);
        usados.add(b);
      }
    }
    if (grupo.length > 1) {
      grupos.push({ variantes: grupo });
      grupo.forEach((c) => usados.add(c));
    }
  }
  return grupos;
}

export function sonVariantesOcrContenedor(a: string, b: string): boolean {
  const x = a.toUpperCase().replace(/\s/g, "");
  const y = b.toUpperCase().replace(/\s/g, "");
  if (distanciaEdicion(x, y) > 2) return false;
  return x.slice(0, 4) === y.slice(0, 4) || x.slice(4) === y.slice(4);
}

/**
 * Normaliza y consolida una lista de contenedores. La lista `nueva` REEMPLAZA a
 * la anterior (no se suman): sirve cuando el BL corrige OCR del packing.
 */
export function consolidarListaContenedores(
  anterior: string | null | undefined,
  nueva: string | null | undefined,
  cantidadExplicita?: string | null,
): { lista: string | null; cantidad: number } {
  const codigosNuevos = extraerCodigosContenedor(nueva);
  const base =
    codigosNuevos.length > 0 ? codigosNuevos : extraerCodigosContenedor(anterior);
  let resueltos = resolverConflictosContenedor(base);

  const cantObj = cantidadExplicita ? parseInt(cantidadExplicita, 10) : NaN;
  if (Number.isFinite(cantObj) && cantObj > 0 && resueltos.length > cantObj) {
    const validos = resueltos.filter(esContenedorIso6346Valido);
    const invalidos = resueltos.length - validos.length;
    // Solo recortamos si hay códigos inválidos/duplicados OCR de más respecto a la
    // cantidad declarada. Si todos son ISO válidos, la lista manda aunque cantObj
    // esté desactualizado (evita quedar atrapado en 7 cuando el BL trae 8).
    if (invalidos > 0 && validos.length >= cantObj) {
      resueltos = validos.slice(0, cantObj);
    }
  }

  if (resueltos.length === 0) return { lista: null, cantidad: 0 };
  return { lista: resueltos.join(", "), cantidad: resueltos.length };
}

/** Deduplica y corrige OCR en números ISO 6346. */
export function normalizarListaContenedores(
  texto: string | null | undefined,
): string | null {
  const { lista } = consolidarListaContenedores(null, texto);
  return lista;
}

/** Une varias listas (packing + BL + gastos) y resuelve OCR por dígito verificador ISO. */
export function unirListasContenedores(
  listas: string[],
): { lista: string | null; cantidad: number } {
  const texto = listas.filter(Boolean).join(", ");
  return consolidarListaContenedores(null, texto);
}

/* ───────────────────────── Valores por defecto ───────────────────────── */

/**
 * Tarifas de TERMINAL PORTUARIA (servicio a la carga de importación / "Tarifa B")
 * por tipo de contenedor (USD). Referencia 2026: tarifario de terminal
 * (Zárate, vig. 1/5/2026) — 20' ≈ 434, 40' ≈ 799 dentro del forzoso de 7 días.
 * Buenos Aires es el puerto más caro de la región (CIRA). Editables por el operador.
 *
 * NOTA: la naviera NO cobra un depósito en efectivo por contenedor. El retiro se
 * habilita con la CARTA DE COMPROMISO Y GARANTÍA (anual o puntual por embarque)
 * que firma el consignatario ante escribano: es un requisito documental, no un
 * costo. La demora (demurrage) por exceder los días libres es un riesgo contingente,
 * no un costo por adelantado. Por eso acá no se modela ninguna garantía reembolsable.
 */
export const TARIFA_CONTENEDOR: Record<
  Exclude<TipoContenedor, "LCL" | "AEREO">,
  { thc: number; energiaReefer?: number }
> = {
  "20STD": { thc: 434 },
  "40STD": { thc: 799 },
  "40HC": { thc: 799 },
  "20RF": { thc: 520, energiaReefer: 120 },
  "40RF": { thc: 880, energiaReefer: 180 },
};

/** Parámetros por defecto del modelo de costos de logística (editables). */
export const DEFAULTS_LOGISTICA = {
  // Naviera / agencia marítima — gastos locales de importación en Argentina 2026
  // (referencia: facturas de naviera tipo Maersk). Hay "doble cobro" de THC: la
  // naviera cobra DHC además de la terminal portuaria (ver TARIFA_CONTENEDOR).
  emisionBl: 60, // DDF / documentación del BL — por BL (una vez)
  isps: 25, // PBIP / seguridad — por BL (una vez)
  servicioImportacion: 325, // IMP / liberación de la naviera — por contenedor
  handlingNaviera: 305, // DHC manipulación de la naviera en destino — por contenedor
  emiImport: 45, // EMI mantenimiento de equipo (impo), DRY — por contenedor (obligatorio)
  emiImportReefer: 90, // EMI reefer — por contenedor
  // Costo de courier para recibir el BL ORIGINAL del exterior (cuando no es telex
  // release / sea waybill). Sólo aplica si el pedido de compra exige original.
  courierBlOriginal: 90,
  // ZAP por contenedor (AGP, sin bonificar desde 2026).
  zap: 14.5,
  // LCL (por unidad facturable W/M = mayor entre tonelada y m³).
  thcLclPorWM: 25,
  thcLclMin: 90,
  desconsolidacionLcl: 120,
  // Aéreo (importación): depósito fiscal TCA (por kg, con mínimo) + gastos del
  // agente de carga aéreo. Referencia 2026: régimen de precios de TCA (Aeropuertos
  // Argentina Cargas, Ezeiza; precio flat hasta 7 días) y tarifarios de agentes.
  depositoAereoPorKg: 0.18,
  depositoAereoMin: 130,
  handlingAereo: 120, // gastos del agente de carga aéreo (handling AWB)
  awbFee: 80, // emisión / AWB fee
  transmisionAereo: 60, // transmisión a la aduana
  // Terrestre (CRT Mercosur / ATIT): gastos del Agente de Transporte Aduanero
  // (emisión CRT + MIC/DTA) y depósito fiscal / descarga por unidad. El depósito
  // fiscal terrestre es bastante más barato que la terminal portuaria.
  agenteTerrestre: 150,
  depositoTerrestrePorUnidad: 200,
  // Gastos de despacho / generales (fijo): sellados, formularios, transmisión
  // SIM, courier de documentos, digitalización y guarda 5 años.
  gastosDespacho: 100,
  // Transporte interno (por defecto 0: depende del destino, lo carga el operador).
  transporteInterno: 0,
};

/** Modo de transporte canónico, derivado de la vía de la operación. */
export type ModoTransporte = "maritima" | "aerea" | "terrestre";

export const VIAS_CANON = ["maritima", "aerea", "terrestre"] as const;
export type ViaCanon = (typeof VIAS_CANON)[number];

export const MODO_LOGISTICA_LABEL: Record<ModoTransporte, string> = {
  maritima: "Marítimo/fluvial (BL)",
  aerea: "Aéreo (AWB)",
  terrestre: "Terrestre (CRT)",
};

/** Normaliza texto de vía/medio de transporte al valor canónico de la operación. */
export function normalizarViaCanon(
  value: string | null | undefined,
): ViaCanon | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "aerea" || v === "aereo" || v.startsWith("aer") || /\b(air|awb|airway)\b/.test(v)) {
    return "aerea";
  }
  if (
    v === "terrestre" ||
    v.startsWith("terr") ||
    /\b(road|ground|truck|crt|carretera|camion|camión)\b/.test(v)
  ) {
    return "terrestre";
  }
  if (
    v === "maritima" ||
    v.startsWith("mar") ||
    /\b(ocean|vessel|bl|b\/l|sea|naviera|acuatico|acuático)\b/.test(v)
  ) {
    return "maritima";
  }
  return null;
}

export type ContextoLogistica = {
  via: ViaCanon | null;
  modo: ModoTransporte | null;
  tipo: TipoContenedor | null;
  cantidad: number;
  viaInferida: boolean;
};

/**
 * Arma el contexto de logística de una operación: vía, modo (mar/aer/terr) y
 * tipo de carga. Usa `via` de la operación (reconciliada); si falta, infiere
 * solo desde medio de transporte o tipo de contenedor (AWB → aéreo, FCL → marítimo).
 */
export function resolverContextoLogistica(args: {
  via?: string | null;
  medioTransporte?: string | null;
  tipoContenedor?: string | null;
  contenedor?: string | null;
  tipoEmbalaje?: string | null;
  cantidadContenedores?: string | null;
  docs?: ReadonlyArray<{ doc_type: string; file_name: string }>;
}): ContextoLogistica {
  let viaInferida = false;
  let via = normalizarViaCanon(args.via);

  if (!via) {
    via = normalizarViaCanon(args.medioTransporte);
    if (via) viaInferida = true;
  }

  let tipo: TipoContenedor | null = null;
  const tcRaw = (args.tipoContenedor ?? "").toUpperCase().replace(/\s/g, "");
  if (TIPOS_CONTENEDOR.some((t) => t.value === tcRaw)) {
    tipo = tcRaw as TipoContenedor;
  }
  if (!tipo) {
    tipo =
      detectarContenedorISO(args.contenedor) ||
      detectarContenedorISO(args.tipoEmbalaje);
  }

  if (!via && tipo === "AEREO") {
    via = "aerea";
    viaInferida = true;
  }
  if (!via && tipo && modalidadDe(tipo) === "FCL") {
    via = "maritima";
    viaInferida = true;
  }

  const cantidad = Math.max(
    1,
    Math.floor(Number(args.cantidadContenedores) || 1),
  );

  let modo: ModoTransporte | null = via;
  if (!modo && tipo === "AEREO") modo = "aerea";

  if (!tipo && modo) {
    if (modo === "aerea") tipo = "AEREO";
    else if (modo === "terrestre") tipo = "LCL";
    else tipo = "40HC";
  } else if (modo === "aerea" && tipo !== "AEREO") {
    tipo = "AEREO";
  }

  return { via, modo, tipo, cantidad, viaInferida };
}

export function modoTransporte(
  via: string | null | undefined,
  modalidad: ModalidadCarga,
): ModoTransporte {
  const canon = normalizarViaCanon(via);
  if (canon) return canon;
  return modalidad === "AEREO" ? "aerea" : "maritima";
}

/** Nombre del documento de transporte según el modo. */
export function documentoTransporte(modo: ModoTransporte): string {
  return modo === "aerea" ? "AWB" : modo === "terrestre" ? "CRT" : "BL";
}

/* ───────────────────── Cálculo de costos de logística ───────────────────── */

export type GrupoCosto =
  | "naviera"
  | "terminal"
  | "despacho"
  | "transporte"
  | "reembolsable";

/** Etapa del workflow donde ocurre/se paga el costo (para el timeline). */
export type EtapaCosto =
  | "embarque"
  | "retiro"
  | "cierre";

export type LineaCostoLogistica = {
  id: string;
  label: string;
  grupo: GrupoCosto;
  etapa: EtapaCosto;
  monto: number;
  reembolsable: boolean;
  nota?: string;
};

export type LogisticaInput = {
  tipo: TipoContenedor;
  cantidad: number;
  /** Vía de la operación (marítima / aérea / terrestre). Define qué gastos aplican. */
  via?: string | null;
  /** Modo resuelto (prioriza sobre inferencia interna por vía/modalidad). */
  modo?: ModoTransporte | null;
  /** Peso bruto total (kg), para LCL/aéreo. */
  pesoKg?: number;
  /** Volumen total (m³ / CBM), para LCL. */
  cbm?: number;
  /** El BL llega como original a canjear (courier desde origen). Del pedido de compra. */
  blOriginal?: boolean;
  /** Overrides del operador (por id de línea → monto). */
  overrides?: Record<string, number>;
  /** Transporte interno estimado (USD), si el operador lo carga. */
  transporteInterno?: number;
  /**
   * Estimar con tarifas de referencia (DEFAULTS_LOGISTICA / TARIFA_CONTENEDOR).
   * Default true (cotizador estimativo del cliente). En el Paso 1 / operación se
   * pasa false: NO se inventa ningún gasto local: cada línea arranca en 0 y solo
   * toma valor del dato REAL (override del operador o factura del forwarder).
   */
  estimar?: boolean;
};

export type LogisticaResult = {
  lineas: LineaCostoLogistica[];
  /** Costo real de logística: naviera + terminal + despacho + transporte. */
  costoLogistica: number;
  /**
   * Adelanto sugerido al cliente = lo que el despachante paga por cuenta y orden
   * (logística). Los tributos NO entran (VEP del cliente).
   */
  adelanto: number;
  modalidad: ModalidadCarga;
  /** Null si aún no se pudo determinar marítimo / aéreo / terrestre. */
  modo: ModoTransporte | null;
};

function montoDe(
  id: string,
  base: number,
  overrides?: Record<string, number>,
): number {
  const o = overrides?.[id];
  return o != null && Number.isFinite(o) ? o : base;
}

/**
 * Calcula las líneas de costo de logística nacional según el MODO de transporte
 * (marítimo/BL, aéreo/AWB, terrestre/CRT) y el tipo/cantidad de contenedor.
 * Cada línea queda etiquetada con la etapa del timeline donde se paga.
 */
export function calcularLogistica(i: LogisticaInput): LogisticaResult {
  const d = DEFAULTS_LOGISTICA;
  const ov = i.overrides;
  const cant = Math.max(1, Math.floor(i.cantidad || 1));
  const modalidad = modalidadDe(i.tipo);
  const modo =
    i.modo !== undefined
      ? i.modo
      : normalizarViaCanon(i.via)
        ? (normalizarViaCanon(i.via) as ModoTransporte)
        : modoTransporte(i.via, modalidad);
  const lineas: LineaCostoLogistica[] = [];
  // Modo real (estimar=false): NO se inventa ningún gasto. Cada valor de
  // referencia se anula a 0; la línea solo toma monto si hay un override REAL
  // (cargado por el operador o leído de la factura del forwarder). El cotizador
  // del cliente deja estimar por defecto (true) y usa las tarifas de referencia.
  const estimar = i.estimar !== false;
  const ref = (v: number) => (estimar ? v : 0);

  // Sin modo definido (sin vía ni documento de transporte): no listamos rubros
  // marítimos por defecto; sólo transporte interno y gastos de despacho.
  if (!modo) {
    const transp = i.transporteInterno ?? montoDe("transporte_interno", ref(d.transporteInterno), ov);
    if (transp > 0 || !estimar) {
      lineas.push({
        id: "transporte_interno",
        label: "Transporte interno (puerto/terminal → empresa o depósito del cliente)",
        grupo: "transporte",
        etapa: "retiro",
        monto: transp,
        reembolsable: false,
        nota:
          transp > 0
            ? undefined
            : "Carga manual: el flete del puerto hasta el lugar del cliente.",
      });
    }
    lineas.push({
      id: "gastos_despacho",
      label: "Gastos de despacho (sellados, transmisión, digitalización y guarda)",
      grupo: "despacho",
      etapa: "cierre",
      monto: montoDe("gastos_despacho", ref(d.gastosDespacho), ov),
      reembolsable: false,
    });
    const costoLogistica = lineas
      .filter((l) => !l.reembolsable)
      .reduce((s, l) => s + l.monto, 0);
    return { lineas, costoLogistica, adelanto: costoLogistica, modalidad, modo: null };
  }

  // 1) Liberación del documento de transporte (etapa embarque).
  if (modo === "maritima") {
    const esReefer = i.tipo === "20RF" || i.tipo === "40RF";
    // Por BL (una vez por embarque).
    lineas.push({
      id: "emision_bl",
      label: "Emisión / documentación del BL (DDF)",
      grupo: "naviera",
      etapa: "embarque",
      monto: montoDe("emision_bl", ref(d.emisionBl), ov),
      reembolsable: false,
    });
    lineas.push({
      id: "isps",
      label: "ISPS / seguridad portuaria (PBIP)",
      grupo: "naviera",
      etapa: "embarque",
      monto: montoDe("isps", ref(d.isps), ov),
      reembolsable: false,
    });
    // Por contenedor (se multiplican por la cantidad).
    lineas.push({
      id: "servicio_importacion",
      label: `Servicio de importación / liberación naviera (${cant}× cont.)`,
      grupo: "naviera",
      etapa: "embarque",
      monto: montoDe("servicio_importacion", ref(d.servicioImportacion * cant), ov),
      reembolsable: false,
    });
    lineas.push({
      id: "handling_naviera",
      label: `Manipulación naviera en destino — DHC (${cant}×)`,
      grupo: "naviera",
      etapa: "embarque",
      monto: montoDe("handling_naviera", ref(d.handlingNaviera * cant), ov),
      reembolsable: false,
      nota: "La naviera cobra DHC además del THC de la terminal (doble cobro habitual en Argentina).",
    });
    lineas.push({
      id: "emi",
      label: `Mantenimiento de equipo — EMI (${cant}×)`,
      grupo: "naviera",
      etapa: "embarque",
      monto: montoDe("emi", ref((esReefer ? d.emiImportReefer : d.emiImport) * cant), ov),
      reembolsable: false,
      nota: "Cargo obligatorio de la naviera en importación (reparación/limpieza del contenedor).",
    });
    // BL original: courier desde el exterior para canjearlo (si no es telex/waybill).
    if (i.blOriginal) {
      lineas.push({
        id: "courier_bl",
        label: "Courier del BL original desde origen",
        grupo: "naviera",
        etapa: "embarque",
        monto: montoDe("courier_bl", ref(d.courierBlOriginal), ov),
        reembolsable: false,
        nota: "Sólo si el BL es original (no telex release / sea waybill).",
      });
    }
  } else if (modo === "aerea") {
    lineas.push({
      id: "agente_aereo",
      label: "Gastos del agente de carga aéreo (handling AWB)",
      grupo: "naviera",
      etapa: "embarque",
      monto: montoDe("agente_aereo", ref(d.handlingAereo), ov),
      reembolsable: false,
    });
    lineas.push({
      id: "awb_fee",
      label: "Emisión / AWB fee",
      grupo: "naviera",
      etapa: "embarque",
      monto: montoDe("awb_fee", ref(d.awbFee), ov),
      reembolsable: false,
    });
    lineas.push({
      id: "transmision_aereo",
      label: "Transmisión a la aduana",
      grupo: "naviera",
      etapa: "embarque",
      monto: montoDe("transmision_aereo", ref(d.transmisionAereo), ov),
      reembolsable: false,
    });
  } else {
    lineas.push({
      id: "agente_terrestre",
      label: "Gastos del ATA (emisión CRT + MIC/DTA)",
      grupo: "naviera",
      etapa: "embarque",
      monto: montoDe("agente_terrestre", ref(d.agenteTerrestre), ov),
      reembolsable: false,
    });
  }

  // 2) Terminal / depósito fiscal — se paga al retiro (etapa retiro).
  if (modo === "aerea") {
    const peso = i.pesoKg ?? 0;
    const deposito = ref(Math.max(d.depositoAereoPorKg * peso, d.depositoAereoMin));
    lineas.push({
      id: "handling_aereo",
      label: `Depósito fiscal aéreo TCA (${peso > 0 ? `${peso.toFixed(0)} kg` : "mín."})`,
      grupo: "terminal",
      etapa: "retiro",
      monto: montoDe("handling_aereo", deposito, ov),
      reembolsable: false,
    });
  } else if (modo === "terrestre") {
    if (modalidad === "FCL") {
      lineas.push({
        id: "deposito_terrestre",
        label: `Depósito fiscal / descarga (${cant}× ${labelTipoContenedor(i.tipo)})`,
        grupo: "terminal",
        etapa: "retiro",
        monto: montoDe("deposito_terrestre", ref(d.depositoTerrestrePorUnidad * cant), ov),
        reembolsable: false,
      });
    } else {
      const wm = Math.max(i.pesoKg ? i.pesoKg / 1000 : 0, i.cbm ?? 0);
      const dep = ref(Math.max(d.thcLclPorWM * wm, d.thcLclMin));
      lineas.push({
        id: "deposito_terrestre",
        label: `Depósito fiscal terrestre (${wm > 0 ? `${wm.toFixed(1)} W/M` : "mín."})`,
        grupo: "terminal",
        etapa: "retiro",
        monto: montoDe("deposito_terrestre", dep, ov),
        reembolsable: false,
      });
    }
  } else if (modalidad === "FCL") {
    const tarifa =
      TARIFA_CONTENEDOR[i.tipo as Exclude<TipoContenedor, "LCL" | "AEREO">];
    lineas.push({
      id: "thc_terminal",
      label: `Terminal / entrega importación (${cant}× ${labelTipoContenedor(i.tipo)})`,
      grupo: "terminal",
      etapa: "retiro",
      monto: montoDe("thc_terminal", ref(tarifa.thc * cant), ov),
      reembolsable: false,
    });
    if (tarifa.energiaReefer) {
      lineas.push({
        id: "energia_reefer",
        label: "Energía / monitoreo reefer",
        grupo: "terminal",
        etapa: "retiro",
        monto: montoDe("energia_reefer", ref(tarifa.energiaReefer * cant), ov),
        reembolsable: false,
      });
    }
    lineas.push({
      id: "zap",
      label: "Cargo ZAP (AGP)",
      grupo: "terminal",
      etapa: "retiro",
      monto: montoDe("zap", ref(d.zap * cant), ov),
      reembolsable: false,
    });
  } else {
    // Marítimo LCL: manipuleo + desconsolidación.
    const wm = Math.max(i.pesoKg ? i.pesoKg / 1000 : 0, i.cbm ?? 0);
    const thcLcl = ref(Math.max(d.thcLclPorWM * wm, d.thcLclMin));
    lineas.push({
      id: "thc_lcl",
      label: `Terminal / manipuleo LCL (${wm > 0 ? `${wm.toFixed(1)} W/M` : "mín."})`,
      grupo: "terminal",
      etapa: "retiro",
      monto: montoDe("thc_lcl", thcLcl, ov),
      reembolsable: false,
    });
    lineas.push({
      id: "desconsolidacion",
      label: "Desconsolidación (apertura/segregación)",
      grupo: "terminal",
      etapa: "retiro",
      monto: montoDe("desconsolidacion", ref(d.desconsolidacionLcl), ov),
      reembolsable: false,
    });
  }

  // 3) Transporte interno: flete local del puerto/terminal hasta la empresa o
  // depósito del cliente. Es de CARGA MANUAL (depende del destino y el camionero,
  // muy difícil de automatizar). En modo real lo mostramos SIEMPRE para que el
  // operador lo cargue aunque todavía sea 0; en modo estimado solo si tiene valor.
  const transp = i.transporteInterno ?? montoDe("transporte_interno", ref(d.transporteInterno), ov);
  if (transp > 0 || !estimar) {
    lineas.push({
      id: "transporte_interno",
      label: "Transporte interno (puerto/terminal → empresa o depósito del cliente)",
      grupo: "transporte",
      etapa: "retiro",
      monto: transp,
      reembolsable: false,
      nota:
        transp > 0
          ? undefined
          : "Carga manual: el flete del puerto hasta el lugar del cliente.",
    });
  }

  // 4) Gastos de despacho / generales (fijo, etapa cierre).
  lineas.push({
    id: "gastos_despacho",
    label: "Gastos de despacho (sellados, transmisión, digitalización y guarda)",
    grupo: "despacho",
    etapa: "cierre",
    monto: montoDe("gastos_despacho", ref(d.gastosDespacho), ov),
    reembolsable: false,
  });

  // La naviera NO cobra depósito en efectivo por el contenedor: el retiro se
  // habilita con la carta de compromiso y garantía (anual o puntual). Es un
  // requisito documental, no un costo. Por eso no se agrega ninguna garantía.

  const costoLogistica = lineas
    .filter((l) => !l.reembolsable)
    .reduce((s, l) => s + l.monto, 0);
  const adelanto = costoLogistica;

  return { lineas, costoLogistica, adelanto, modalidad, modo };
}

/** Riesgos que disparan costos extra (no entran en el costo base; son avisos). */
export const RIESGOS_COSTO = [
  {
    id: "demurrage",
    label: "Demurrage / detention",
    detalle:
      "Si el contenedor no se retira/devuelve dentro de los días libres (forzoso ~7 días DRY, ~3 REEFER): USD 50–200+/día por contenedor, escalonado.",
  },
  {
    id: "almacenaje",
    label: "Almacenaje excedido",
    detalle:
      "Pasado el forzoso (7 días libres), la terminal cobra almacenaje por día y por contenedor, con escala creciente: ~USD 40/día (días 8–30), 60/día (31–60) y 100/día (+60) para un 40' (la mitad para un 20'). En las terminales del Puerto de Buenos Aires (TRP, Exolgan) suele ser bastante más caro (~USD 50–150/día). Conviene retirar dentro del forzoso.",
  },
  {
    id: "canal_rojo",
    label: "Canal rojo (verificación física)",
    detalle:
      "Verificación de Aduana: ~USD 185 por verificación sobre camión, más movimientos extra y días de almacenaje. Demora 2–5 días.",
  },
] as const;
