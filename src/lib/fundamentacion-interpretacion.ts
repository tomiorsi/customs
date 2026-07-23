import "server-only";

import { buscarPais } from "@/lib/cotizador";
import type { DocType } from "@/lib/docs";
import type { DatosDocumentoOperacion } from "@/lib/ia-documentos";
import type { VacioInterpretacion } from "@/lib/ia-extraccion";
import {
  DESTINO_IMPORTACION,
  documentoLlevaDestinoOperacion,
} from "@/lib/operacion-aduana";
import {
  corregirFleteColumnaPesoTarifa,
  esCargoTransportePorPesoYTarifa,
  inferirCargoFleteDesdeLineaPesoTarifa,
  montoAncladoEnTexto,
  montoEsCargoFleteEnTransporte,
  montoEsPesoEnTextoTransporte,
  numeroAncladoConUnidad,
  parseMontoDocumento,
  recanonizarMontoDesdeTextoBr,
  transporteSinValorComercialDeclarado,
} from "@/lib/equivalencias-campo";

export type OpcionesFundamentacion = {
  esImportacion?: boolean;
};

export type ResultadoFundamentacion = {
  datos: DatosDocumentoOperacion;
  vacios: VacioInterpretacion[];
};

function normDigits(s: string): string {
  return s.replace(/\D/g, "");
}

function normUpper(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase();
}

const MONEDA_TOKENS: Record<string, string[]> = {
  // DOL es el código AFIP/SINTIA para USD en despachos argentinos
  USD: ["USD", "US$", "U$S", "U.S.D", "DOLLAR", "DOL"],
  BRL: ["BRL", "R$", "REAL"],
  EUR: ["EUR", "EURO", "€"],
  CNY: ["CNY", "RMB", "YUAN"],
};

function monedaEnTexto(moneda: string, texto: string): boolean {
  const m = moneda.trim().toUpperCase();
  const t = normUpper(texto);
  if (m.includes("/")) {
    return m.split("/").every((p) => monedaEnTexto(p.trim(), texto));
  }
  if (/NO\s+ESPECIFICADA|N\/A|S\/D/i.test(moneda)) return false;
  const tokens = MONEDA_TOKENS[m] ?? [m];
  if (tokens.some((tok) => t.includes(normUpper(tok)))) return true;
  if (m === "USD") {
    if (/VALUE\s+IN\s+USD|TOTAL\s+USD|AMOUNT\s+(?:IN\s+)?USD|U\.?\s*S\.?\s*DOLLAR/i.test(t)) {
      return true;
    }
    // OCR frecuente en columna «Value in USD»
    if (/VALUE\s+IN\s+USO\b/i.test(t)) return true;
  }
  return false;
}

function ncmEnTexto(ncm: string, texto: string): boolean {
  const n = ncm.trim().toUpperCase();
  const t = normUpper(texto);
  if (n && t.includes(n)) return true;
  const dig = normDigits(n);
  return dig.length >= 8 && normDigits(texto).includes(dig);
}

function montoEnTexto(valor: string, texto: string): boolean {
  return montoAncladoEnTexto(valor, texto);
}

function fragmentoEnTexto(fragmento: string, texto: string, minLen = 4): boolean {
  const f = fragmento.trim();
  if (!f) return false;
  const t = normUpper(texto);
  const fu = normUpper(f);
  if (fu.length >= minLen && t.includes(fu)) return true;
  const dig = normDigits(f);
  if (dig.length >= 6 && normDigits(texto).includes(dig)) return true;
  const tok = fu.replace(/[^A-Z0-9]/g, " ").split(/\s+/).filter((x) => x.length >= 4);
  if (tok.length && t.includes(tok[0]!)) return true;
  return false;
}

const ISO_POR_NOMBRE: Record<string, string> = {
  ARGENTINA: "AR",
  BRASIL: "BR",
  PARAGUAY: "PY",
  URUGUAY: "UY",
  BOLIVIA: "BO",
  CHILE: "CL",
  PERU: "PE",
  COLOMBIA: "CO",
  MEXICO: "MX",
  CHINA: "CN",
  "ESTADOS UNIDOS": "US",
  "REINO UNIDO": "GB",
  ALEMANIA: "DE",
  FRANCIA: "FR",
  ITALIA: "IT",
  ESPANA: "ES",
  INDIA: "IN",
  JAPON: "JP",
  "COREA DEL SUR": "KR",
  SINGAPUR: "SG",
  "HONG KONG": "HK",
};

function escRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Alias corto (ISO, siglas): no puede aparecer dentro de otra palabra (ej. PY en polycarbonate). */
function aliasGeograficoEnTexto(alias: string, texto: string): boolean {
  const a = normUpper(alias).trim();
  if (!a || a.length < 2) return false;
  const t = normUpper(texto);
  const re = new RegExp(`(?:^|[^A-Z0-9])${escRegex(a)}(?:[^A-Z0-9]|$)`);
  return re.test(t);
}

/** País o lista "USA, MX, CN" — cada token debe aparecer en el texto. */
function paisEnTexto(valor: string, texto: string): boolean {
  const partes = valor
    .split(/[,;/→]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!partes.length) return false;
  for (const p of partes) {
    const buscado = buscarPais(p);
    const nombre = buscado?.nombre ?? p;
    const aliases = new Set<string>(
      [p, nombre].map((x) => normUpper(String(x))).filter((x) => x.length >= 2),
    );
    const nombreNorm = normUpper(nombre);
    const iso = ISO_POR_NOMBRE[nombreNorm];
    if (iso) aliases.add(iso);

    if (
      normUpper(nombre).includes("ESTADOS UNIDOS") ||
      normUpper(p).includes("ESTADOS UNIDOS")
    ) {
      aliases.add("USA");
      aliases.add("UNITED STATES");
      aliases.add("U.S.");
      aliases.add("U.S.A");
    }
    if (p.toUpperCase() === "USA" || p.toUpperCase() === "US") {
      aliases.add("UNITED STATES");
      aliases.add("U.S.");
      aliases.add("U.S.A");
      aliases.add("EE.UU");
    }
    if (p.toUpperCase() === "MX" || normUpper(p) === "MEXICO") {
      aliases.add("MEXICO");
    }
    if (p.toUpperCase() === "CN" || normUpper(p).includes("CHINA")) {
      aliases.add("CHINA");
    }
    if (normUpper(nombre).includes("BRASIL") || normUpper(p).includes("BRASIL")) {
      aliases.add("BRAZIL");
      aliases.add("BRASIL");
    }
    if (normUpper(nombre).includes("ARGENTINA") || normUpper(p).includes("ARGENTINA")) {
      aliases.add("ARGENTINA");
    }

    let ok = false;
    const tu = normUpper(texto);
    if (normUpper(nombre).includes("ESTADOS UNIDOS")) {
      if (/\bUSA\b/.test(tu) || /\bU\.S\.A?\.?\b/.test(texto)) ok = true;
      else if (/\b[A-Z]{2}\s*-\s*USA\b/.test(tu)) ok = true;
    }
    if (!ok) {
      for (const a of aliases) {
        if (aliasGeograficoEnTexto(a, texto)) {
          ok = true;
          break;
        }
      }
    }
    if (!ok) return false;
  }
  return true;
}

function incotermEnTexto(inc: string, texto: string): boolean {
  const base = inc.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  if (!base) return false;
  return normUpper(texto).includes(base);
}

