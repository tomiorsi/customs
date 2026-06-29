/**
 * Lógica y datos para el cotizador estimado de importación (Argentina).
 * Actualizado a junio de 2026.
 *
 * Fuentes (orientativo, no reemplaza la clasificación NCM del despachante):
 * - Tasa de estadística: 3% con topes (USD 180 / 3.000 / 30.000 / 150.000 según
 *   base imponible). Prorrogada hasta el 31/12/2027 por Dto. 1140/2024. Exenta
 *   para origen Mercosur y acuerdos preferenciales que contemplen la exención.
 *   Alícuota 0% para ciertos BK/BIT (Dto. 361/19, prorrogado).
 * - Derecho de importación (DIE): Arancel Externo Común NCM, 0–35% según
 *   posición; regímenes BK/BIT con alícuotas reducidas.
 * - Red de acuerdos (Mercosur) vigente a jun-2026:
 *   · Mercosur intrazona: Brasil, Uruguay, Paraguay y Bolivia (miembro pleno
 *     desde 2024, Ley 1567; en transición al AEC hasta ~2028).
 *   · ALADI/ACE: Chile (ACE 35), Bolivia (ACE 36), Perú (ACE 58),
 *     Colombia/Ecuador/Venezuela (ACE 59), Colombia (ACE 72), México
 *     (ACE 6 y ACE 55 automotor), Cuba (ACE 62).
 *   · TLC extrarregionales: Israel, Egipto, Singapur (este último NO vigente en
 *     Argentina aún), y EFTA (firmado 09/2025, no vigente).
 *   · Preferencias fijas: India, SACU (Sudáfrica).
 *   · Mercosur–UE: Acuerdo Comercial Interino en aplicación provisional desde
 *     el 1/5/2026 (Argentina ratificó); desgravación gradual (10–15 años).
 *   · Argentina–EE.UU.: acuerdo bilateral firmado el 5/2/2026, parte arancelaria
 *     en revisión y NO vigente (no enviado al Congreso; fallo de la Corte de
 *     EE.UU. sobre aranceles IEEPA).
 *
 * Los valores por categoría son representativos y editables por el usuario.
 */

import type { TipoContenedor } from "./costos-logistica";

export type Preferencia =
  | "mercosur"
  | "tlc"
  | "parcial"
  | "ue"
  | "eeuu"
  | "extrazona";

export type Pais = {
  nombre: string;
  preferencia: Preferencia;
  /** Instrumento específico (ACE 35, TLC, Acuerdo Interino UE, etc.). */
  acuerdo?: string;
  /** Nota propia del país (pisa la nota genérica del régimen). */
  nota?: string;
};

/**
 * Info de cada régimen de preferencia (actualizado a junio 2026).
 * - di0: el derecho de importación se considera 0% (con certificado de origen).
 * - tasaExenta: exención de la tasa de estadística.
 */
export const PREF_INFO: Record<
  Preferencia,
  { di0: boolean; tasaExenta: boolean; label: string; nota?: string }
> = {
  mercosur: {
    di0: true,
    tasaExenta: true,
    label: "Mercosur — libre comercio",
    nota: "Origen Mercosur: 0% de derecho de importación y sin tasa de estadística (con certificado de origen Mercosur).",
  },
  tlc: {
    di0: true,
    tasaExenta: false,
    label: "TLC / ACE — desgravado",
    nota: "Acuerdo de libre comercio: el derecho tiende a 0% con certificado de origen. La tasa de estadística (3%) se aplica salvo exención específica del acuerdo.",
  },
  parcial: {
    di0: false,
    tasaExenta: false,
    label: "Preferencia parcial",
    nota: "Preferencia para ciertas posiciones (margen fijo), no para todo el universo arancelario. El derecho exacto depende del NCM y lo confirmamos nosotros; la tasa de estadística (3%) aplica.",
  },
  ue: {
    di0: false,
    tasaExenta: false,
    label: "Acuerdo UE — en desgravación",
    nota: "Mercosur–UE: el Acuerdo Comercial Interino se aplica de forma provisional desde el 1/5/2026 (Argentina ya lo ratificó). Algunos productos ya quedan en 0%, pero la mayoría baja de forma gradual (10–15 años) y la tasa de estadística sigue vigente. Estimamos con arancel pleno y lo afinamos por NCM.",
  },
  eeuu: {
    di0: false,
    tasaExenta: false,
    label: "Acuerdo EE.UU. — no vigente",
    nota: "El acuerdo Argentina–EE.UU. se firmó el 5/2/2026, pero las rebajas argentinas todavía NO rigen: no se envió al Congreso y la parte arancelaria quedó en revisión tras el fallo de la Corte Suprema de EE.UU. que anuló los aranceles IEEPA. Para importar a la Argentina se calcula con arancel pleno.",
  },
  extrazona: {
    di0: false,
    tasaExenta: false,
    label: "Extrazona — arancel pleno",
    nota: "Sin acuerdo preferencial: se paga el Arancel Externo Común pleno y la tasa de estadística (3%).",
  },
};

/** Países de origen frecuentes y su relación arancelaria con Argentina. */
export const PAISES: Pais[] = [
  // Mercosur (intrazona 0% + exención de tasa de estadística)
  { nombre: "Brasil", preferencia: "mercosur", acuerdo: "Mercosur (intrazona)" },
  { nombre: "Uruguay", preferencia: "mercosur", acuerdo: "Mercosur (intrazona)" },
  { nombre: "Paraguay", preferencia: "mercosur", acuerdo: "Mercosur (intrazona)" },
  {
    nombre: "Bolivia",
    preferencia: "mercosur",
    acuerdo: "Mercosur (miembro pleno) + ACE 36",
    nota: "Bolivia es miembro pleno del Mercosur desde 2024 (Ley 1567). Está en transición para adoptar el Arancel Externo Común (plazo hasta ~2028), pero el origen Bolivia ya goza de preferencia plena (ACE 36 + Mercosur): 0% de derecho y sin tasa de estadística con certificado de origen.",
  },
  // TLC / ACE profundos (prácticamente desgravados)
  { nombre: "Chile", preferencia: "tlc", acuerdo: "ACE 35" },
  { nombre: "Perú", preferencia: "tlc", acuerdo: "ACE 58" },
  { nombre: "Colombia", preferencia: "tlc", acuerdo: "ACE 59 / ACE 72" },
  { nombre: "Israel", preferencia: "tlc", acuerdo: "TLC Mercosur–Israel" },
  { nombre: "Egipto", preferencia: "tlc", acuerdo: "TLC Mercosur–Egipto" },
  // Preferencias parciales
  {
    nombre: "México",
    preferencia: "parcial",
    acuerdo: "ACE 6 + ACE 55 (automotor)",
    nota: "Con México hay preferencias acotadas: ACE 6 para un conjunto de productos y ACE 55 para el sector automotor. Fuera de esas posiciones se paga arancel pleno; lo confirmamos por NCM.",
  },
  { nombre: "Ecuador", preferencia: "parcial", acuerdo: "ACE 59" },
  { nombre: "Cuba", preferencia: "parcial", acuerdo: "ACE 62" },
  {
    nombre: "India",
    preferencia: "parcial",
    acuerdo: "Acuerdo preferencial Mercosur–India",
    nota: "Con India rige un acuerdo de preferencias fijas sobre un número limitado de posiciones (no es libre comercio). Sólo esas posiciones tienen rebaja; el resto paga arancel pleno.",
  },
  {
    nombre: "Sudáfrica",
    preferencia: "parcial",
    acuerdo: "Acuerdo preferencial Mercosur–SACU",
    nota: "Con la Unión Aduanera de África Austral (SACU) rige un acuerdo de preferencias fijas sobre ~1.000 posiciones (no es libre comercio). Sólo esas posiciones tienen rebaja; el resto paga arancel pleno.",
  },
  // Unión Europea (Acuerdo Interino en aplicación provisional desde 05/2026)
  { nombre: "Alemania", preferencia: "ue", acuerdo: "Acuerdo Interino UE (prov. 05/2026)" },
  { nombre: "España", preferencia: "ue", acuerdo: "Acuerdo Interino UE (prov. 05/2026)" },
  { nombre: "Italia", preferencia: "ue", acuerdo: "Acuerdo Interino UE (prov. 05/2026)" },
  { nombre: "Francia", preferencia: "ue", acuerdo: "Acuerdo Interino UE (prov. 05/2026)" },
  { nombre: "Países Bajos", preferencia: "ue", acuerdo: "Acuerdo Interino UE (prov. 05/2026)" },
  { nombre: "Portugal", preferencia: "ue", acuerdo: "Acuerdo Interino UE (prov. 05/2026)" },
  { nombre: "Bélgica", preferencia: "ue", acuerdo: "Acuerdo Interino UE (prov. 05/2026)" },
  { nombre: "Polonia", preferencia: "ue", acuerdo: "Acuerdo Interino UE (prov. 05/2026)" },
  { nombre: "Otro país (Unión Europea)", preferencia: "ue", acuerdo: "Acuerdo Interino UE (prov. 05/2026)" },
  // Estados Unidos (acuerdo firmado 02/2026, parte arancelaria no vigente)
  { nombre: "Estados Unidos", preferencia: "eeuu", acuerdo: "Acuerdo bilateral (firmado 02/2026, no vigente)" },
  // Extrazona (AEC pleno + tasa 3%)
  { nombre: "China", preferencia: "extrazona" },
  { nombre: "Reino Unido", preferencia: "extrazona" },
  { nombre: "Japón", preferencia: "extrazona" },
  { nombre: "Corea del Sur", preferencia: "extrazona" },
  { nombre: "Taiwán", preferencia: "extrazona" },
  { nombre: "Vietnam", preferencia: "extrazona" },
  { nombre: "Tailandia", preferencia: "extrazona" },
  { nombre: "Turquía", preferencia: "extrazona" },
  { nombre: "Canadá", preferencia: "extrazona" },
  {
    nombre: "Singapur",
    preferencia: "extrazona",
    acuerdo: "TLC Mercosur–Singapur (no vigente en Arg.)",
    nota: "El TLC Mercosur–Singapur (firmado 12/2023) ya rige con Paraguay y Uruguay, pero en la Argentina está pendiente de aprobación parlamentaria: por ahora se importa con arancel pleno.",
  },
  {
    nombre: "Suiza",
    preferencia: "extrazona",
    acuerdo: "EFTA (firmado 09/2025, no vigente)",
    nota: "El TLC Mercosur–EFTA (Suiza, Noruega, Islandia y Liechtenstein) se firmó en 09/2025 pero aún no está vigente (en ratificación): por ahora se importa con arancel pleno.",
  },
  { nombre: "Otro país (extrazona)", preferencia: "extrazona" },
];