function facturaMencionaOrigen(texto: string): boolean {
  return /\b(COUNTRY\s+OF(?:\s+ORIGIN)?|ORIGIN(?:\s+CTRY)?\s*:?|CTRY\b|ORIGEN\b)\b/i.test(
    texto,
  );
}

function paisCanonicoCorto(valor: string): string {
  const buscado = buscarPais(valor);
  return buscado?.nombre ?? valor.trim();
}

function paisesOrigenDesdePartes(partes: DatosDocumentoOperacion["partes"]): Set<string> {
  const out = new Set<string>();
  for (const p of partes ?? []) {
    if (!/\b(SELLER|EXPORTER|PRODUCER|SHIPPER|SOLD FROM|SHIPPED FROM|SHIP FROM|REMITENTE|EXPORTADOR|VENDEDOR)\b/i.test(p.etiqueta)) {
      continue;
    }
    if (!p.pais) continue;
    out.add(normUpper(paisCanonicoCorto(p.pais)));
  }
  return out;
}

function depurarPaisOrigenFactura(
  valor: string,
  partes: DatosDocumentoOperacion["partes"],
): string {
  const paises = valor
    .split(/[,;/]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paises.length <= 1) return valor;
  const sellerPaises = paisesOrigenDesdePartes(partes);
  if (!sellerPaises.size) return valor;
  const filtrados = paises.filter((p) => !sellerPaises.has(normUpper(paisCanonicoCorto(p))));
  return filtrados.length ? filtrados.join(", ") : valor;
}

/** En importación, «Argentina» en bloque comprador/ship-to no es país de origen de la mercadería. */
function origenArgentinaEsDomicilioComprador(texto: string): boolean {
  const tu = normUpper(texto);
  if (!/\bARGENTINA\b/.test(tu)) return false;
  if (/COUNTRY\s+OF\s+ORIGIN[^\n]{0,80}ARGENTINA/.test(tu)) return false;
  if (/ORIGIN\s+(CTRY|COUNTRY)[^\n]{0,40}ARGENTINA/.test(tu)) return false;
  return /BUYER|SHIP\s+TO|CONSIGNEE|IMPORTADOR|BILL\s+TO|SOLD\s+TO|CUIT/.test(tu);
}

function fechaEnTexto(iso: string, texto: string): boolean {
  const f = iso.trim();
  if (!f) return false;
  if (texto.includes(f)) return true;
  const m = f.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return fragmentoEnTexto(f, texto);
  const [, y, mo, d] = m;
  const patrones = [
    `${d}/${mo}/${y}`,
    `${d}.${mo}.${y}`,
    `${d}/${mo}/${y.slice(2)}`,
    `${d}.${mo}.${y.slice(2)}`,
    `${mo}/${d}/${y.slice(2)}`,
    `${mo}/${d}/${y}`,
    `${Number(d)}/${Number(mo)}/${y}`,
    `${Number(d)}/${Number(mo)}/${y.slice(2)}`,
    `${Number(mo)}/${Number(d)}/${y}`,
    `${Number(mo)}/${Number(d)}/${y.slice(2)}`,
  ];
  if (patrones.some((p) => texto.includes(p))) return true;
  const meses = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const mi = Number(mo) - 1;
  if (mi >= 0 && mi < 12) {
    const mes = meses[mi]!;
    const re = new RegExp(
      `${mes}\\s+${Number(d)}(?:st|nd|rd|th)?,?\\s+${y}`,
      "i",
    );
    if (re.test(texto)) return true;
    const re2 = new RegExp(`${Number(d)}[./]${mes}`, "i");
    if (re2.test(texto)) return true;
  }
  return normDigits(texto).includes(y! + mo! + d!) || normDigits(texto).includes(mo! + d! + y!.slice(2));
}

function emisorUsaFormatoMmDd(out: DatosDocumentoOperacion): boolean {
  const partes = out.partes ?? [];
  for (const p of partes) {
    if (!/\b(SELLER|EXPORTER|SHIPPER|SOLD FROM|BILL FROM)\b/i.test(p.etiqueta)) continue;
    const pais = normUpper(p.pais ?? "");
    if (
      /\b(USA|US|UNITED STATES|ESTADOS UNIDOS|U\.S\.A\.?)\b/i.test(pais)
    ) {
      return true;
    }
  }
  const origen = normUpper(out.origen?.pais_origen ?? "");
  return /\b(USA|US|UNITED STATES|ESTADOS UNIDOS|U\.S\.A\.?)\b/i.test(origen);
}

function expandirAnioDosDigitos(yy: number): number {
  return yy >= 70 ? 1900 + yy : 2000 + yy;
}

function isoDesdePartesFecha(mm: number, dd: number, yyyy: number): string | null {
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/**
 * Recupera el nº de factura de la transcripción cuando la IA no lo devolvió.
 * Busca una etiqueta «Invoice»/«Factura» (NO «Invoice Date») y toma el número
 * que sigue, en la misma línea o en la de abajo. General para cualquier factura.
 */
function extraerNroFacturaDeTexto(texto: string): string | null {
  const m = texto.match(
    /\b(?:invoice|factura)\b(?!\s+(?:date|fecha))\s*(?:n[o°º]?\.?|number|#)?\s*[:#-]?\s*([A-Za-z]?\d[\d\-/]{3,})/i,
  );
  if (!m) return null;
  const cand = m[1]!.trim();
  // No confundir con una fecha (dd/mm/aaaa).
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(cand)) return null;
  return cand;
}

function inferirFechaFacturaDesdeTexto(
  texto: string,
  preferMmDd: boolean,
): string | null {
  const patrones = [
    /(?:INVOICE\s+DATE|DATE)\s*[:\-]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i,
    /(?:INVOICE\s+DATE|DATE)\s*\n\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i,
  ];
  for (const re of patrones) {
    const m = texto.match(re);
    const raw = m?.[1]?.trim();
    if (!raw) continue;
    const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (!dmy) continue;
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const y = dmy[3]!.length === 2 ? expandirAnioDosDigitos(Number(dmy[3])) : Number(dmy[3]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(y)) continue;
    const iso = preferMmDd
      ? isoDesdePartesFecha(a, b, y) ?? isoDesdePartesFecha(b, a, y)
      : isoDesdePartesFecha(b, a, y) ?? isoDesdePartesFecha(a, b, y);
    if (iso) return iso;
  }
  return null;
}

function cantidadBultosEnTexto(valor: string, texto: string): boolean {
  if (fragmentoEnTexto(valor, texto, 3)) return true;
  const m = valor.match(/(\d+)/);
  if (!m) return false;
  const n = m[1]!;
  if (n.length >= 6) return false;
  return new RegExp(`\\b${n}\\b`).test(texto);
}

function descartar(
  vacios: VacioInterpretacion[],
  campo: string,
  motivo: string,
): void {
  vacios.push({ campo, donde: "interpretación", motivo });
}

function limpiarObjeto<T extends Record<string, unknown>>(o: T | null | undefined): T | null {
  if (!o) return null;
  const out = { ...o };
  for (const k of Object.keys(out)) {
    if (out[k] == null || out[k] === "") delete out[k];
  }
  return Object.keys(out).length ? out : null;
}

/** Monto en formato brasileño (16.673,200) — a veces la IA le agrega «kg» por error. */
function esFormatoMonedaBr(valor: string): boolean {
  const v = valor.trim().replace(/\s*kg\s*$/i, "");
  if (/\b(MT|TM|TON|TONELADA|PC|PÇ|UN|UNIDAD|BAG|BULTO)\b/i.test(v)) return false;
  return /^\d{1,3}(?:\.\d{3})+,\d{2,3}$/.test(v);
}

function reasignarPesoMonetarioCo(
  out: DatosDocumentoOperacion,
  merc: NonNullable<DatosDocumentoOperacion["mercaderia"]>,
  vacios: VacioInterpretacion[],
  t: string,
): void {
  const peso = merc.peso_neto;
  if (!peso || !esFormatoMonedaBr(String(peso))) return;
  descartar(vacios, "mercaderia.peso_neto", "formato monetario BR; corresponde a valor, no peso");
  delete merc.peso_neto;
  if (!out.comercial) out.comercial = {};
  const limpio = String(peso).replace(/\s*kg\s*/gi, "").trim();
  if (!out.comercial.valor_factura && montoEnTexto(limpio, t)) {
    out.comercial.valor_factura = limpio;
  }
}

const UNIDAD_TON_TRANSPORTE =
  /\b(mt|mts|m\.?t\.?|tm|tn|to|ton|tons|tonelada|toneladas)\b/i;

/** BL/AWB/CRT/CMR por transcripción aunque el nombre del archivo no diga transporte. */
function esDocumentoTransportePorTexto(t: string, tipo: DocType): boolean {
  if (tipo === "transporte" || tipo === "transporte_borrador") return true;
  const tu = normUpper(t);
  if (
    tipo === "factura_comercial" ||
    tipo === "proforma" ||
    tipo === "packing_list" ||
    tipo === "certificado_origen" ||
    tipo === "factura_gastos" ||
    tipo === "despacho"
  ) {
    if (/\bNVD\b/.test(tu) && /\bNCV\b/.test(tu)) return true;
    return false;
  }
  if (/\bNVD\b/.test(tu) && /\bNCV\b/.test(tu)) return true;
  if (
    /\b(AWB|HAWB|HWAB|AIR\s*WAYBILL|BILL\s+OF\s+LADING|B\/L\b|CONHECIMENTO\s+INTERNACIONAL|CARTA\s+DE\s+PORTE)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\bCMR\b/.test(tu) && /CARTA|TRANSPORTE|PORTES|MERCANC|RODOVI/i.test(tu)) {
    return true;
  }
  if (
    /\bCRT\b/.test(tu) &&
    /CONHECIMENTO|CARTA\s+DE\s+PORTE|DECLARA(?:C[IÍ][OÓ]N)?\s+(?:DEL\s+)?VALOR|PORTES\s+(?:PAGADOS|A\s+PAGAR)|TRANSPORTE\s+RODOVI[AÁ]RIO/i.test(
      tu,
    )
  ) {
    return true;
  }
  return false;
}

/** Doc. de transporte: sin valor comercial declarado, cargo peso×tarifa o flete ≠ valor factura. */
function corregirValorComercialTransporte(
  out: DatosDocumentoOperacion,
  t: string,
  vacios: VacioInterpretacion[],
): void {
  const com = out.comercial;
  if (!com) return;

  const merc = out.mercaderia;
  if (com.flete) {
    const fleteStr = String(com.flete);
    const corregido = corregirFleteColumnaPesoTarifa(fleteStr, t);
    if (corregido) {
      descartar(vacios, "comercial.flete", "columna peso×tarifa AWB; flete es el cargo total");
      com.flete = corregido;
    } else if (montoEsPesoEnTextoTransporte(fleteStr, t)) {
      descartar(vacios, "comercial.flete", "monto con unidad Kg en texto; es peso, no flete");
      delete com.flete;
    } else {
      const nf = parseMontoDocumento(fleteStr);
      const esCargo =
        merc &&
        [merc.peso_neto, merc.peso_bruto, merc.cantidad].some(
          (p) =>
            p &&
            esCargoTransportePorPesoYTarifa(String(p), fleteStr, t),
        );
      if (!esCargo) {
        for (const p of [merc?.peso_neto, merc?.peso_bruto, merc?.cantidad]) {
          if (!p) continue;
          const np = parseMontoDocumento(String(p));
          if (np != null && nf != null && Math.abs(np - nf) < 0.05) {
            descartar(vacios, "comercial.flete", "coincide con peso/cantidad; no es flete");
            delete com.flete;
            break;
          }
        }
      }
    }
  }

  if (!com.flete && transporteSinValorComercialDeclarado(t)) {
    const inferido = inferirCargoFleteDesdeLineaPesoTarifa(t);
    if (inferido) com.flete = inferido;
  }

  if (!com.valor_factura) {
    out.comercial = limpiarObjeto(com);
    return;
  }

  const peso = String(
    out.mercaderia?.peso_neto ?? out.mercaderia?.peso_bruto ?? "",
  );
  const vf = String(com.valor_factura);
  const sinValorDeclarado = transporteSinValorComercialDeclarado(t);
  const esCargoPeso =
    peso && esCargoTransportePorPesoYTarifa(peso, vf, t);
  const esCargoFlete = montoEsCargoFleteEnTransporte(vf, t);

  if (sinValorDeclarado || esCargoPeso || esCargoFlete) {
    const motivo = sinValorDeclarado
      ? "sin valor comercial declarado en documento de transporte"
      : "cargo/flete del transportista; no es valor comercial";
    descartar(vacios, "comercial.valor_factura", motivo);
    delete com.valor_factura;
    if (montoEnTexto(vf, t) && !com.flete) {
      com.flete = vf;
    }
    out.comercial = limpiarObjeto(com);
  }
}

/**
 * Cantidad/peso en doc. de transporte: total KGS ≠ cantidad MT
 * (anclado por unidad en el texto, no por heurística de «MT más chico»).
 */
function corregirCantidadPesoTransporte(
  merc: NonNullable<DatosDocumentoOperacion["mercaderia"]>,
  t: string,
  vacios: VacioInterpretacion[],
): void {
  const cant = merc.cantidad ? String(merc.cantidad) : "";
  if (cant && UNIDAD_TON_TRANSPORTE.test(cant)) {
    const numCant = parseMontoDocumento(cant);
    if (numCant != null) {
      const anclaMt = numeroAncladoConUnidad(cant, "MT", t);
      const anclaKg = numeroAncladoConUnidad(cant, "KG", t);
      if (anclaKg && !anclaMt) {
        descartar(
          vacios,
          "mercaderia.cantidad",
          "peso bruto total en KGS; no es cantidad en MT",
        );
        delete merc.cantidad;
        if (!merc.peso_bruto) {
          const m = t.match(
            new RegExp(
              `(${variantesNumeroTransporte(numCant).join("|")})\\s*\\.?\\d*\\s*KGS?`,
              "i",
            ),
          );
          merc.peso_bruto = m ? `${m[1]} kg` : `${numCant} kg`;
        }
      }
    }
  }
}

function variantesNumeroTransporte(n: number): string[] {
  const intPart = String(Math.round(n));
  const dec = n.toFixed(3).replace(/\.?0+$/, "");
  return [...new Set([dec, intPart, intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".")])];
}

function corregirMontosFormatoBr(
  com: NonNullable<DatosDocumentoOperacion["comercial"]>,
  t: string,
): void {
  for (const k of ["valor_factura", "valor_fob", "valor_cif", "flete", "seguro"] as const) {
    const v = com[k];
    if (!v) continue;
    const mejor = recanonizarMontoDesdeTextoBr(String(v), t);
    if (mejor) com[k] = mejor;
  }
}