export type Categoria = {
  id: string;
  label: string;
  /** Derecho de importación extrazona representativo (%). */
  di: number;
  /** IVA aplicable (21 general; 10,5 reducido). */
  iva: number;
  /** Nota de régimen especial, si corresponde. */
  nota?: string;
};

// Las categorías y subcategorías (con su DIE real) viven en
// src/lib/categorias-cotizador.ts, generado desde data/Nomenclatura/ncm.parquet.

/**
 * Grupo Incoterm (regla de la ICC), que define cuánto del recorrido asume el
 * comprador/importador (y, por lo tanto, cuánto seguimiento hacemos nosotros):
 * - "E" (EXW): el vendedor sólo pone la mercadería en fábrica. El importador
 *   asume TODO el origen, incluido el despacho de exportación.
 * - "F" (FCA, FAS, FOB): el vendedor despacha la exportación y entrega al
 *   transportista / a bordo en origen. El importador toma el flete principal.
 * - "C" (CFR, CIF, CPT, CIP): el vendedor contrata y paga el flete principal
 *   (y el seguro en CIF/CIP), pero el riesgo viaja por cuenta del comprador.
 * - "D" (DAP, DPU, DDP): el vendedor lleva la mercadería hasta destino; en DDP
 *   incluso paga la importación.
 */
export type IncotermGrupo = "E" | "F" | "C" | "D";

export type Incoterm = {
  value: string;
  label: string;
  incluyeFlete: boolean;
  incluyeSeguro: boolean;
  grupo: IncotermGrupo;
};

/** Incoterms 2020. Marcamos si el precio ya incluye flete y/o seguro. */
export const INCOTERMS: Incoterm[] = [
  { value: "EXW", label: "EXW — En fábrica", incluyeFlete: false, incluyeSeguro: false, grupo: "E" },
  { value: "FCA", label: "FCA — Franco transportista", incluyeFlete: false, incluyeSeguro: false, grupo: "F" },
  { value: "FAS", label: "FAS — Franco al costado del buque", incluyeFlete: false, incluyeSeguro: false, grupo: "F" },
  { value: "FOB", label: "FOB — Franco a bordo", incluyeFlete: false, incluyeSeguro: false, grupo: "F" },
  { value: "CFR", label: "CFR — Costo y flete", incluyeFlete: true, incluyeSeguro: false, grupo: "C" },
  { value: "CIF", label: "CIF — Costo, seguro y flete", incluyeFlete: true, incluyeSeguro: true, grupo: "C" },
  { value: "CPT", label: "CPT — Transporte pagado hasta", incluyeFlete: true, incluyeSeguro: false, grupo: "C" },
  { value: "CIP", label: "CIP — Transporte y seguro pagados hasta", incluyeFlete: true, incluyeSeguro: true, grupo: "C" },
  { value: "DAP", label: "DAP — Entregado en lugar", incluyeFlete: true, incluyeSeguro: true, grupo: "D" },
  { value: "DPU", label: "DPU — Entregado en lugar descargado", incluyeFlete: true, incluyeSeguro: true, grupo: "D" },
  { value: "DDP", label: "DDP — Entregado con derechos pagados", incluyeFlete: true, incluyeSeguro: true, grupo: "D" },
];

/**
 * Incoterms multimodales (válidos para cualquier transporte, incluida la
 * marítima). Los exclusivamente marítimos (FAS, FOB, CFR, CIF) NO van por aérea
 * ni terrestre.
 */
export const INCOTERMS_MULTIMODALES = new Set([
  "EXW",
  "FCA",
  "CPT",
  "CIP",
  "DAP",
  "DPU",
  "DDP",
]);

/**
 * Incoterms que NO se ofrecen en EXPORTACIÓN desde Argentina:
 * - EXW: el vendedor no realiza el despacho de exportación y el comprador del
 *   exterior no puede oficializar el permiso de embarque en la Aduana argentina.
 *   La regla correcta para "entregar en planta" exportando es FCA (el vendedor
 *   despacha la exportación). Recomendación oficial CCI/ICC Argentina.
 *
 * El resto de las reglas (incluida DDP, que es la de máxima obligación del
 * exportador) sí pueden usarse en exportación.
 */
export const INCOTERMS_EXPO_EXCLUIDOS = new Set(["EXW"]);

/**
 * Incoterms ofrecidos según el tipo de operación y la vía:
 * - Importación: marítima → los 11; aérea/terrestre → sólo multimodales.
 * - Exportación: igual que importación pero SIN EXW (ver arriba).
 */
export function incotermsPermitidos(
  esExport: boolean,
  via?: string | null,
): Incoterm[] {
  const v = (via ?? "").toLowerCase();
  const esMaritima = v === "" || v.startsWith("mar");
  let lista = esMaritima
    ? INCOTERMS
    : INCOTERMS.filter((i) => INCOTERMS_MULTIMODALES.has(i.value));
  if (esExport) {
    lista = lista.filter((i) => !INCOTERMS_EXPO_EXCLUIDOS.has(i.value));
  }
  return lista;
}

/**
 * Responsabilidades operativas que derivan del Incoterm y que cambian el paso a
 * paso del despachante. Son las que determinan cuánto seguimiento hacemos.
 */