const INCOTERM_DESPACHO_RE =
  /^(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)$/i;
const MONEDA_DESPACHO_RE = /^(USD|DOL|US\$|EUR|BRL|REAL|CNY|RMB)$/i;
const UNIDAD_DESPACHO_RE =
  /^(KILOGRAMO|KILOGRAMOS|KG|KGS|UNIDAD|UNIDADES|MT|TONELADA|TONELADAS|METRO|METROS|LITRO|LITROS|PAR|PARES)$/i;
const UNIDAD_PESO_DESPACHO_RE = /^(KILOGRAMO|KILOGRAMOS|KG|KGS|MT|TONELADA|TONELADAS)$/i;
const NCM_DESPACHO_RE = /\b\d{4}\.\d{2}\.\d{2}\.\d{3}[A-Z]?\b/;

type ItemDespachoExtraido = {
  ncm: string;
  descripcion: string;
};

type BloqueDespachoExtraido = {
  multipleNcm: boolean;
  incoterm?: string;
  valorFob?: string;
  flete?: string;
  seguro?: string;
  moneda?: string;
  ncm?: string;
  transporteDocNro?: string;
  paisProcedencia?: string;
  pesoNeto?: string;
  pesoBruto?: string;
  unidad?: string;
  cantidadRaw?: string;
  descripcion?: string;
};