export type IncotermMeta = {
  grupo: IncotermGrupo;
  /** El importador coordina el origen (retiro en fábrica, transporte a la terminal de origen). EXW y FCA. */
  seguimientoOrigen: boolean;
  /** El importador/su agente gestiona también el despacho de EXPORTACIÓN en origen. Sólo EXW. */
  despachoExportacionImportador: boolean;
  /** El seguro internacional lo contrata obligatoriamente el vendedor (CIF cobertura mínima ICC-C; CIP ICC-A). */
  seguroObligatorioVendedor: boolean;
  /** El seguro corre por cuenta del importador (recomendado contratarlo). */
  seguroACargoImportador: boolean;
  /** El vendedor entrega en destino (grupo D): nosotros casi sólo hacemos la importación. */
  entregaEnDestino: boolean;
  /** El vendedor paga también los tributos de importación (DDP). */
  importacionVendedor: boolean;
};

export function incotermMeta(inc: Incoterm): IncotermMeta {
  const v = inc.value.toUpperCase();
  const seguroObligatorioVendedor = v === "CIF" || v === "CIP";
  return {
    grupo: inc.grupo,
    seguimientoOrigen: v === "EXW" || v === "FCA",
    despachoExportacionImportador: v === "EXW",
    seguroObligatorioVendedor,
    // Si el incoterm no incluye el seguro y no lo contrata el vendedor, lo asume
    // el importador (EXW, FCA, FAS, FOB, CFR, CPT).
    seguroACargoImportador: !inc.incluyeSeguro && !seguroObligatorioVendedor,
    entregaEnDestino: inc.grupo === "D",
    importacionVendedor: v === "DDP",
  };
}

/* ───────────────────────── Forma / medio de pago ─────────────────────────
 * El medio de pago (que surge del pedido de compra) define CUÁNDO y CÓMO el
 * importador consigue el documento de transporte (BL/AWB), lo que cambia el
 * paso a paso:
 * - Pago anticipado / cuenta abierta: el vendedor libera el transporte al
 *   embarcar (telex release / sea waybill). No hay original a canjear → BL
 *   temprano.
 * - Cobranza documentaria (D/P contra pago, D/A contra aceptación): el banco
 *   retiene el BL ORIGINAL y lo entrega cuando el importador paga (D/P) o
 *   acepta el giro (D/A).
 * - Carta de crédito (crédito documentario / L/C): el BL ORIGINAL viaja por los
 *   bancos; el importador lo recibe del banco emisor tras la presentación
 *   conforme de documentos y el pago/compromiso.
 */
export type FormaPagoCategoria =
  | "anticipado"
  | "cuenta_abierta"
  | "cobranza"
  | "carta_credito"
  | "consignacion"
  | "cod"
  | "desconocido";

/** Subtipo de cobranza documentaria (URC 522). */
export type CobranzaSubtipo = "dp" | "da" | "simple";

export type FormaPagoMeta = {
  categoria: FormaPagoCategoria;
  label: string;
  /** Variante D/P, D/A o cobranza simple (sólo giro). */
  cobranzaSubtipo: CobranzaSubtipo | null;
  /** El BL marítimo viaja como ORIGINAL (a canjear / por banco), no telex/waybill. */
  blOriginal: boolean;
  /** Intervención bancaria para liberar documentos o la carga (cobranza / L/C). */
  liberaBanco: boolean;
  /** Cuándo el importador puede retirar la mercadería (texto según vía). */
  momentoBl: string;
  /** Aviso para el operador. */
  nota: string;
};

export type ViaCanon = "maritima" | "aerea" | "terrestre";

/** Opciones que el cliente elige al abrir la operación (paso 1). */
export const FORMAS_PAGO_OPCIONES: {
  value: string;
  label: string;
  grupo: "directo" | "bancario" | "especial";
  desc: string;
  /** Vías donde la opción aplica. Si se omite, vale para todas. */
  vias?: ViaCanon[];
}[] = [
  {
    value: "Pago anticipado (transferencia / T/T)",
    label: "Pago anticipado",
    grupo: "directo",
    desc: "Transferencia antes del embarque. El transporte se libera rápido (telex/waybill en marítimo).",
  },
  {
    value: "Pago a la vista (CAD / contra documentos)",
    label: "Pago a la vista",
    grupo: "directo",
    desc: "Pagás al recibir los documentos comerciales (sin banco o CAD directo).",
  },
  {
    value: "Pago diferido / cuenta abierta",
    label: "Cuenta abierta / plazo",
    grupo: "directo",
    desc: "Confianza comercial: plazo (30/60/90 días). El transporte suele liberarse al embarcar.",
  },
  {
    value: "Cobranza documentaria D/P (contra pago)",
    label: "Cobranza D/P",
    grupo: "bancario",
    desc: "El banco entrega documentos contra PAGO (Documents against Payment). URC 522.",
  },
  {
    value: "Cobranza documentaria D/A (contra aceptación)",
    label: "Cobranza D/A",
    grupo: "bancario",
    desc: "El banco entrega documentos contra ACEPTACIÓN del giro (Documents against Acceptance). URC 522.",
  },
  {
    value: "Cobranza simple (sólo giro)",
    label: "Cobranza simple",
    grupo: "bancario",
    desc: "El banco cobra el giro sin retener documentos de transporte (clean collection).",
  },
  {
    value: "Carta de crédito (crédito documentario / L/C)",
    label: "Carta de crédito",
    grupo: "bancario",
    desc: "Crédito documentario (UCP 600). El banco paga al cumplir los requisitos del crédito.",
  },
  {
    value: "Consignación",
    label: "Consignación",
    grupo: "especial",
    desc: "Mercadería enviada; el pago ocurre al venderse. Riesgo del exportador.",
  },
  {
    // El contra reembolso prácticamente no existe en marítimo (se usa cobranza
    // D/P vía banco): sólo lo ofrecemos en aéreo y terrestre.
    value: "Contra reembolso (COD)",
    label: "Contra reembolso",
    grupo: "especial",
    desc: "El transportista cobra al entregar. Habitual en terrestre; comisión extra del carrier.",
    vias: ["aerea", "terrestre"],
  },
  {
    value: "Otra",
    label: "Otra",
    grupo: "especial",
    desc: "Detallala en observaciones o en el pedido de compra.",
  },
];

/** Filtra las formas de pago según la vía elegida (todas si no hay vía). */
export function formasPagoPorVia(via?: string | null) {
  const v = (via ?? "").toLowerCase();
  const canon: ViaCanon | null = v.startsWith("aer")
    ? "aerea"
    : v.startsWith("terr")
      ? "terrestre"
      : v.startsWith("mar")
        ? "maritima"
        : null;
  if (!canon) return FORMAS_PAGO_OPCIONES;
  return FORMAS_PAGO_OPCIONES.filter((o) => !o.vias || o.vias.includes(canon));
}

function docTransporte(via?: string | null): "BL" | "AWB" | "CRT" {
  const v = (via ?? "").toLowerCase();
  if (v.startsWith("aer")) return "AWB";
  if (v.startsWith("terr")) return "CRT";
  return "BL";
}

function esViaMaritima(via?: string | null): boolean {
  const v = (via ?? "").toLowerCase();
  return v === "" || v.startsWith("mar");
}

/** D/P, D/A o cobranza simple según el texto. */
export function clasificarCobranza(texto?: string | null): CobranzaSubtipo {
  const t = (texto ?? "").toLowerCase();
  if (/(contra aceptaci|documents against acceptance|\bd\/?a\b|aceptaci[oó]n del giro)/.test(t)) {
    return "da";
  }
  if (
    /(contra pago|documents against payment|\bd\/?p\b|cad\b|cash against documents|contra documentos|pago a la vista)/.test(
      t,
    )
  ) {
    return "dp";
  }
  return "simple";
}

/** Clasifica un texto libre de forma de pago en una categoría canónica. */
export function clasificarFormaPago(texto?: string | null): FormaPagoCategoria {
  const t = (texto ?? "").toLowerCase();
  if (!t) return "desconocido";
  if (
    /(carta de cr[eé]dito|cr[eé]dito documentario|letter of credit|documentary credit|\bl\/?c\b|\bsblc\b)/.test(
      t,
    )
  ) {
    return "carta_credito";
  }
  if (/(contra reembolso|\bcod\b|cash on delivery|collect on delivery|contra entrega)/.test(t)) {
    return "cod";
  }
  if (/(consignaci[oó]n|consignment sale)/.test(t)) {
    return "consignacion";
  }
  if (
    /(cobranza|collection|contra pago|contra aceptaci|contra documentos|documents against|cash against documents|\bd\/?p\b|\bd\/?a\b|\bcad\b|pago a la vista)/.test(
      t,
    )
  ) {
    return "cobranza";
  }
  if (
    /(anticip|adelant|advance|prepaid|pago previo|pago por adelantado|t\/?t\b.*(anticip|advance)|100\s*%)/.test(
      t,
    )
  ) {
    return "anticipado";
  }
  if (
    /(cuenta (abierta|corriente)|open account|pago diferido|diferid|a \d+\s*d[ií]as|\d+\s*days|plazo|net \d+)/.test(
      t,
    )
  ) {
    return "cuenta_abierta";
  }
  return "desconocido";
}

function momentoDocBancario(
  doc: "BL" | "AWB" | "CRT",
  sub: CobranzaSubtipo,
  esLc: boolean,
): string {
  if (esLc) {
    if (doc === "BL") {
      return "El BL original viaja por los bancos: el importador lo recibe del banco emisor tras la presentación conforme de documentos. Suele llegar cerca o después del arribo.";
    }
    if (doc === "AWB") {
      return "La AWB es NO negociable: la carga debe consignarse al BANCO emisor (no al importador). Tras la presentación conforme, el banco emite carta de liberación / endoso para retirar en el depósito fiscal.";
    }
    return "El CRT es NO negociable y viaja con la carga. Con carta de crédito el banco retiene los documentos comerciales; el importador retira presentando carta del banco + CRT en frontera/destino.";
  }
  if (sub === "da") {
    if (doc === "BL") {
      return "El banco retiene el BL original y lo entrega contra ACEPTACIÓN del giro (D/A): el importador firma la letra de cambio y recibe el BL para pedir la orden de entrega.";
    }
    if (doc === "AWB") {
      return "Cobranza D/A: la carga debe consignarse al banco. Tras aceptar el giro, el banco emite carta de liberación para retirar en el agente de carga (no hay original a canjear).";
    }
    return "Cobranza D/A: el banco retiene documentos comerciales. Tras aceptar el giro, el importador retira con carta del banco + CRT (que acompaña la carga).";
  }
  if (sub === "dp") {
    if (doc === "BL") {
      return "El banco retiene el BL original y lo entrega contra PAGO (D/P): hasta pagar no se puede pedir la orden de entrega al puerto.";
    }
    if (doc === "AWB") {
      return "Cobranza D/P: la carga consignada al banco. Tras pagar, el banco emite carta de liberación para retirar en el depósito fiscal aeroportuario.";
    }
    return "Cobranza D/P: el banco entrega documentos comerciales contra pago. Con el CRT en mano (copia que acompaña la carga) se retira en frontera/destino.";
  }
  // Cobranza simple
  if (doc === "BL") {
    return "Cobranza simple: el banco cobra el giro sin retener el BL; el documento de transporte se gestiona aparte (telex/waybill u original directo del exportador).";
  }
  if (doc === "AWB") {
    return "Cobranza simple: el banco cobra el giro; la AWB sigue al consignatario nombrado (sin retención bancaria del documento de transporte).";
  }
  return "Cobranza simple: el banco cobra el giro; el CRT acompaña la carga al consignatario nombrado.";
}

function notaDocBancario(
  doc: "BL" | "AWB" | "CRT",
  sub: CobranzaSubtipo,
  esLc: boolean,
): string {
  if (esLc) {
    if (doc === "AWB") {
      return "Carta de crédito + AWB: coordiná con el banco la CONSIGNACIÓN al banco emisor antes del embarque. Sin eso, el consignatario retira sin pasar por el banco.";
    }
    if (doc === "CRT") {
      return "Carta de crédito + CRT: el banco retiene factura/packing; verificá que el CRT nombre al consignatario correcto y que el banco emita carta de liberación a tiempo.";
    }
    return "Carta de crédito: BL original por bancos. Coordiná el levantamiento de documentos para no demorar el retiro.";
  }
  const subLabel =
    sub === "da" ? "D/A (contra aceptación)" : sub === "dp" ? "D/P (contra pago)" : "simple";
  if (doc === "AWB") {
    return `Cobranza ${subLabel} + AWB: la carga NO se consigna al importador sino al banco. Pedí carta de liberación al pagar/aceptar.`;
  }
  if (doc === "CRT") {
    return `Cobranza ${subLabel} + CRT: verificá en frontera que el consignatario coincida y que el banco haya liberado los documentos comerciales.`;
  }
  return `Cobranza ${subLabel}: el BL se levanta en el banco. Hasta entonces no se puede pedir la orden de entrega.`;
}

export function formaPagoMeta(
  texto?: string | null,
  via?: string | null,
): FormaPagoMeta {
  const categoria = clasificarFormaPago(texto);
  const doc = docTransporte(via);
  const cobranzaSubtipo =
    categoria === "cobranza" ? clasificarCobranza(texto) : null;

  switch (categoria) {
    case "carta_credito": {
      const blOriginal = esViaMaritima(via);
      return {
        categoria,
        label: "Carta de crédito",
        cobranzaSubtipo: null,
        blOriginal,
        liberaBanco: true,
        momentoBl: momentoDocBancario(doc, "dp", true),
        nota: notaDocBancario(doc, "dp", true),
      };
    }
    case "cobranza": {
      const sub = cobranzaSubtipo ?? "dp";
      const labelCob =
        sub === "da"
          ? "Cobranza D/A"
          : sub === "dp"
            ? "Cobranza D/P"
            : "Cobranza simple";
      const blOriginal = esViaMaritima(via) && sub !== "simple";
      const liberaBanco = sub !== "simple";
      return {
        categoria,
        label: labelCob,
        cobranzaSubtipo: sub,
        blOriginal,
        liberaBanco,
        momentoBl: momentoDocBancario(doc, sub, false),
        nota: notaDocBancario(doc, sub, false),
      };
    }
    case "anticipado":
      return {
        categoria,
        label: "Pago anticipado",
        cobranzaSubtipo: null,
        blOriginal: false,
        liberaBanco: false,
        momentoBl:
          doc === "AWB"
            ? "Pagado de antemano: el exportador consigna la carga al importador; con el aviso de llegada se retira en el depósito fiscal (sin intervención bancaria)."
            : doc === "CRT"
              ? "Pagado de antemano: el CRT nombra al importador; retira en frontera/destino presentando el documento y pagando gastos del transportista."
              : "Como ya está pagado, el vendedor suele liberar telex release / sea waybill al embarcar: BL disponible temprano, sin courier del original.",
        nota:
          doc === "BL"
            ? "Pago anticipado: pedile telex release / sea waybill para agilizar (evita courier del original)."
            : `${doc} no negociable: confirmá que el consignatario sea tu empresa (no el banco).`,
      };
    case "cuenta_abierta":
      return {
        categoria,
        label: "Cuenta abierta / pago diferido",
        cobranzaSubtipo: null,
        blOriginal: false,
        liberaBanco: false,
        momentoBl:
          doc === "AWB"
            ? "Cuenta abierta: la AWB consigna al importador; retira con aviso de llegada (riesgo del exportador)."
            : doc === "CRT"
              ? "Cuenta abierta: el CRT consigna al importador; retira en destino (riesgo del exportador)."
              : "Cuenta abierta: el vendedor libera telex release / sea waybill al embarcar.",
        nota: "Cuenta abierta: riesgo del exportador; para el importador el transporte se libera al embarcar.",
      };
    case "consignacion":
      return {
        categoria,
        label: "Consignación",
        cobranzaSubtipo: null,
        blOriginal: false,
        liberaBanco: false,
        momentoBl:
          doc === "AWB"
            ? "Consignación: la carga puede consignarse al importador o a un depositario; el pago ocurre al venderse."
            : doc === "CRT"
              ? "Consignación: mercadería en depósito del importador; pago al vender (riesgo alto del exportador)."
              : "Consignación: el exportador envía sin cobrar; el BL suele ir telex/waybill.",
        nota: "Consignación: acordá condiciones de devolución de mercadería no vendida y plazos.",
      };
    case "cod":
      return {
        categoria,
        label: "Contra reembolso (COD)",
        cobranzaSubtipo: null,
        blOriginal: false,
        liberaBanco: false,
        momentoBl:
          doc === "CRT"
            ? "Contra reembolso: el transportista cobra el valor de la mercadería al entregar (comisión del carrier). Tener fondos listos en destino."
            : doc === "AWB"
              ? "Contra reembolso aéreo: el agente de carga cobra al retirar (menos frecuente). Verificá montos antes del arribo."
              : "Contra reembolso marítimo: poco habitual; suele usarse cobranza documentaria D/P vía banco.",
        nota:
          doc === "CRT"
            ? "COD terrestre: el transportista retiene la carga hasta cobrar. Sumá comisión de cobranza (~1–2% del monto)."
            : "Contra reembolso: tener el monto exacto disponible antes del retiro.",
      };
    default:
      return {
        categoria,
        label: "A definir",
        cobranzaSubtipo: null,
        blOriginal: false,
        liberaBanco: false,
        momentoBl: `Definí la forma de pago: determina cuándo y cómo se libera el ${doc}.`,
        nota: `Cargá la forma de pago para saber si hay intervención bancaria (${doc} ${doc === "BL" ? "original vs telex" : "consignación al banco vs importador"}).`,
      };
  }
}