function lineasDocumento(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function extraerNcmDespacho(linea: string): string | null {
  return linea.match(NCM_DESPACHO_RE)?.[0] ?? null;
}

function esSeparadorDespacho(linea: string): boolean {
  return /^[*]+$/.test(linea);
}

function esLineaControlDespacho(linea: string): boolean {
  const u = normUpper(linea);
  return (
    !linea ||
    esSeparadorDespacho(linea) ||
    /^PAGOS:/i.test(linea) ||
    /^COTIZ\s*=/.test(u) ||
    /^PESO\s+GUIA\s*=/.test(u) ||
    /^NROS?\.\s*FACTURAS:/.test(u) ||
    /^[ABC]\)/i.test(linea) ||
    /^AA\(/.test(u) ||
    /^AI\(/.test(u) ||
    /OPCIONES\s+A\s+NIVEL\s+GENERAL/.test(u) ||
    /^DSE\./.test(u) ||
    /^NRO/.test(u) ||
    /^DEC/.test(u) ||
    /^IMPO/.test(u) ||
    /^TRANSF/.test(u) ||
    /^VARIOS/.test(u) ||
    /^ZONAFRANCA/.test(u) ||
    /^BANCOS/.test(u) ||
    /^SENASA/.test(u) ||
    /^ENV-/.test(u) ||
    /^EXPLO/.test(u) ||
    /=/.test(linea)
  );
}

function esLineaDescripcionDespacho(linea: string): boolean {
  const u = normUpper(linea);
  if (
    esLineaControlDespacho(linea) ||
    extraerNcmDespacho(linea) ||
    INCOTERM_DESPACHO_RE.test(u) ||
    MONEDA_DESPACHO_RE.test(u) ||
    UNIDAD_DESPACHO_RE.test(u)
  ) {
    return false;
  }
  if (/^(NUEVO SIN USO IMPORTADO|MERCOSUR|CONTENEDOR|BULTOS|SIN MARCA|S\/M)$/i.test(u)) {
    return false;
  }
  if (/^[0-9.,]+$/.test(linea)) return false;
  if (buscarPais(linea)) return false;
  const soloLetras = linea.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  return soloLetras.length >= 12;
}

function extraerItemsDespacho(texto: string): ItemDespachoExtraido[] {
  const lineas = lineasDocumento(texto);
  const out: ItemDespachoExtraido[] = [];
  const vistos = new Set<string>();
  for (let i = 0; i < lineas.length; i++) {
    const ncm = extraerNcmDespacho(lineas[i]!);
    if (!ncm) continue;
    const desc: string[] = [];
    for (let j = i + 1; j < Math.min(lineas.length, i + 24); j++) {
      const linea = lineas[j]!;
      if (extraerNcmDespacho(linea)) break;
      if (desc.length && esLineaControlDespacho(linea)) break;
      if (esLineaDescripcionDespacho(linea)) {
        desc.push(linea);
        continue;
      }
      if (desc.length) break;
    }
    const descripcion = desc.join(" ").replace(/\s+/g, " ").trim();
    if (!descripcion) continue;
    const clave = `${ncm}::${descripcion}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push({ ncm, descripcion });
  }
  return out;
}

function resumirItemsDespacho(items: ItemDespachoExtraido[]): string | undefined {
  const muestras = items
    .map((item) => item.descripcion)
    .filter(Boolean)
    .slice(0, 3);
  if (!muestras.length) return undefined;
  if (items.length === 1) return muestras[0];
  return muestras.join("; ");
}

function extraerResumenSuperiorDespacho(
  lineas: string[],
): Pick<BloqueDespachoExtraido, "seguro" | "pesoNeto"> {
  const idx = lineas.findIndex((l) => normUpper(l) === "TOTAL KG. NETO");
  if (idx < 0) return {};
  const bloque = lineas.slice(idx, idx + 35);
  const idxMarcas = bloque.findIndex((l) => /^(SIN MARCA|S\/M)$/i.test(l));
  if (idxMarcas < 0) return {};
  const datos = bloque.slice(idxMarcas + 1, idxMarcas + 8);
  const idxEstado = datos.findIndex((l) => /^[A-Z]$/.test(l));
  if (idxEstado <= 0 || idxEstado >= datos.length - 1) return {};
  const seguro = datos[idxEstado - 1] ?? "";
  const pesoNeto = datos[idxEstado + 1] ?? "";
  const out: Pick<BloqueDespachoExtraido, "seguro" | "pesoNeto"> = {};
  if (parseMontoDocumento(seguro) != null) out.seguro = String(parseMontoDocumento(seguro));
  if (parseMontoDocumento(pesoNeto) != null) out.pesoNeto = String(pesoNeto);
  return out;
}

function extraerBloqueDeclaracionDespacho(texto: string): BloqueDespachoExtraido | null {
  const lineas = lineasDocumento(texto);
  const idx = lineas.findIndex((l) => normUpper(l).includes("DECLARACION DE LA MERCADERIA"));
  if (idx < 0) return null;
  const bloque = lineas.slice(idx + 1, idx + 40);
  const items = extraerItemsDespacho(texto);
  const incIdx = bloque.findIndex((l) => INCOTERM_DESPACHO_RE.test(l));
  const out: BloqueDespachoExtraido = {
    multipleNcm: new Set(items.map((item) => item.ncm)).size > 1,
  };
  if (!out.multipleNcm) {
    Object.assign(out, extraerResumenSuperiorDespacho(lineas));
  }

  const idxDocTransporte = lineas.findIndex(
    (l) => normUpper(l) === "DOCUMENTO DE TRANSPORTE",
  );
  if (idxDocTransporte >= 0) {
    for (const linea of lineas.slice(idxDocTransporte + 1, idxDocTransporte + 5)) {
      const token = linea.split(/\s+/).find((t) => /^[A-Z0-9.-]{6,}$/.test(t));
      if (token) {
        out.transporteDocNro = token;
        break;
      }
    }
  }

  if (incIdx > 0) {
    for (const linea of bloque.slice(0, incIdx)) {
      const n = parseMontoDocumento(linea);
      if (n != null) {
        out.pesoBruto = String(linea);
        break;
      }
    }
    out.incoterm = bloque[incIdx]!.toUpperCase();
    for (let i = incIdx + 1; i < bloque.length; i++) {
      const linea = bloque[i]!;
      const moneda = linea.toUpperCase();
      if (!out.valorFob) {
        const n = parseMontoDocumento(linea);
        if (n != null) {
          out.valorFob = String(n);
        }
        continue;
      }
      if (!out.moneda && MONEDA_DESPACHO_RE.test(moneda)) {
        out.moneda = moneda;
        continue;
      }
      if (!out.flete) {
        const n = parseMontoDocumento(linea);
        if (n != null) {
          out.flete = String(n);
          continue;
        }
      }
      if (out.flete && !out.ncm) {
        const ncm = extraerNcmDespacho(linea);
        if (ncm) out.ncm = ncm;
      }
    }
  }

  if (items.length === 1) {
    out.descripcion = items[0]!.descripcion;
    out.ncm = out.ncm ?? items[0]!.ncm;
  } else if (items.length > 1) {
    out.descripcion = resumirItemsDespacho(items);
  }

  const ncmIdx = out.ncm
    ? bloque.findIndex((l) => l.includes(out.ncm!))
    : -1;
  if (ncmIdx >= 0) {
    const unidadIdx = bloque.findIndex(
      (l, i) => i > ncmIdx && UNIDAD_DESPACHO_RE.test(l),
    );
    if (unidadIdx >= 0) {
      for (let i = Math.max(ncmIdx + 1, 0); i < unidadIdx; i++) {
        const pais = buscarPais(bloque[i]!)?.nombre;
        if (pais) {
          out.paisProcedencia = pais;
          break;
        }
      }
      out.unidad = bloque[unidadIdx]!;
      const cantidad = bloque[unidadIdx + 1] ?? "";
      if (parseMontoDocumento(cantidad) != null) {
        out.cantidadRaw = cantidad;
      }
    }
  }
  return out;
}

function despachoMencionaValorFacturaExplicito(texto: string): boolean {
  return /\b(VALOR\s+FACTURA|FACTURA\s+TOTAL|TOTAL\s+FACTURA|TOTAL\s+INVOICE)\b/i.test(
    texto,
  );
}

function corregirTransportistaDespacho(out: DatosDocumentoOperacion): void {
  const ata = out.partes?.find((p) =>
    /\bAGENTE\s+DE\s+TRANSPORTE\s+ADUANERO\b/i.test(p.etiqueta),
  );
  if (!ata?.nombre) return;
  if (!out.transporte) out.transporte = {};
  out.transporte.transportista = ata.nombre;
}

function aplicarReglasDespacho(
  out: DatosDocumentoOperacion,
  texto: string,
  vacios: VacioInterpretacion[],
): void {
  const bloque = extraerBloqueDeclaracionDespacho(texto);
  if (bloque) {
    if (!out.comercial) out.comercial = {};
    if (bloque.incoterm) out.comercial.incoterm = bloque.incoterm;
    if (bloque.valorFob) out.comercial.valor_fob = bloque.valorFob;
    if (bloque.flete) out.comercial.flete = bloque.flete;
    if (bloque.seguro) out.comercial.seguro = bloque.seguro;
    if (bloque.moneda) {
      // DOL es el código AFIP/SINTIA para USD; normalizar al canónico
      out.comercial.moneda = /^DOL$/i.test(bloque.moneda) ? "USD" : bloque.moneda;
    }
    if (
      out.comercial.valor_factura &&
      !despachoMencionaValorFacturaExplicito(texto)
    ) {
      descartar(
        vacios,
        "comercial.valor_factura",
        "en despacho SIM sin etiqueta de factura; conservar FOB/flete oficiales",
      );
      delete out.comercial.valor_factura;
    }

    const merc = out.mercaderia ? { ...out.mercaderia } : {};
    if (bloque.multipleNcm) {
      delete merc.ncm;
      delete merc.cantidad;
      delete merc.unidad;
      delete merc.peso_neto;
    } else {
      if (bloque.ncm) merc.ncm = bloque.ncm;
      if (bloque.unidad && !merc.unidad) merc.unidad = bloque.unidad;
      if (bloque.cantidadRaw && bloque.unidad) {
        if (!merc.cantidad) merc.cantidad = `${bloque.cantidadRaw} ${bloque.unidad}`;
      }
    }
    if (bloque.pesoBruto) {
      merc.peso_bruto = `${bloque.pesoBruto} kg`;
    }
    if (bloque.pesoNeto && !bloque.multipleNcm) {
      merc.peso_neto = bloque.unidad ? `${bloque.pesoNeto} ${bloque.unidad}` : bloque.pesoNeto;
    }
    if (bloque.descripcion && (!merc.mercaderia || merc.mercaderia.length < 24)) {
      merc.mercaderia = bloque.descripcion;
    }
    out.mercaderia = merc;

    if (!out.transporte) out.transporte = {};
    if (bloque.transporteDocNro) {
      out.transporte.transporte_doc_nro = bloque.transporteDocNro;
    }
    if (bloque.paisProcedencia) {
      if (!out.origen) out.origen = {};
      out.origen.pais_procedencia = bloque.paisProcedencia;
      if (!out.origen.pais_origen) {
        out.origen.pais_origen = bloque.paisProcedencia;
      }
    }
  }

  corregirTransportistaDespacho(out);

  // Normalizar moneda DOL → USD aunque provenga del JSON de la IA, no del bloque
  if (out.comercial?.moneda && /^DOL$/i.test(String(out.comercial.moneda))) {
    out.comercial.moneda = "USD";
  }
}

function corregirPesoBrutoTransporte(
  merc: NonNullable<DatosDocumentoOperacion["mercaderia"]>,
  t: string,
  vacios: VacioInterpretacion[],
): void {
  const pb = merc.peso_bruto ? String(merc.peso_bruto) : "";
  if (!pb || !UNIDAD_TON_TRANSPORTE.test(pb)) return;
  const num = parseMontoDocumento(pb);
  if (num == null) return;
  const anclaMt = numeroAncladoConUnidad(pb, "MT", t);
  const anclaKg = numeroAncladoConUnidad(pb, "KG", t);
  if (anclaKg && !anclaMt) {
    descartar(vacios, "mercaderia.peso_bruto", "total bruto en KGS; no es MT");
    const m = t.match(
      new RegExp(
        `(${variantesNumeroTransporte(num).join("|")})\\s*\\.?\\d*\\s*KGS?`,
        "i",
      ),
    );
    merc.peso_bruto = m ? `${m[1]} kg` : `${num} kg`;
  }
}

function corregirCantidadComercialDuplicadaConPeso(
  merc: NonNullable<DatosDocumentoOperacion["mercaderia"]>,
  vacios: VacioInterpretacion[],
): void {
  if (!merc.cantidad || !merc.peso_neto || !merc.bultos) return;
  if (!/\b(KG|KGS|LB|LBS)\b/i.test(merc.cantidad)) return;
  const nc = parseMontoDocumento(String(merc.cantidad));
  const np = parseMontoDocumento(String(merc.peso_neto));
  if (nc == null || np == null || Math.abs(nc - np) >= 0.05) return;
  descartar(
    vacios,
    "mercaderia.cantidad",
    "cantidad duplica peso neto; conservar bultos/unidades y peso",
  );
  delete merc.cantidad;
}

function facturaDeclaraPesoExplicito(texto: string): boolean {
  return /\b(NET\s+WEIGHT|GROSS\s+WEIGHT|TOTAL\s+NET\s+WEIGHT|TOTAL\s+GROSS\s+WEIGHT|PESO\s+NETO|PESO\s+BRUTO|N\.W\.|G\.W\.)\b/i.test(
    texto,
  );
}

function descartarPesoParcialEnFactura(
  merc: NonNullable<DatosDocumentoOperacion["mercaderia"]>,
  texto: string,
  vacios: VacioInterpretacion[],
): void {
  if (!merc.peso_neto || !merc.bultos) return;
  if (facturaDeclaraPesoExplicito(texto)) return;
  if (!/[;,]/.test(merc.mercaderia ?? "")) return;
  if (!/\b(KG|KGS|LB|LBS)\b/i.test(merc.peso_neto)) return;
  descartar(
    vacios,
    "mercaderia.peso_neto",
    "peso sin etiqueta total explícita en factura multiproducto; probable línea parcial",
  );
  delete merc.peso_neto;
}

function esTransporteAereoPorTexto(t: string): boolean {
  return /\b(AWB|HAWB|HWAB|AIR\s*WAYBILL|NVD\b.*\bNCV|A[EÉ]REO|AIRWAY)\b/i.test(t);
}

function corregirPesoBrutoConfundidoConCargo(
  out: DatosDocumentoOperacion,
  t: string,
  vacios: VacioInterpretacion[],
): void {
  const merc = out.mercaderia;
  const com = out.comercial;
  if (!merc?.peso_bruto || !esTransporteAereoPorTexto(t)) return;
  const pb = String(merc.peso_bruto);
  const peso = String(merc.peso_neto ?? merc.cantidad ?? "");
  if (
    peso &&
    esCargoTransportePorPesoYTarifa(peso, pb, t)
  ) {
    descartar(vacios, "mercaderia.peso_bruto", "total cargo AWB; no es peso bruto");
    delete merc.peso_bruto;
    if (com && !com.flete) com.flete = pb.replace(/\s*K(?:G|GS)?\s*$/i, "").trim();
    return;
  }
  const cargo = inferirCargoFleteDesdeLineaPesoTarifa(t);
  const npb = parseMontoDocumento(pb);
  if (cargo != null && npb != null) {
    const nc = parseMontoDocumento(cargo);
    if (nc != null && Math.abs(npb - nc) < 0.05) {
      descartar(vacios, "mercaderia.peso_bruto", "total cargo AWB; no es peso bruto");
      delete merc.peso_bruto;
      if (com && !com.flete) com.flete = cargo;
    }
  }
}

function aplicarReglasTransporte(
  out: DatosDocumentoOperacion,
  tipo: DocType,
  t: string,
  vacios: VacioInterpretacion[],
): void {
  if (!esDocumentoTransportePorTexto(t, tipo)) return;
  corregirPesoBrutoConfundidoConCargo(out, t, vacios);
  corregirValorComercialTransporte(out, t, vacios);
  if (out.mercaderia) {
    corregirCantidadPesoTransporte(out.mercaderia, t, vacios);
    corregirPesoBrutoTransporte(out.mercaderia, t, vacios);
    out.mercaderia = limpiarObjeto(out.mercaderia);
  }
}

/** Si el doc. trae FOB+flete(+seguro) sin total, y la suma figura en el texto → valor_factura. */
function completarValorFacturaDesdeComponentes(
  com: NonNullable<DatosDocumentoOperacion["comercial"]>,
  texto: string,
): void {
  if (com.valor_factura || com.valor_cif) return;
  const fob = parseMontoDocumento(String(com.valor_fob ?? ""));
  if (fob == null) return;
  let total = fob;
  const fl = parseMontoDocumento(String(com.flete ?? ""));
  const se = parseMontoDocumento(String(com.seguro ?? ""));
  if (fl != null) total += fl;
  if (se != null) total += se;
  if (
    montoEnTexto(String(total), texto) ||
    montoEnTexto(total.toFixed(2), texto)
  ) {
    const redondeado = Math.round(total * 100) / 100;
    com.valor_factura = String(redondeado);
  }
}

/** NCM/HS truncado: usar la variante más completa anclada en el texto. */
function expandirNcmDesdeTexto(ncm: string, texto: string): string | null {
  const pref = normDigits(ncm);
  if (pref.length >= 8) return null;
  let mejor: { raw: string; dig: string } | null = null;
  const patrones = [
    /\b(?:NCM|HS(?:\s*CODE)?)\s*:?\s*(\d{4}[.\s]?\d{2}[.\s]?\d{2}(?:[.\s]?\d{2,4})?)/gi,
    /\b(\d{4}(?:[.\s]\d{2}){1,3}(?:[.\s]\d{2,4})?)\b/g,
  ];
  for (const re of patrones) {
    for (const m of texto.matchAll(re)) {
      const raw = m[1]!.replace(/\s+/g, ".");
      const dig = normDigits(raw);
      if (dig.length < 8 || dig.length > 10) continue;
      if (pref && !dig.startsWith(pref) && !pref.startsWith(dig.slice(0, pref.length))) {
        continue;
      }
      if (!mejor || dig.length > mejor.dig.length) mejor = { raw, dig };
    }
  }
  if (!mejor) return null;
  const d = mejor.dig;
  if (d.length === 8) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
  if (d.length === 10) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}.${d.slice(8)}`;
  return mejor.raw;
}

function aplicarDestinoImportacion(
  out: DatosDocumentoOperacion,
  tipo: DocType,
  esImportacion: boolean | undefined,
): void {
  if (!esImportacion || !documentoLlevaDestinoOperacion(tipo)) return;
  if (!out.origen) out.origen = {};
  out.origen.pais_destino = DESTINO_IMPORTACION;
}

/**
 * Quita campos que no están anclados en la transcripción literal.
 * Misma regla para todos los tipos de documento.
 */
export function fundamentarDatosDesdeTranscripcion(
  datos: DatosDocumentoOperacion,
  texto: string,
  tipo: DocType,
  opts?: OpcionesFundamentacion,
): ResultadoFundamentacion {
  const vacios: VacioInterpretacion[] = [];
  const t = texto.trim();
  if (!t) return { datos: { ...datos }, vacios };

  const out: DatosDocumentoOperacion = structuredClone(datos);

  if (tipo === "despacho") {
    aplicarReglasDespacho(out, t, vacios);
  }

  const com = out.comercial ? { ...out.comercial } : undefined;
  if (com) {
    corregirMontosFormatoBr(com, t);
    if (com.moneda && !monedaEnTexto(com.moneda, t)) {
      descartar(vacios, "comercial.moneda", `«${com.moneda}» no figura en el documento`);
      delete com.moneda;
    }
    for (const k of ["valor_factura", "valor_fob", "valor_cif", "flete", "seguro"] as const) {
      const v = com[k];
      if (v && !montoEnTexto(String(v), t)) {
        descartar(vacios, `comercial.${k}`, `monto no hallado en transcripción`);
        delete com[k];
      }
    }
    if (com.incoterm && !incotermEnTexto(com.incoterm, t)) {
      descartar(vacios, "comercial.incoterm", `incoterm no hallado`);
      delete com.incoterm;
    }
    if (
      tipo === "factura_comercial" ||
      tipo === "proforma" ||
      tipo === "certificado_origen"
    ) {
      completarValorFacturaDesdeComponentes(com, t);
    }
    out.comercial = limpiarObjeto(com);
  }

  const merc = out.mercaderia ? { ...out.mercaderia } : undefined;
  if (merc) {
    if (merc.ncm) {
      const exp = expandirNcmDesdeTexto(String(merc.ncm), t);
      if (exp) merc.ncm = exp;
    }
    if (merc.ncm && !ncmEnTexto(merc.ncm, t)) {
      descartar(vacios, "mercaderia.ncm", `NCM/HS no figura en el documento`);
      delete merc.ncm;
    }
    for (const k of ["cantidad", "peso_neto", "peso_bruto"] as const) {
      const v = merc[k];
      if (v && !montoEnTexto(String(v), t) && !fragmentoEnTexto(String(v), t, 3)) {
        descartar(vacios, `mercaderia.${k}`, `no hallado en transcripción`);
        delete merc[k];
      }
    }
    if (merc.bultos && !cantidadBultosEnTexto(String(merc.bultos), t)) {
      descartar(vacios, "mercaderia.bultos", `cantidad de bultos no figura literalmente`);
      delete merc.bultos;
    }
    if (
      merc.mercaderia &&
      !fragmentoEnTexto(merc.mercaderia.slice(0, 24), t, 8)
    ) {
      descartar(vacios, "mercaderia.descripcion", `descripción no anclada`);
      delete merc.mercaderia;
    }
    if (tipo === "certificado_origen") {
      reasignarPesoMonetarioCo(out, merc, vacios, t);
    }
    if (tipo === "factura_comercial" || tipo === "proforma") {
      corregirCantidadComercialDuplicadaConPeso(merc, vacios);
      descartarPesoParcialEnFactura(merc, t, vacios);
    }
    out.mercaderia = limpiarObjeto(merc);
  }

  aplicarReglasTransporte(out, tipo, t, vacios);

  if (out.partes?.length) {
    out.partes = out.partes.filter((p) => {
      const okNombre = p.nombre && fragmentoEnTexto(p.nombre, t, 4);
      if (!okNombre) {
        descartar(vacios, `partes.${p.etiqueta}`, `parte no hallada en transcripción`);
        return false;
      }
      if (p.identificacion && !fragmentoEnTexto(p.identificacion, t, 5)) {
        delete p.identificacion;
      }
      return true;
    });
    if (!out.partes.length) out.partes = null;
  }

  const orig = out.origen ? { ...out.origen } : undefined;
  if (orig) {
    const validarDestino = !(
      opts?.esImportacion && documentoLlevaDestinoOperacion(tipo)
    );
    for (const k of ["pais_origen", "pais_procedencia", "pais_destino"] as const) {
      if (k === "pais_destino" && !validarDestino) continue;
      const v = orig[k];
      if (v && !paisEnTexto(v, t)) {
        descartar(vacios, `origen.${k}`, `«${v}» no figura en el documento`);
        delete orig[k];
        continue;
      }
      if (
        k === "pais_origen" &&
        opts?.esImportacion &&
        tipo === "factura_comercial" &&
        v &&
        normUpper(v).includes("ARGENTINA") &&
        origenArgentinaEsDomicilioComprador(t)
      ) {
        descartar(
          vacios,
          "origen.pais_origen",
          "Argentina es destino/comprador; no Country of Origin en el documento",
        );
        delete orig[k];
        continue;
      }
      if (
        k === "pais_origen" &&
        (tipo === "factura_comercial" || tipo === "proforma") &&
        v &&
        !facturaMencionaOrigen(t)
      ) {
        descartar(
          vacios,
          "origen.pais_origen",
          "factura sin etiqueta explícita de origen; no inferir país desde vendedor/domicilio",
        );
        delete orig[k];
      }
      if (
        k === "pais_origen" &&
        (tipo === "transporte" || tipo === "transporte_borrador") &&
        v &&
        !facturaMencionaOrigen(t)
      ) {
        if (!orig.pais_procedencia) orig.pais_procedencia = v;
        delete orig[k];
      }
    }
    if (
      (tipo === "factura_comercial" || tipo === "proforma") &&
      orig.pais_origen
    ) {
      orig.pais_origen = depurarPaisOrigenFactura(orig.pais_origen, out.partes);
    }
    out.origen = limpiarObjeto(orig);
  }

  aplicarDestinoImportacion(out, tipo, opts?.esImportacion);

  const trans = out.transporte ? { ...out.transporte } : undefined;
  if (trans?.transporte_doc_nro) {
    const n = trans.transporte_doc_nro;
    const dig = normDigits(n);
    const ok =
      fragmentoEnTexto(n, t, 4) ||
      (dig.length >= 6 && normDigits(t).includes(dig.slice(0, Math.min(12, dig.length))));
    if (!ok) {
      descartar(vacios, "transporte.transporte_doc_nro", `referencia no hallada`);
      delete trans.transporte_doc_nro;
    }
    out.transporte = limpiarObjeto(trans);
  }

  let pago = out.pago ? { ...out.pago } : undefined;
  if (pago && (tipo === "factura_comercial" || tipo === "proforma")) {
    const inferida = inferirFechaFacturaDesdeTexto(t, emisorUsaFormatoMmDd(out));
    if (inferida) {
      pago.fecha_factura = inferida;
    }
  }
  // Fallback determinístico: si la IA no capturó el nº de factura, lo recuperamos
  // de la transcripción (etiqueta «Invoice»/«Factura», valor en la misma o en la
  // línea siguiente). Cubre facturas donde el nº queda debajo de la etiqueta.
  if (
    (tipo === "factura_comercial" || tipo === "proforma") &&
    !pago?.nro_factura?.trim()
  ) {
    const nro = extraerNroFacturaDeTexto(t);
    if (nro) {
      pago = pago ?? {};
      pago.nro_factura = nro;
    }
  }
  if (pago?.fecha_factura && !fechaEnTexto(pago.fecha_factura, t)) {
    descartar(vacios, "pago.fecha_factura", `fecha no hallada en transcripción`);
    delete pago.fecha_factura;
  }
  // El nº de factura debe poder citarse en la transcripción (mismo criterio que el
  // doc de transporte): evita inventar o arrastrar un número de otro documento.
  if (pago?.nro_factura) {
    const n = pago.nro_factura;
    const dig = normDigits(n);
    const ok =
      fragmentoEnTexto(n, t, 4) ||
      (dig.length >= 6 && normDigits(t).includes(dig.slice(0, Math.min(12, dig.length))));
    if (!ok) {
      descartar(vacios, "pago.nro_factura", `nº de factura no hallado`);
      delete pago.nro_factura;
    }
  }
  if (pago) out.pago = limpiarObjeto(pago);

  if (out.via) {
    const patrones: Record<string, RegExp> = {
      terrestre: /\bCRT|CARRETERA|TRUCK|ROAD|GROUN[D]?|TERREST|CAMION\b/i,
      maritima: /\bBL\b|B\/L|VESSEL|MARIT|MAERSK|CONTENEDOR|OCEAN\b/i,
      aerea: /\bAWB|AIR\b|AEREO|AÉRE|AIRWAY\b/i,
    };
    const re = patrones[out.via];
    if (re && !re.test(t) && tipo !== "transporte" && tipo !== "despacho") {
      descartar(vacios, "via", `vía «${out.via}» no indicada en el documento`);
      out.via = null;
    }
  }

  if (tipo === "packing_list") {
    if (out.comercial?.moneda) {
      delete out.comercial.moneda;
    }
    if (out.mercaderia?.ncm) {
      delete out.mercaderia.ncm;
    }
  }

  return { datos: out, vacios };
}

export function reglasInterpretacionPorTipo(
  tipo: DocType,
  opts?: Pick<OpcionesFundamentacion, "esImportacion">,
): string {
  const marcoImpo = opts?.esImportacion
    ? "\nIMPORTACIÓN (destino aduanero Argentina): origen.pais_destino = Argentina. " +
      "Direcciones en Miami, «forward to», hub logístico o c/o NO son destino aduanero.\n"
    : "";
  const comunes =
    "\nFUNDAMENTACIÓN: cada valor debe poder citarse en la transcripción. " +
    "Si no está escrito, omití la clave. No completes con conocimiento de dominio.\n" +
    marcoImpo;

  switch (tipo) {
    case "packing_list":
      return (
        comunes +
        "PACKING LIST / certificado de análisis:\n" +
        "- NO incluyas mercaderia.ncm ni comercial.moneda salvo etiqueta NCM/HS/Currency explícita.\n" +
        "- Priorizá pesos, bultos, lingotes/piezas, refs de orden (CUSTOMER ORDER, PE, NF).\n" +
        "- origen.pais_origen solo si el texto nombra el país en domicilio o casilla de origen.\n"
      );
    case "factura_comercial":
    case "proforma":
      return (
        comunes +
        "FACTURA COMERCIAL:\n" +
        "- Extraé todas las partes con etiqueta (Seller, Buyer, Bill To, Ship To, Sold To, " +
        "Shipped From, Forward To, etc.) aunque el documento sea largo o multipágina.\n" +
        "- El VENDEDOR/EXPORTADOR es la parte del lado origen (Seller / Sold From / Shipped From / " +
        "Shipper / Exporter), NUNCA el comprador (Sold To / Bill To / Ship To / Consignee).\n" +
        "- pago.nro_factura: número de factura. Suele estar arriba de todo bajo «Invoice» / " +
        "«Invoice No.» / «Invoice Number» / «Factura N°»; el número puede estar en la línea " +
        "de ABAJO de la etiqueta. NO uses «Invoice Date» (fecha) ni lo pongas como doc de transporte.\n" +
        "- pago.fecha_factura: fecha de emisión (Invoice Date / Date junto al nº), no ship date salvo que sea la única.\n" +
        "- comercial.valor_factura: total explícito del documento. Si solo hay desglose " +
        "(FOB + flete + seguro, o CPT/CFR/CIF con total), completá cada componente y el total.\n" +
        "- mercaderia.mercaderia: descripción principal o resumen literal de las primeras líneas si la tabla es extensa.\n" +
        "- Si hay unidades mezcladas entre líneas (ej. pcs + kg, rolls + lbs), no armes una sola cantidad híbrida: priorizá peso_neto/peso_bruto y bultos.\n" +
        "- origen.pais_destino: en importación = Argentina (destino aduanero). " +
        "Hub logístico o forward to no es destino aduanero.\n" +
        "- origen.pais_origen: Country of Origin por ítem; varios países separados por coma. " +
        "No uses domicilio del comprador en Argentina como origen, ni infieras origen solo por el país del vendedor.\n" +
        "- pago.forma_pago y plazo si figuran (Terms, Net 30, etc.).\n"
      );
    case "certificado_origen":
      return (
        comunes +
        "CERTIFICADO DE ORIGEN:\n" +
        "- NCM puede figurar como código suelto en el formulario (sin etiqueta NCM).\n" +
        "- Casilla «Peso líquido ou quantidade»: cantidad en piezas/kg/ton; casilla valor = comercial.valor_factura.\n" +
        "- Formato monetario BR (16.673,200) sin unidad de masa → valor, NO mercaderia.peso_neto.\n" +
        "- Valor total y cantidad según casillas del certificado.\n"
      );
    case "transporte":
      return (
        comunes +
        "DOCUMENTO DE TRANSPORTE (BL / AWB-HAWB / CRT-CMR / carta de porte):\n" +
        "- comercial.valor_factura: SOLO si el documento declara valor comercial/aduanero propio. " +
        "Válido: casilla 16 CRT/CMR «Declaración del valor de las mercancías», «Declared Value for Customs». " +
        "NO válido: NVD+NCV (aéreo), «as per invoice» / «según factura» sin cifra propia → omití valor_factura.\n" +
        "- Cargos del transportista (peso×tarifa, freight prepaid/collect, due carrier/agent, portes) " +
        "→ comercial.flete, NUNCA valor_factura.\n" +
        "- Cantidad/peso NETO de mercadería: en descripción de carga con su unidad (MT, kg, bultos).\n" +
        "Totales al pie o gross weight en KGS → mercaderia.peso_bruto, no cantidad.\n" +
        "- mercaderia.ncm / HS: copiá el código completo del documento, sin truncar.\n" +
        "- CRT/CMR: peso bruto ≠ peso neto; no confundas portes/flete con valor de factura.\n" +
        "- comercial.moneda solo si figura US$, USD, etc.\n" +
        "- origen.pais_procedencia: país del shipper/remitente o del punto de salida logístico.\n" +
        "- origen.pais_origen SOLO si el documento declara explícitamente Country of Origin / Origin del producto.\n" +
        "- en importación origen.pais_destino = Argentina (consignatario aduanero).\n"
      );
    case "despacho":
      return (
        comunes +
        "DESPACHO / SIM:\n" +
        "- Leé las casillas del SIM como estructura oficial, no como texto libre.\n" +
        "- `Cond. Venta` -> comercial.incoterm.\n" +
        "- `FOB Total` -> comercial.valor_fob.\n" +
        "- `Flete Total` -> comercial.flete.\n" +
        "- `Valor en Aduana ...` -> comercial.valor_cif SOLO si la casilla se distingue de forma literal.\n" +
        "- NO uses comercial.valor_factura salvo que el despacho nombre explícitamente valor/total de factura.\n" +
        "- `Posición SIM / Código AFIP` -> mercaderia.ncm. Si el despacho tiene varias posiciones SIM, resumí la mercadería y omití un NCM único.\n" +
        "- `Peso Guía` / `Peso Bruto` -> mercaderia.peso_bruto.\n" +
        "- `Cantidad Unidades Estadísticas` -> mercaderia.cantidad + unidad. NO la promociones automáticamente a mercaderia.peso_neto.\n" +
        "- `Total Kg. Neto` -> mercaderia.peso_neto SOLO si la cifra queda claramente alineada con esa casilla.\n" +
        "- `Agente de Transporte Aduanero` es el carrier/ATA; no lo reemplaces por nombre de buque, matrícula o patente.\n" +
        "- comercial.moneda solo si figura explícitamente (USD, US$, DOL, moneda).\n"
      );
    case "factura_gastos":
      return (
        comunes +
        "FACTURA DE GASTOS:\n" +
        "- Montos de flete/gastos y referencia BL. Moneda solo si figura.\n"
      );
    default:
      return comunes;
  }
}