export type Via = {
  value: string;
  label: string;
  /** Tarifa orientativa de flete por kg (USD). */
  tarifaKg: number;
  /** Tasa de seguro estimada sobre (valor + flete), según la vía. */
  tasaSeguro: number;
};

// Flete por kg (USD) de respaldo. OJO: el flete es el costo MÁS volátil y
// dependiente de ruta; estos son valores medios 2026 solo para estimar cuando no
// se conoce el real. Si el cliente tiene la cotización del flete, la carga.
// - Marítimo (por kg): ~0,10–0,50/kg. Es un respaldo: el marítimo real se cobra
//   por contenedor (FCL, ver FLETE_CONTENEDOR) o por W/M (LCL).
// - Aéreo: base 3–7/kg; todo incluido (combustible, seguridad, handling) 4–10/kg.
//   China→Ezeiza ~10,5/kg en 2026. Usamos 5,5/kg como medio todo-incluido.
// - Terrestre (camión): ~0,15–0,60/kg (LTL) en la región.
//
// Tasa de seguro: criterio del estudio → 1% FIJO sobre (FOB + flete), igual para
// todas las vías. La excepción es CIF/CIP, donde el valor ya viene con flete y
// seguro discriminados en el documento (no se estima). Con póliza real, se carga
// el valor exacto.
export const VIAS: Via[] = [
  { value: "maritima", label: "Marítima", tarifaKg: 0.45, tasaSeguro: 0.01 },
  { value: "aerea", label: "Aérea", tarifaKg: 5.5, tasaSeguro: 0.01 },
  { value: "terrestre", label: "Terrestre (camión)", tarifaKg: 0.6, tasaSeguro: 0.01 },
];

/**
 * Flete marítimo orientativo por contenedor (USD), valores medios 2026. En FCL el
 * flete se cobra por contenedor (no por kilo): un 20'/40' cuesta casi lo mismo
 * lleno o medio vacío. Es MUY volátil y depende de la ruta: en 2026 China→AR
 * llegó a USD 6.000–7.650 (pico), mientras otras rutas/Drewry global rondan
 * USD 2.300–4.000. Usamos un punto medio; si el cliente tiene el flete real, lo
 * carga (el sistema usa ese override en vez de la estimación).
 */
export const FLETE_CONTENEDOR: Record<
  Exclude<TipoContenedor, "LCL" | "AEREO">,
  number
> = {
  "20STD": 3500,
  "40STD": 4500,
  "40HC": 4700,
  "20RF": 5000,
  "40RF": 6200,
};

/**
 * Flete marítimo LCL (carga suelta / consolidada): se cobra por unidad facturable
 * W/M (weight or measure), la MAYOR entre la tonelada (1.000 kg = 1 t) y el metro
 * cúbico (m³), con un mínimo por envío. Mercado 2026: ~USD 105–200/m³ en rutas
 * largas (China→AR); usamos un medio con mínimo. Varía por ruta.
 */
export const FLETE_LCL_POR_WM = 110; // USD por W/M (m³ o tonelada)
export const FLETE_LCL_MIN = 180; // USD mínimo por envío

/**
 * Tasa de seguro: 1% FIJO sobre (FOB + flete), criterio del estudio. Se aplica
 * igual en todas las vías; solo se usa cuando el seguro no viene discriminado en
 * el documento (CIF/CIP). Con póliza real, se carga el valor exacto.
 */
export const TASA_SEGURO = 0.01; // 1% fijo

/**
 * Percepción de Ingresos Brutos en la importación (régimen SIRPEI, RG CA 3/2013
 * y 6/2020). La cobra la Aduana por cuenta de las jurisdicciones; las 24
 * (23 provincias + CABA) están adheridas. La alícuota general es 2,5% para
 * contribuyentes locales; para Convenio Multilateral se pondera por coeficiente
 * y la alícuota exacta surge del padrón de cada contribuyente.
 *
 * Solo alcanza a contribuyentes de IIBB (quien importa para revender); no a
 * consumidores finales / uso propio. Usamos la alícuota general (2,5%).
 */
export const IIBB_PERCEPCION = 2.5;

/**
 * Honorarios del despachante de aduana. El arancel está desregulado (Dto.
 * 2284/91): el mercado se mueve entre ~0,5% y 2% sobre el CIF, casi siempre con
 * un mínimo. Usamos un porcentaje editable con un piso: se cobra el mayor entre
 * (CIF · %) y el mínimo. El IVA (21%) sobre los honorarios es crédito fiscal
 * para Responsable Inscripto.
 */
export const HONORARIOS_PCT_DEFAULT = 2.0;
export const HONORARIOS_MIN_DEFAULT = 350;
export const HONORARIOS_IVA = 21;

/**
 * Perfil fiscal del importador. Define cómo impactan el IVA y las percepciones:
 * - responsable_inscripto: el IVA es crédito fiscal y las percepciones son pago
 *   a cuenta → se recuperan/computan (no son costo, solo desembolso financiero).
 * - monotributo: no liquida IVA/Ganancias por DDJJ → el IVA y las percepciones
 *   que sufre en la importación son costo real (no recuperable).
 * - exento: exento en IVA → el IVA es costo; con constancia de exención puede
 *   evitar las percepciones.
 * - consumidor_final: persona física que importa para uso propio → el IVA es
 *   costo; queda exenta de la percepción de IVA (uso particular).
 */
export type PerfilFiscal =
  | "responsable_inscripto"
  | "monotributo"
  | "exento"
  | "consumidor_final";

/** Destino de la mercadería: define qué percepciones aplican. */
export type Destino = "reventa" | "uso_propio";

export const PERFILES_FISCALES: {
  value: PerfilFiscal;
  label: string;
  desc: string;
}[] = [
  {
    value: "responsable_inscripto",
    label: "Responsable Inscripto",
    desc: "Empresa o persona inscripta en IVA. El IVA y las percepciones son crédito fiscal / pago a cuenta: se recuperan, no son costo.",
  },
  {
    value: "monotributo",
    label: "Monotributista",
    desc: "Pequeño contribuyente. No computa IVA ni Ganancias por DDJJ: el IVA y las percepciones de la importación son costo real.",
  },
  {
    value: "exento",
    label: "Exento en IVA",
    desc: "Sujeto exento de IVA. El IVA es costo; las percepciones se evitan acreditando la exención ante la Aduana.",
  },
  {
    value: "consumidor_final",
    label: "Consumidor final / persona física",
    desc: "Importación para uso personal. El IVA es costo; la percepción de IVA no aplica (uso particular).",
  },
];

export const DESTINOS: { value: Destino; label: string; desc: string }[] = [
  {
    value: "reventa",
    label: "Reventa / comercialización",
    desc: "La mercadería se va a revender. Se suman las percepciones de IVA, Ganancias e IIBB.",
  },
  {
    value: "uso_propio",
    label: "Uso o consumo propio",
    desc: "Bien de uso o consumo del importador (no para reventa). No aplica IIBB; Ganancias se exime para empresas (bien de uso).",
  },
];

/** Mapea la condición de IVA guardada en el alta del cliente a un perfil fiscal. */
export function perfilDesdeCondicionIva(c?: string | null): PerfilFiscal {
  switch ((c ?? "").trim().toLowerCase()) {
    case "responsable inscripto":
      return "responsable_inscripto";
    case "monotributo":
    case "monotributista":
      return "monotributo";
    case "exento":
    case "iva exento":
      return "exento";
    case "no responsable":
    case "consumidor final":
      return "consumidor_final";
    default:
      return "responsable_inscripto";
  }
}

export type RegimenInput = {
  perfil: PerfilFiscal;
  destino: Destino;
  /** IVA del bien (21 general, 10,5 reducido, 0 exento). */
  ivaPct: number;
  /** Certificado MiPyME vigente (RG 5501/5807): exime percepción de IVA y Ganancias. */
  certMipyme?: boolean;
  /** Certificado de exclusión (RG 5655/2025): exime percepción de IVA y Ganancias. */
  certExclusion?: boolean;
};

export type RegimenPercepciones = {
  percIvaPct: number;
  percGanPct: number;
  iibbPct: number;
  // Recuperabilidad por concepto (crédito fiscal / pago a cuenta).
  recIva: boolean;
  recPercIva: boolean;
  recPercGan: boolean;
  recIibb: boolean;
  recHonorariosIva: boolean;
  /** Nota legible del régimen aplicado. */
  eximido: boolean;
};

/**
 * Calcula las alícuotas de percepción y la recuperabilidad de cada concepto a
 * partir del perfil fiscal y el destino, según la normativa vigente (jun-2026):
 * - Percepción IVA — RG 2937: 20% (IVA general) / 10% (IVA reducido). Exenta
 *   para uso o consumo particular de persona física. La eximen el Certificado
 *   MiPyME (RG 5501/5807) y el certificado de exclusión (RG 5655/2025).
 * - Percepción Ganancias — RG 2281: 6% para reventa; 11% para uso o consumo
 *   particular (persona física); los bienes de uso de empresas están exceptuados.
 * - Percepción IIBB (SIRPEI): solo a quien comercializa (reventa); alícuota
 *   general 2,5%.
 * Recuperabilidad: solo el Responsable Inscripto recupera (crédito fiscal / pago
 * a cuenta). Para el resto, IVA y percepciones son costo real.
 */
export function regimenPercepciones(i: RegimenInput): RegimenPercepciones {
  const esPersonaFisica = i.perfil === "consumidor_final";
  const esRI = i.perfil === "responsable_inscripto";
  const eximido = !!i.certMipyme || !!i.certExclusion;

  // Percepción IVA (RG 2937).
  let percIvaPct = 0;
  if (!eximido && i.ivaPct > 0) {
    const usoParticularPF = i.destino === "uso_propio" && esPersonaFisica;
    if (!usoParticularPF) {
      percIvaPct = i.ivaPct >= 21 ? 20 : 10;
    }
  }

  // Percepción Ganancias (RG 2281).
  let percGanPct = 0;
  if (!eximido) {
    if (i.destino === "reventa") {
      percGanPct = 6;
    } else {
      // Uso/consumo propio: 11% si es persona física (uso particular);
      // las empresas importan un bien de uso, exceptuado de la percepción.
      percGanPct = esPersonaFisica ? 11 : 0;
    }
  }

  // Percepción IIBB (SIRPEI): solo reventa.
  const iibbPct = i.destino === "reventa" ? IIBB_PERCEPCION : 0;

  return {
    percIvaPct,
    percGanPct,
    iibbPct,
    recIva: esRI,
    recPercIva: esRI,
    recPercGan: esRI,
    recIibb: esRI,
    recHonorariosIva: esRI,
    eximido,
  };
}

export function preferenciaLabel(p: Preferencia): string {
  return PREF_INFO[p].label;
}

export function preferenciaNota(p: Preferencia): string | undefined {
  return PREF_INFO[p].nota;
}

/** Etiqueta corta del acuerdo: el específico del país o el del régimen. */
export function acuerdoLabel(pais: Pais): string {
  return pais.acuerdo ?? PREF_INFO[pais.preferencia].label;
}

/** Nota a mostrar: la propia del país si tiene, si no la del régimen. */
export function notaPais(pais: Pais): string | undefined {
  return pais.nota ?? PREF_INFO[pais.preferencia].nota;
}

function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Alias frecuentes (inglés / variantes) → nombre del país en PAISES. */
const ALIAS_PAIS: Record<string, string> = {
  brazil: "brasil",
  germany: "alemania",
  deutschland: "alemania",
  spain: "españa",
  italy: "italia",
  france: "francia",
  netherlands: "países bajos",
  holanda: "países bajos",
  belgium: "bélgica",
  poland: "polonia",
  portugal: "portugal",
  "united states": "estados unidos",
  "united states of america": "estados unidos",
  usa: "estados unidos",
  "u.s.a.": "estados unidos",
  us: "estados unidos",
  eeuu: "estados unidos",
  china: "china",
  "p.r. china": "china",
  "united kingdom": "reino unido",
  uk: "reino unido",
  japan: "japón",
  "south korea": "corea del sur",
  korea: "corea del sur",
  taiwan: "taiwán",
  vietnam: "vietnam",
  thailand: "tailandia",
  turkey: "turquía",
  turkiye: "turquía",
  canada: "canadá",
  switzerland: "suiza",
  singapore: "singapur",
  india: "india",
  "south africa": "sudáfrica",
  mexico: "méxico",
  chile: "chile",
  peru: "perú",
  colombia: "colombia",
  uruguay: "uruguay",
  paraguay: "paraguay",
  bolivia: "bolivia",
  ecuador: "ecuador",
};

/**
 * Busca un país de PAISES a partir de texto libre (puede venir en inglés o con
 * variantes). Devuelve null si no lo reconoce. Ignora las entradas "Otro país…".
 */
export function buscarPais(texto: string | null | undefined): Pais | null {
  if (!texto) return null;
  const norm = normalizarTexto(texto);
  if (!norm) return null;
  const objetivo = ALIAS_PAIS[norm] ?? norm;

  let mejor: Pais | null = null;
  for (const p of PAISES) {
    if (p.nombre.toLowerCase().startsWith("otro país")) continue;
    const nombreNorm = normalizarTexto(p.nombre);
    if (nombreNorm === objetivo) return p;
    // Coincidencia parcial (ej. "republica federativa de brasil").
    if (objetivo.includes(nombreNorm) || nombreNorm.includes(objetivo)) {
      mejor = p;
    }
  }
  return mejor;
}

/** Nombre canónico del país (español) si se reconoce; si no, el texto limpio. */
export function nombrePaisCanonico(texto: string | null | undefined): string | null {
  const s = String(texto ?? "").trim();
  if (!s) return null;
  return buscarPais(s)?.nombre ?? s;
}

/**
 * País de producción para preferencia / certificado de origen.
 * Lee `pais_origen` si la documentación lo separó; si falta, usa procedencia
 * como señal de respaldo (sin escribirla en la operación como si fuera origen).
 */
export function paisOrigenEfectivo(op: {
  pais_origen?: string | null;
  pais_procedencia?: string | null;
}): string | null {
  const o = String(op.pais_origen ?? "").trim();
  if (o) return o;
  const p = String(op.pais_procedencia ?? "").trim();
  return p || null;
}

/** ¿Conviene pedir certificado de origen para aprovechar la preferencia? */
export function recomiendaCertificadoOrigen(pais: Pais): boolean {
  return (
    pais.preferencia === "mercosur" ||
    pais.preferencia === "tlc" ||
    pais.preferencia === "parcial" ||
    pais.preferencia === "ue"
  );
}

export type CotizarInput = {
  valor: number; // valor de la mercadería en la condición del incoterm
  peso: number; // kg
  cantidad: number;
  categoria: Categoria;
  pais: Pais;
  incoterm: Incoterm;
  via: Via;
  // Overrides opcionales (modo avanzado)
  diPctOverride?: number | null;
  ivaPctOverride?: number | null;
  percIvaPct: number;
  percGanPct: number;
  iibbPct: number;
  // Recuperabilidad por concepto (según el perfil fiscal del importador).
  recIva: boolean;
  recPercIva: boolean;
  recPercGan: boolean;
  recIibb: boolean;
  recHonorariosIva: boolean;
  fleteOverride?: number | null;
  seguroOverride?: number | null;
  /** Tasa de estadística (% s/CIF). Si viene de VUCE, reemplaza el 3% default. */
  tePctOverride?: number | null;
  /**
   * Estimar el FLETE cuando no viene como override ni incluido en el Incoterm.
   * Default true (cotizador estimativo del cliente). En el Paso 1 / operación se
   * pasa false: el flete debe ser REAL (del forwarder) o queda en 0, nunca se
   * inventa. El seguro 1% es la única estimación que se mantiene siempre.
   */
  estimarFlete?: boolean;
  /**
   * El valor base (`valor`) es FOB y el flete/seguro vienen POR SEPARADO porque la
   * factura abrió el precio en partes (puede pasar en cualquier Incoterm: FOB,
   * CFR, CIF, CPT, CIP…). Cuando es true, el motor NO trata el Incoterm como caja
   * negra: suma el flete y el seguro reales sobre el FOB para armar el CIF, en vez
   * de asumir que ya están dentro del precio. Default false.
   */
  fleteSeparado?: boolean;
  /** Tipo de carga: en marítimo FCL el flete se estima por contenedor. */
  tipoContenedor?: TipoContenedor | null;
  /** Cantidad de contenedores (FCL), para el flete y los gastos por contenedor. */
  cantContenedores?: number | null;
  /** Volumen total en m³ (CBM), para el flete LCL por unidad facturable W/M. */
  cbm?: number | null;
  // Servicios del despacho
  honorariosPct: number;
  honorariosMin: number;
  /** Gastos de terminal/portuarios estimados (a cargo de la terminal/transportista). */
  gastosTerminal: number;
  tipoCambio?: number | null;
  otrosArs: number;
};

export type CotizarResult = {
  flete: number;
  seguro: number;
  cif: number;
  diPct: number;
  di: number;
  tasa: number;
  tasaExenta: boolean;
  baseIva: number;
  iva: number;
  percIva: number;
  percGan: number;
  iibb: number;
  honorarios: number;
  honorariosIva: number;
  gastosTerminal: number;
  /** Suma de conceptos recuperables (crédito fiscal / pago a cuenta). */
  recuperable: number;
  /** Suma de IVA y percepciones que NO se recuperan (son costo real). */
  noRecuperable: number;
  desembolso: number;
  costoReal: number;
  desembolsoArs: number | null;
  costoRealArs: number | null;
  porUnidad: number | null;
};

/** Tope de la tasa de estadística según la base imponible (en USD aprox.). */
function topeTasa(cif: number): number {
  if (cif < 10000) return 180;
  if (cif < 100000) return 3000;
  if (cif < 1000000) return 30000;
  return 150000;
}

export function cotizar(i: CotizarInput): CotizarResult {
  const info = PREF_INFO[i.pais.preferencia];

  // Flete: si el incoterm ya lo incluye, no se suma. En marítimo FCL se estima
  // POR CONTENEDOR (no por kilo); en LCL/aéreo/terrestre, por kilo de respaldo.
  const puedeEstimarAutomatico = i.valor > 0;
  const tcont = i.tipoContenedor;
  const esFcl = tcont != null && tcont !== "LCL" && tcont !== "AEREO";
  const esMaritima = i.via.value === "maritima";
  const esMaritimaFcl = esMaritima && esFcl;
  const esMaritimaLcl = esMaritima && tcont === "LCL";
  // LCL: unidad facturable W/M = la mayor entre tonelada (kg/1000) y m³.
  const wm = Math.max((i.peso ?? 0) / 1000, i.cbm ?? 0);
  const fleteLcl = Math.max(wm * FLETE_LCL_POR_WM, FLETE_LCL_MIN);
  // En modo real (estimarFlete=false) NO se inventa flete: solo el override real
  // del forwarder, o 0. El cotizador del cliente deja estimarFlete por defecto.
  const estimarFlete = i.estimarFlete !== false;
  // Cuando el valor base es FOB y el flete/seguro vienen por separado (la factura
  // abrió el precio en partes, sea cual sea el Incoterm), NO tratamos el Incoterm
  // como caja negra: el flete y el seguro se suman sobre el FOB en vez de asumirse
  // dentro del precio.
  const fleteSeparado = i.fleteSeparado === true;
  const fleteIncluido = i.incoterm.incluyeFlete && !fleteSeparado;
  const seguroIncluido = i.incoterm.incluyeSeguro && !fleteSeparado;
  const flete = fleteIncluido
    ? 0
    : i.fleteOverride != null
      ? i.fleteOverride
      : !puedeEstimarAutomatico || !estimarFlete
        ? 0
        : esMaritimaFcl
          ? (FLETE_CONTENEDOR[
              tcont as Exclude<TipoContenedor, "LCL" | "AEREO">
            ] ?? 0) * Math.max(1, Math.floor(i.cantContenedores ?? 1))
          : esMaritimaLcl
            ? fleteLcl
            : i.peso * i.via.tarifaKg;

  const seguro = seguroIncluido
    ? 0
    : i.seguroOverride != null
      ? i.seguroOverride
      : !puedeEstimarAutomatico
        ? 0
      : (i.valor + flete) * (i.via.tasaSeguro ?? TASA_SEGURO);

  const cif = i.valor + flete + seguro;

  // Derecho de importación: desgravado por acuerdo, o el de la categoría.
  const diBase =
    i.diPctOverride != null ? i.diPctOverride : i.categoria.di;
  const diPct = info.di0 ? 0 : diBase;
  const di = (cif * diPct) / 100;

  // Tasa de estadística: VUCE por NCM, o 3% con tope; exenta según acuerdo/origen.
  const tasaExenta = info.tasaExenta;
  let tasa: number;
  if (tasaExenta) {
    tasa = 0;
  } else if (i.tePctOverride != null) {
    tasa =
      i.tePctOverride === 0
        ? 0
        : Math.min((cif * i.tePctOverride) / 100, topeTasa(cif));
  } else {
    tasa = Math.min(cif * 0.03, topeTasa(cif));
  }

  const baseIva = cif + di + tasa;
  const ivaPct = i.ivaPctOverride != null ? i.ivaPctOverride : i.categoria.iva;
  const iva = (baseIva * ivaPct) / 100;
  const percIva = (baseIva * i.percIvaPct) / 100;
  const percGan = (baseIva * i.percGanPct) / 100;
  const iibb = (baseIva * i.iibbPct) / 100;

  // Honorarios del despachante: el mayor entre (CIF · %) y el mínimo.
  const honorarios = Math.max((cif * i.honorariosPct) / 100, i.honorariosMin);
  // IVA sobre honorarios: crédito fiscal para Responsable Inscripto (recuperable).
  const honorariosIva = (honorarios * HONORARIOS_IVA) / 100;
  // Gastos de terminal/portuarios: costo de terceros (terminal/transportista).
  const gastosTerminal = i.gastosTerminal > 0 ? i.gastosTerminal : 0;

  // Según el perfil fiscal, cada concepto es recuperable (crédito fiscal / pago
  // a cuenta) o costo real. El desembolso incluye todo; el costo real solo lo
  // que no se recupera.
  const recuperable =
    (i.recIva ? iva : 0) +
    (i.recPercIva ? percIva : 0) +
    (i.recPercGan ? percGan : 0) +
    (i.recIibb ? iibb : 0) +
    (i.recHonorariosIva ? honorariosIva : 0);
  const noRecuperable =
    (i.recIva ? 0 : iva) +
    (i.recPercIva ? 0 : percIva) +
    (i.recPercGan ? 0 : percGan) +
    (i.recIibb ? 0 : iibb) +
    (i.recHonorariosIva ? 0 : honorariosIva);

  const baseCostos = cif + di + tasa + honorarios + gastosTerminal;
  const costoReal = baseCostos + noRecuperable;
  const desembolso = baseCostos + iva + percIva + percGan + iibb + honorariosIva;

  const tc = i.tipoCambio ?? 0;
  const desembolsoArs = tc > 0 ? desembolso * tc + i.otrosArs : null;
  const costoRealArs = tc > 0 ? costoReal * tc + i.otrosArs : null;

  const porUnidad =
    i.cantidad > 0
      ? costoRealArs != null
        ? costoRealArs / i.cantidad
        : costoReal / i.cantidad
      : null;

  return {
    flete,
    seguro,
    cif,
    diPct,
    di,
    tasa,
    tasaExenta,
    baseIva,
    iva,
    percIva,
    percGan,
    iibb,
    honorarios,
    honorariosIva,
    gastosTerminal,
    recuperable,
    noRecuperable,
    desembolso,
    costoReal,
    desembolsoArs,
    costoRealArs,
    porUnidad,
  };
}

/* ──────────────────────────── EXPORTACIÓN ────────────────────────────────
 * Cotizador de exportación (Argentina). NUESTRO ALCANCE termina con la mercadería
 * a bordo y el permiso de embarque oficializado/cumplido. Por eso NO cotizamos
 * "cuánto gana" el cliente: cotizamos CUÁNTO LE CUESTA EXPORTAR a través de
 * nuestro servicio (todos son costos). La base imponible es el FOB (valor en
 * Aduana). Sobre el FOB:
 *  - Derecho de Exportación (DE, "retención"): COSTO. % oficial por NCM (ar1).
 *  - Reintegro a la exportación: NO es parte del costo; es un recupero posterior
 *    que el Estado paga tras el cumplido. Se muestra aparte (informativo). % por NCM (ar2).
 * El IVA de las exportaciones tiene tasa 0% y el IVA de los servicios (despachante)
 * es recuperable (recupero de IVA exportador): por eso no es costo. El flete y el
 * seguro internacional (Incoterms C/D) sirven sólo para despejar el FOB; no son
 * parte de nuestro servicio hasta a bordo.
 *
 * Costo de exportar = Derecho de exportación + honorarios del despachante +
 * gastos en origen (terminal/THC, consolidación, certificados, flete interno a
 * puerto/aeropuerto, presentación del permiso de embarque y cumplido).
 */

/** Gastos de exportación en origen estimados (USD), según la modalidad. */
export const GASTOS_EXPORT_FCL = 700; // por contenedor (THC origen, consolidado, handling)
export const GASTOS_EXPORT_LCL = 280; // por envío LCL (consolidación, handling)
export const GASTOS_EXPORT_AEREO = 220; // handling/aforo aéreo en origen

export function gastosExportacionOrigen(
  tipoContenedor: TipoContenedor | null | undefined,
  cantContenedores?: number | null,
): number {
  const t = tipoContenedor;
  if (t === "AEREO") return GASTOS_EXPORT_AEREO;
  if (t === "LCL" || t == null) return GASTOS_EXPORT_LCL;
  // FCL: por contenedor.
  return GASTOS_EXPORT_FCL * Math.max(1, Math.floor(cantContenedores ?? 1));
}

export type ExportarInput = {
  /** Valor de venta en la condición del Incoterm (USD). */
  valor: number;
  pesoKg: number;
  cantidad: number;
  /** Derecho de Exportación (DE) % oficial por NCM (ar1). */
  dePct: number;
  /** Reintegro a la exportación % oficial por NCM (ar2). */
  reintegroPct: number;
  incoterm: Incoterm;
  via: Via;
  /** Flete internacional (solo Incoterms C/D, que lo incluyen). */
  fleteOverride?: number | null;
  /** Seguro internacional (solo CIF/CIP/D). */
  seguroOverride?: number | null;
  honorariosPct: number;
  honorariosMin: number;
  /** Gastos de exportación en origen (estimados o cargados). */
  gastosOrigen: number;
  /** Tipo de carga, para estimar flete y gastos de origen. */
  tipoContenedor?: TipoContenedor | null;
  cantContenedores?: number | null;
  cbm?: number | null;
  tipoCambio?: number | null;
  otrosArs?: number;
};

export type ExportarResult = {
  /** Valor FOB (base imponible) reconstruido desde el Incoterm. */
  fob: number;
  /** Flete internacional incluido en el precio (Incoterms C/D). */
  fleteIntl: number;
  /** Seguro internacional incluido en el precio (CIF/CIP/D). */
  seguroIntl: number;
  dePct: number;
  /** Derecho de exportación (costo). */
  de: number;
  reintegroPct: number;
  /** Reintegro a la exportación (beneficio). */
  reintegro: number;
  honorarios: number;
  /** IVA de honorarios: recuperable (recupero IVA exportador), no es costo. */
  honorariosIva: number;
  gastosOrigen: number;
  /**
   * COSTO de exportar hasta la mercadería a bordo (lo que cotizamos):
   * Derecho de exportación + honorarios + gastos en origen. NO incluye el
   * reintegro (es un recupero posterior).
   */
  costoExportacion: number;
  /** Costo como % del FOB. */
  costoPct: number;
  /** Costo de exportar en pesos (si hay tipo de cambio). */
  costoExportacionArs: number | null;
  /** Costo por unidad. */
  porUnidad: number | null;
};

/**
 * Reconstruye el FOB desde el valor en la condición del Incoterm. Para los
 * grupos C/D el precio incluye flete (y seguro): se restan para llegar al FOB.
 * Para EXW/FCA el valor es algo menor al FOB (faltan gastos de origen); como es
 * una estimación, se toma el valor como FOB aproximado (se avisa en la UI).
 */
export function cotizarExportacion(i: ExportarInput): ExportarResult {
  const puedeEstimar = i.valor > 0;
  const tcont = i.tipoContenedor;
  const esFcl = tcont != null && tcont !== "LCL" && tcont !== "AEREO";
  const esMaritima = i.via.value === "maritima";
  const wm = Math.max((i.pesoKg ?? 0) / 1000, i.cbm ?? 0);
  const fleteLcl = Math.max(wm * FLETE_LCL_POR_WM, FLETE_LCL_MIN);
  const fleteEst = !puedeEstimar
    ? 0
    : esMaritima && esFcl
      ? (FLETE_CONTENEDOR[tcont as Exclude<TipoContenedor, "LCL" | "AEREO">] ??
          0) * Math.max(1, Math.floor(i.cantContenedores ?? 1))
      : esMaritima && tcont === "LCL"
        ? fleteLcl
        : i.pesoKg * i.via.tarifaKg;

  const fleteIntl = i.incoterm.incluyeFlete
    ? i.fleteOverride != null
      ? i.fleteOverride
      : fleteEst
    : 0;
  const seguroIntl = i.incoterm.incluyeSeguro
    ? i.seguroOverride != null
      ? i.seguroOverride
      : i.valor * (i.via.tasaSeguro ?? TASA_SEGURO)
    : 0;

  // FOB = valor de venta − flete − seguro internacional (si el Incoterm los incluye).
  const fob = Math.max(0, i.valor - fleteIntl - seguroIntl);

  const dePct = i.dePct;
  const de = (fob * dePct) / 100;
  const reintegroPct = i.reintegroPct;
  const reintegro = (fob * reintegroPct) / 100;

  const honorarios = Math.max((fob * i.honorariosPct) / 100, i.honorariosMin);
  const honorariosIva = (honorarios * HONORARIOS_IVA) / 100;
  const gastosOrigen = i.gastosOrigen > 0 ? i.gastosOrigen : 0;

  // Costo de exportar hasta la mercadería a bordo (no incluye el reintegro).
  const costoExportacion = de + honorarios + gastosOrigen;
  const costoPct = fob > 0 ? (costoExportacion / fob) * 100 : 0;

  const tc = i.tipoCambio ?? 0;
  const otrosArs = i.otrosArs ?? 0;
  const costoExportacionArs = tc > 0 ? costoExportacion * tc + otrosArs : null;
  const porUnidad =
    i.cantidad > 0
      ? costoExportacionArs != null
        ? costoExportacionArs / i.cantidad
        : costoExportacion / i.cantidad
      : null;

  return {
    fob,
    fleteIntl,
    seguroIntl,
    dePct,
    de,
    reintegroPct,
    reintegro,
    honorarios,
    honorariosIva,
    gastosOrigen,
    costoExportacion,
    costoPct,
    costoExportacionArs,
    porUnidad,
  };
}
