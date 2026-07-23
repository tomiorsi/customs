/**
 * Equivalencias globales entre valores de documentos (peso, montos).
 * Usado en reconciliación y filtro de ruido del cruce IA.
 */

const UNIDAD_TON =
  /\b(mt|mts|m\.?t\.?|tm|tn|to|ton|tons|tonelada|toneladas|metric ton|metric tons)\b/i;

const UNIDAD_MASA =
  /\b(mt|mts|m\.?t\.?|tm|tn|to|ton|tons|tonelada|kg|kilogram|lb|lbs)\b/i;

const RE_KGS_EN_TEXTO = /([\d][\d.,]*)\s*\.?\d*\s*KGS?\b/gi;
const RE_MT_EN_TEXTO = /([\d][\d.,]*)\s*MT\b/gi;

/** Variantes regex de un número para buscarlo anclado en transcripción. */
function variantesNumeroRegex(n: number): string[] {
  const fixed = n.toFixed(3).replace(/\.?0+$/, "");
  const parts = fixed.split(".");
  const intPart = parts[0]!;
  const dec = parts[1];
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "[.,]?");
  const bases = dec
    ? [`${withThousands}[.,]${dec}`, `${intPart}[.,]${dec}`, String(n)]
    : [withThousands, intPart, String(Math.round(n))];
  return [...new Set(bases)];
}

/** ¿El número figura en el texto con la unidad indicada (MT o KGS)? */
export function numeroAncladoConUnidad(
  valor: string,
  unidad: "MT" | "KG",
  texto: string,
): boolean {
  const n = parseMontoDocumento(valor);
  if (n == null) return false;
  const variants = variantesNumeroRegex(n);
  const re =
    unidad === "MT"
      ? new RegExp(`(?:${variants.join("|")})\\s*MT\\b`, "i")
      : new RegExp(`(?:${variants.join("|")})\\s*\\.?\\d*\\s*KGS?\\b`, "i");
  return re.test(texto);
}

/** Cargo transporte: peso × tarifa ≈ monto (columna carrier, no valor comercial). */
export function esCargoTransportePorPesoYTarifa(
  pesoStr: string,
  valorStr: string,
  texto: string,
): boolean {
  const peso = parseMontoDocumento(pesoStr);
  const valor = parseMontoDocumento(valorStr);
  if (peso == null || valor == null || peso <= 0 || valor <= 0) return false;
  for (const m of texto.matchAll(/(\d+(?:[.,]\d{1,4})?)/g)) {
    const rate = parseMontoDocumento(m[1]!);
    if (rate == null || rate <= 0 || rate >= 200) continue;
    if (montosNumericosEquivalentes(peso * rate, valor)) return true;
  }
  return false;
}

/** Referencia a documento de transporte en texto de inconsistencia. */
export const REF_DOC_TRANSPORTE =
  /(?:awb|awl|hawb|gu[ií]a(?:\s+a[eé]rea)?|air\s*waybill|hoja\s+de\s+ruta|bl\b|b\/l|bill\s+of\s+lading|conocimiento|carta\s+de\s+porte|\bcrt\b|\bcmr\b|documento\s+de\s+transporte|transporte)/i;

/**
 * Documento de transporte sin valor comercial propio:
 * NVD/NCV (aéreo IATA), as per invoice (BL/CRT), sin valor aduanero explícito.
 */
export function transporteSinValorComercialDeclarado(texto: string): boolean {
  const t = texto.toUpperCase();
  if (/\bNVD\b/.test(t) && /\bNCV\b/.test(t)) return true;
  if (
    /NO\s+(?:CUSTOMS?\s+)?VALUE|NIL\s+(?:FOR\s+)?(?:CUSTOMS|VALUE)|SIN\s+VALOR(?:\s+ADUANERO)?/.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /(?:VALUE|VALOR)\s+(?:AS\s+)?PER\s+(?:INVOICE|FACTURA)|SEGUN\s+FACTURA|AS\s+PER\s+INVOICE/.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

/** Monto mal leído (16.6732) → valor BR en texto (16.673,20 → 16673.2). */
export function recanonizarMontoDesdeTextoBr(
  valor: string,
  texto: string,
): string | null {
  const nv = parseMontoDocumento(valor);
  if (nv == null) return null;

  for (const m of texto.matchAll(/\d{1,3}(?:\.\d{3})+,\d{2,3}|\d+,\d{2}(?!\d)/g)) {
    const raw = m[0];
    const n = parseMontoDocumento(raw);
    if (n == null) continue;
    if (Math.abs(n - nv) < 0.05) {
      if (n >= 100) return String(n);
      continue;
    }
    if (n >= 100 && nv < n / 50) {
      const vDig = valor.replace(/\D/g, "");
      const rDig = raw.replace(/\D/g, "");
      if (!vDig || !rDig) continue;
      if (rDig.includes(vDig) || vDig.includes(rDig.slice(0, vDig.length))) {
        return String(n);
      }
    }
  }
  return null;
}

/** CRT/CMR casilla de valor de mercaderías declarado en el propio documento. */
export function transporteDeclaraValorMercaderia(texto: string): boolean {
  return /declara(?:c[ií][oó]n|cao)\s+del\s+valor\s+de\s+las\s+mercanc[ií]as|declara(?:c[ií][oó]n|cao)\s+do\s+valor\s+das\s+mercadorias|valor\s+de\s+las\s+mercanc[ií]as/i.test(
    texto,
  );
}

/** Monto en contexto de flete/cargo del transportista (BL, AWB, CRT…). */
export function montoEsCargoFleteEnTransporte(valor: string, texto: string): boolean {
  const n = parseMontoDocumento(valor);
  if (n == null) return false;
  const variants = variantesNumeroRegex(n);
  const numPat = `(?:${variants.join("|")})`;
  const freightCtx =
    "(?:freight|flete|prepaid|prepay|collect|charges?|due\\s+(?:agent|carrier)|carrier|portes|flete\\s+pagado|valor\\s+del\\s+flete|frete|total\\s+del\\s+flete)";
  const re = new RegExp(
    `${freightCtx}[\\s\\S]{0,60}${numPat}|${numPat}[\\s\\S]{0,60}${freightCtx}`,
    "i",
  );
  return re.test(texto);
}

/** Monto que en el texto va seguido de Kg/KGS (columna peso AWB/CRT, no flete). */
export function montoEsPesoEnTextoTransporte(valor: string, texto: string): boolean {
  const n = parseMontoDocumento(valor);
  if (n == null) return false;
  const variants = variantesNumeroRegex(n);
  const re = new RegExp(
    `(?:${variants.join("|")})\\s*\\.?\\d*\\s*(?:Kg|KGS?|kilos?)\\b`,
    "i",
  );
  return re.test(texto);
}

/** Línea tarifa × peso ≈ cargo (columnas AWB IATA; pueden estar en líneas distintas). */
export function inferirCargoFleteDesdeLineaPesoTarifa(texto: string): string | null {
  for (const m of texto.matchAll(
    /(\d+(?:[.,]\d{1,4})?)[\s\n]+(\d+(?:[.,]\d{1,4})?)[\s\n]+(\d+(?:[.,]\d{1,4})?)/g,
  )) {
    const rate = parseMontoDocumento(m[1]!);
    const w = parseMontoDocumento(m[2]!);
    const charge = parseMontoDocumento(m[3]!);
    if (
      rate != null &&
      w != null &&
      charge != null &&
      rate > 0 &&
      rate < 200 &&
      w >= 10 &&
      w <= 100000 &&
      montosNumericosEquivalentes(w * rate, charge)
    ) {
      return String(charge);
    }
  }
  return null;
}

/** Si flete = peso de la columa AWB, reemplazar por el cargo calculado. */
export function corregirFleteColumnaPesoTarifa(
  flete: string,
  texto: string,
): string | null {
  const nf = parseMontoDocumento(flete);
  if (nf == null) return null;
  for (const m of texto.matchAll(
    /(\d+(?:[.,]\d{1,4})?)[\s\n]+(\d+(?:[.,]\d{1,4})?)[\s\n]+(\d+(?:[.,]\d{1,4})?)/g,
  )) {
    const w = parseMontoDocumento(m[2]!);
    const charge = parseMontoDocumento(m[3]!);
    if (w != null && charge != null && Math.abs(nf - w) < 0.05) {
      return String(charge);
    }
  }
  return null;
}

/** Parsea monto con formato BR (16.673,20) o US/AR (16673.2 / 16,673.20). */
export function parseMontoDocumento(v: string): number | null {
  const s = String(v ?? "").trim().replace(/\s/g, "");
  if (!s) return null;
  const br = s.match(/^(\d{1,3}(?:\.\d{3})+),(\d{1,4})$/);
  if (br) {
    const n = parseFloat(`${br[1]!.replace(/\./g, "")}.${br[2]}`);
    return Number.isFinite(n) ? n : null;
  }
  const brSimple = s.match(/^(\d+),(\d{1,4})$/);
  if (brSimple && !s.includes(".")) {
    const n = parseFloat(`${brSimple[1]}.${brSimple[2]}`);
    return Number.isFinite(n) ? n : null;
  }
  const limpio = s.replace(/[^\d.,-]/g, "");
  const us =
    limpio.includes(",") && limpio.includes(".")
      ? limpio.replace(/,/g, "")
      : limpio.replace(/,/g, ".");
  const n = parseFloat(us);
  return Number.isFinite(n) ? n : null;
}

export function normMonto(v: string): string {
  const n = parseMontoDocumento(v);
  if (n != null) return String(n);
  const limpio = String(v ?? "")
    .replace(/[^\d.,-]/g, "")
    .replace(/,/g, ".");
  const fallback = parseFloat(limpio);
  return Number.isFinite(fallback) ? String(fallback) : limpio;
}

/** Canoniza pesos con unidad; toneladas → «N MT». */
export function normPesoDocumento(v: string): string {
  const s = String(v ?? "").trim();
  if (!s) return s;
  const m = s.match(/^([\d.,]+)\s*(.*)$/);
  if (m) {
    const num = normMonto(m[1]!);
    const unit = (m[2] ?? "").trim();
    if (unit && UNIDAD_TON.test(unit)) return `${num} MT`;
    if (unit && /\bkg\b/i.test(unit)) return `${num} kg`;
    if (!unit) return num;
    return `${num} ${unit}`.replace(/\s+/g, " ");
  }
  if (UNIDAD_MASA.test(s)) return s.replace(/\s+/g, " ");
  return normMonto(s);
}

export function montosNumericosEquivalentes(na: number, nb: number): boolean {
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  if (Math.abs(na - nb) < 0.05) return true;
  if (na > 0 && nb > 0) {
    const ratio = na / nb;
    if (Math.abs(ratio - 1000) < 0.01 || Math.abs(ratio - 0.001) < 0.00001) {
      return true;
    }
  }
  return false;
}

export function montosEquivalentes(a: string, b: string): boolean {
  const na = parseMontoDocumento(a) ?? parseFloat(normMonto(a));
  const nb = parseMontoDocumento(b) ?? parseFloat(normMonto(b));
  return montosNumericosEquivalentes(na, nb);
}

/** ¿El valor figura en el texto (formatos BR/US y tolerancia de escala)? */
export function montoAncladoEnTexto(valor: string, texto: string): boolean {
  const v = valor.trim();
  if (!v) return false;
  const nv = parseMontoDocumento(v);
  const dig = v.replace(/\D/g, "");
  if (dig.length >= 2 && texto.replace(/\D/g, "").includes(dig)) return true;

  const candidatos: number[] = [];
  if (nv != null) candidatos.push(nv);

  for (const m of texto.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{1,4}|\d{1,3}(?:,\d{3})*\.\d{1,4}|\d+(?:[.,]\d+)?)/g)) {
    const n = parseMontoDocumento(m[1]!);
    if (n != null) candidatos.push(n);
  }

  if (nv != null) {
    for (const c of candidatos) {
      if (montosNumericosEquivalentes(nv, c)) return true;
    }
  }

  const alt = v.replace(/\./g, ",").replace(/\s/g, "");
  const alt2 = v.replace(/,/g, ".");
  return texto.includes(alt) || texto.includes(alt2) || texto.replace(/\s/g, "").includes(alt);
}

export function pesosEquivalentes(a: string, b: string): boolean {
  if (a === b) return true;
  if (montosEquivalentes(a, b)) return true;
  const na = parseFloat(normMonto(a));
  const nb = parseFloat(normMonto(b));
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  if (Math.abs(na - nb) > 0.02) return false;

  const ua = a.match(UNIDAD_MASA)?.[0]?.toLowerCase();
  const ub = b.match(UNIDAD_MASA)?.[0]?.toLowerCase();
  if (ua && ub) {
    const canon = (u: string) =>
      /^(mt|mts|m\.?t\.?|tm|tn|to|ton|tons?|tonelada)/.test(u) ? "mt" : u;
    return canon(ua) === canon(ub);
  }
  return !UNIDAD_MASA.test(a) && !UNIDAD_MASA.test(b);
}

const RE_PESO_EN_TEXTO =
  /([\d][\d.,]*)\s*(MT|M\.?T\.?|TM|TN|TO|TON|TONS?|KG|KGS?)/gi;

/** Extrae fragmentos «número + unidad de masa» de un texto libre. */
export function extraerFragmentosPeso(texto: string): string[] {
  const out: string[] = [];
  for (const m of texto.matchAll(RE_PESO_EN_TEXTO)) {
    out.push(normPesoDocumento(`${m[1]!} ${m[2]!}`));
  }
  return out;
}

/** ¿El texto describe pesos que en realidad son equivalentes? */
export function textoSoloPesosEquivalentes(texto: string): boolean {
  const pesos = extraerFragmentosPeso(texto);
  if (pesos.length < 2) return false;
  const ref = pesos[0]!;
  return pesos.every((p) => pesosEquivalentes(ref, p));
}

/** Observaciones que la IA etiqueta mal como inconsistencia. */
export function inconsistenciaEsObservacionBlanda(texto: string): boolean {
  const t = texto.toLowerCase();
  return (
    /coincide exactamente|es normal|no (?:es|hay) inconsistencia|v[aá]lido pero|requiere claridad pero|no permite verificar si/.test(
      t,
    ) ||
    /solo para verificar|diferencia m[ií]nima.*redondeo|posible error tipogr|mismo edificio|hub log[ií]stico.*no es destino/i.test(
      t,
    ) ||
    /(c[aá]lculo|verificaci[oó]n|suma).*(correct[oa]|coherente|consistente|verificad[oa])/.test(
      t,
    ) ||
    /✓\s*(correct[oa]|ok)\b/.test(t) ||
    /no hay contradic/i.test(t) ||
    /no es contradicci[oó]n material/i.test(t) ||
    /solo diferencia de formato de presentaci[oó]n/i.test(t) ||
    /insuficientemente espec[ií]fic/i.test(t) ||
    /falta especificidad/i.test(t) ||
    /no permite verificar concordancia/i.test(t)
  );
}

/** Nº de CO, factura, CRT/BL son identificadores distintos — no es contradicción de dato. */
export function inconsistenciaEsRuidoReferencia(texto: string): boolean {
  const t = texto.toLowerCase();
  if (
    /n[uú]mero.*(factura|documento|transporte|certificado|referencia|embarque)/i.test(
      t,
    ) &&
    /(certificado de origen|factura comercial|packing|crt|transporte|co\b)/i.test(t)
  ) {
    return true;
  }
  if (
    /(n[uú]mero|nro|n[º°])/.test(t) &&
    /(factura|invoice)/i.test(t) &&
    /(awb|bl\b|b\/l|crt|documento de transporte)/i.test(t) &&
    /(vs\.?|distint|vinculaci[oó]n)/i.test(t)
  ) {
    return true;
  }
  if (/(doc(?:umento)?\s+transporte\/factura|documento de transporte\/factura)/i.test(t)) {
    return true;
  }
  if (/citan.*distint|tres n[uú]meros|no coinciden.*(referencia|n[uú]mero)/i.test(t)) {
    return true;
  }
  if (
    /n[uº°].*factura/i.test(t) &&
    /vs\.|distint/i.test(t) &&
    /mismo seller|mismo comprador|facturas? comerciales/i.test(t)
  ) {
    return true;
  }
  if (/identificaci[oó]n del productor|direcci[oó]n.*formato|variaciones en formato/i.test(t)) {
    return true;
  }
  return false;
}

/** kg vs piezas vs bultos miden dimensiones distintas del mismo embarque. */
export function inconsistenciaEsUnidadesIncomparables(texto: string): boolean {
  const t = texto.toLowerCase();
  if (/peso neto.*cantidad|cantidad.*peso neto|cantidad\/peso/i.test(t)) {
    return true;
  }
  if (!/(piezas|pç|\bpc\b|bulto|kg|kilogramo|unidades|\bk\b)/i.test(t)) return false;
  return (
    /unidades.*(difer|incompar|distint|no coincid)/i.test(t) ||
    /cantidad.*(factura|certificado|crt|awb|gu[ií]a)/i.test(t) ||
    /(kg|piezas|bulto|\bpc\b|\b\d+\s*k\b).*(certificado|factura|crt|awb|gu[ií]a)/i.test(t) ||
    /peso neto.*cantidad|cantidad.*peso neto/i.test(t)
  );
}

function montosEnTextoInconsistenciaEquivalentes(texto: string): boolean {
  const nums: number[] = [];
  for (const m of texto.matchAll(/(\d{1,3}(?:\.\d{3})*,\d{1,4}|\d{1,3}(?:,\d{3})*\.\d{1,4}|\d+(?:[.,]\d+)?)/g)) {
    const n = parseMontoDocumento(m[1]!);
    if (n != null && n > 0) nums.push(n);
  }
  if (nums.length < 2) return false;
  const ref = nums[0]!;
  return nums.slice(1).some((n) => montosNumericosEquivalentes(ref, n));
}

/** Montos con misma magnitud (escala BR/US o factor 1000 por separador de miles). */
export function inconsistenciaEsEscalaMonetaria(texto: string): boolean {
  const t = texto.toLowerCase();
  if (
    /(escala|factor\s*1000|en miles|separador|formato brasil|notaci[oó]n)/i.test(t) &&
    /(valor|factura|monto|usd)/i.test(t)
  ) {
    return true;
  }
  if (/valor factura|monto.*factura/i.test(t) && montosEnTextoInconsistenciaEquivalentes(texto)) {
    return true;
  }
  return false;
}

/** Valor comercial de factura vs monto en documento de transporte — campos distintos. */
export function inconsistenciaEsValorComercialVsDocumentoTransporte(
  texto: string,
): boolean {
  const t = texto.toLowerCase();
  if (!/valor factura|valores factura/i.test(t)) return false;
  if (!REF_DOC_TRANSPORTE.test(t)) return false;
  return /(factura comercial|commercial invoice|invoice)/i.test(t);
}

/** Peso neto/cantidad vs peso bruto total en documento de transporte (KGS mal leídos como MT, etc.). */
export function inconsistenciaEsPesoNetoVsBrutoTransporte(texto: string): boolean {
  const t = texto.toLowerCase();
  if (!REF_DOC_TRANSPORTE.test(t) && !/factura/i.test(t)) return false;
  if (!/(peso|cantidad|neto|bruto|mt|kg|gross|bruto)/i.test(t)) return false;

  const mts: number[] = [];
  const kgs: number[] = [];
  for (const m of texto.matchAll(RE_MT_EN_TEXTO)) {
    const n = parseMontoDocumento(m[1]!);
    if (n != null && n > 0) mts.push(n);
  }
  for (const m of texto.matchAll(RE_KGS_EN_TEXTO)) {
    const n = parseMontoDocumento(m[1]!);
    if (n != null && n >= 1000) kgs.push(n);
  }

  const netos = mts.filter((n) => n < 500);
  for (const mt of netos) {
    const netKg = mt * 1000;
    for (const kg of kgs) {
      const ratio = kg / netKg;
      if (ratio >= 1 && ratio <= 1.05) return true;
    }
    for (const bigMt of mts.filter((n) => n >= 500)) {
      if (Math.abs(bigMt / 1000 - mt) / mt <= 0.05) return true;
    }
    for (const other of netos) {
      if (other !== mt && other > mt * 0.9 && other < mt * 1.1) return true;
    }
  }
  return false;
}

/** Incoterm comercial (CFR/FOB) vs término operativo del doc. de transporte (CY/CY, franco frontera…). */
export function inconsistenciaEsIncotermTransporteVsComercial(texto: string): boolean {
  const t = texto.toLowerCase();
  if (!/incoterm/i.test(t)) return false;
  if (!REF_DOC_TRANSPORTE.test(t)) return false;
  return /cy\/cy|fio|liner terms|port to port|franco\s+frontera|franco\s+destino|plaza|dep[oó]sito|terminal/i.test(
    t,
  );
}

/** País del shipper en transporte ≠ origen de mercadería en factura (cadena logística). */
export function inconsistenciaEsOrigenShipperVsMercaderia(texto: string): boolean {
  const t = texto.toLowerCase();
  return (
    /origen.*(inconsistent|contradic|conflict|diferent|distint)/i.test(t) &&
    REF_DOC_TRANSPORTE.test(t) &&
    /(factura|invoice|mercader[ií]a|goods?|product)/i.test(t) &&
    /(shipper|remitente|seller|vendedor|exportador)/i.test(t)
  );
}

/** Ship To / hub logístico ≠ domicilio consignatario aduanero en importación. */
export function inconsistenciaEsHubVsConsignatario(texto: string): boolean {
  const t = texto.toLowerCase();
  return (
    /(ship to|forward|c\/o|hub\b).*(consignatario|consignee|diverge|inconsistent)/i.test(
      t,
    ) || /direcci[oó]n.*(consignatario|consignee).*(hub|forward)/i.test(t)
  );
}

/** Vía en factura (provisional) vs documento de transporte definitivo. */
export function inconsistenciaEsViaFacturaVsTransporte(texto: string): boolean {
  const t = texto.toLowerCase();
  return (
    (/v[ií]a.*(inconsistent|contradic)|incoterm vs v[ií]a/i.test(t) &&
      /factura/i.test(t)) ||
    (/fca\b/i.test(t) && /v[ií]a.*terrestre/i.test(t) && /factura/i.test(t))
  );
}

/** No se suman ni comparan totales entre facturas comerciales distintas. */
export function inconsistenciaEsSumaFacturasIndependientes(texto: string): boolean {
  const t = texto.toLowerCase();
  return (
    (/valor total|suma de.*facturas|valores distintos|no es comparable/i.test(t) &&
      /facturas?/i.test(t)) ||
    /\d+\s+facturas.*valores/i.test(t)
  );
}

/** Variación menor en numeración de dirección (suite, oficina) entre documentos. */
export function inconsistenciaEsVariacionDireccion(texto: string): boolean {
  const t = texto.toLowerCase();
  return (
    /(forward|suite|ste\.?|oficina|domicilio)/i.test(t) &&
    /diferen|distint|vs\./i.test(t) &&
    /\d+/.test(t)
  );
}

/** Importación: buyer en Argentina no es origen de la mercadería. */
export function inconsistenciaEsOrigenArgentinaEnImportacion(texto: string): boolean {
  const t = texto.toLowerCase();
  return /origen.*argentina/i.test(t) && /contradic|importaci[oó]n|no es comparable/i.test(t);
}

/** FCA + punto logístico (hub, forward, Miami…): el FCA define punto de entrega, no vía total. */
export function inconsistenciaEsFcaHubVsTransporte(texto: string): boolean {
  const t = texto.toLowerCase();
  // Solo filtrar si hay mención explícita del punto logístico o hub de entrega,
  // no cualquier combinación FCA + transporte (podría ser inconsistencia real de origen).
  return (
    /\bfca\b/i.test(t) &&
    /(hub|punto de entrega|delivery point|forward|miami|doral|entrega en)/i.test(t) &&
    /(awb|transporte|incoterm)/i.test(t) &&
    /inconsistent|contradic/i.test(t)
  );
}

/** Flete de factura comercial vs cargo del transportista: conceptos no homogéneos. */
export function inconsistenciaEsFleteFacturaVsTransporte(texto: string): boolean {
  const t = texto.toLowerCase();
  if (!/(flete|freight|cargo|charges?)/i.test(t)) return false;
  if (!REF_DOC_TRANSPORTE.test(t)) return false;
  if (!/(factura comercial|commercial invoice|invoice|factura)/i.test(t)) return false;
  // Solo filtrar cuando el texto describe claramente un cargo operativo del carrier,
  // no cuando compara magnitudes (flete AWB >> valor factura es una alerta real).
  return /(carrier|transportista|casilla\s*16|valor declarado|declared value|cargo total)/i.test(
    t,
  );
}

/** Shipper/remitente (forwarder, transportista) ≠ seller en factura — cadena logística habitual. */
export function inconsistenciaEsShipperVsVendedor(texto: string): boolean {
  const t = texto.toLowerCase();
  if (!/(shipper|remitente)/i.test(t)) return false;
  if (!/(factura|seller|vendedor|exportador)/i.test(t)) return false;
  return /(on behalf|en nombre de|act[uú]a en nombre|forwarder|agente|carrier|transportista|shipper distinto del seller)/i.test(
    t,
  );
}

/** Procedencia logística del transporte ≠ origen comercial de la mercadería. */
export function inconsistenciaEsProcedenciaTransporteVsOrigenMercaderia(texto: string): boolean {
  const t = texto.toLowerCase();
  if (!/(pa[ií]s de procedencia|procedencia)/i.test(t)) return false;
  if (!REF_DOC_TRANSPORTE.test(t)) return false;
  // El filtro aplica cuando la inconsistencia mezcla procedencia logística (del transporte)
  // con origen comercial (de factura). Requiere mención de factura/invoice junto con origen.
  return /(factura|invoice).*(origen)|(origen).*(factura|invoice)/i.test(t);
}

/**
 * Descripción genérica en transporte (AWB/BL/CRT): baja especificidad pero no contradicción
 * material del tipo de bien. Estas frases no se eliminan sino que se redirigen a ALERTA warn.
 * Exportada para uso en rerouting, no como filtro silencioso.
 */
export function inconsistenciaEsDescripcionGenericaTransporte(texto: string): boolean {
  const t = texto.toLowerCase();
  if (!/descripci[oó]n/i.test(t)) return false;
  if (!REF_DOC_TRANSPORTE.test(t)) return false;
  return /(gen[eé]ric|falta especificidad|no permite verificar concordancia|no hay contradic|compatible con el tipo de bien)/i.test(
    t,
  );
}

function extraerMencionesNcmTexto(texto: string): string[] {
  const out: string[] = [];
  for (const m of texto.matchAll(/\b(?:\d{4}(?:[.\s]?\d{2}){2,4}(?:[.\s]?\d{3})?|\d{8,13})[A-Z]?\b/g)) {
    const dig = m[0]!.replace(/\D/g, "");
    if (dig.length >= 8) out.push(dig);
  }
  return out;
}

function extraerCodigosNcmTexto(texto: string): string[] {
  const out = new Set<string>();
  for (const dig of extraerMencionesNcmTexto(texto)) {
    out.add(dig);
  }
  return [...out];
}

/** NCM de 8 dígitos vs versión expandida SIM del mismo código base. */
export function inconsistenciaEsNcmPrefijoCompatible(texto: string): boolean {
  if (!/\bncm\b/i.test(texto)) return false;
  const menciones = extraerMencionesNcmTexto(texto);
  if (menciones.length < 2) return false;
  const codigos = extraerCodigosNcmTexto(texto);
  return codigos.every((a, i) =>
    codigos.every((b, j) => i === j || a === b || a.startsWith(b) || b.startsWith(a)),
  );
}

/** Ruta declarada con país repetido (A -> A -> destino) no implica contradicción material. */
export function inconsistenciaEsRutaLogisticaConPaisRepetido(texto: string): boolean {
  if (!/(origen|ruta|transbordo|expedici[oó]n)/i.test(texto)) return false;
  if (!/(factura|crt|awb|bl\b|certificado de origen)/i.test(texto)) return false;
  return /\b([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ ]{2,})\s*→\s*\1\s*→/i.test(texto);
}

export function filtrarInconsistenciasRuido(inconsistencias: string[]): string[] {
  return inconsistencias.filter((s) => {
    const t = String(s ?? "").trim();
    if (!t) return false;
    if (inconsistenciaEsObservacionBlanda(t)) return false;
    if (textoSoloPesosEquivalentes(t)) return false;
    if (inconsistenciaEsRuidoReferencia(t)) return false;
    if (inconsistenciaEsUnidadesIncomparables(t)) return false;
    if (inconsistenciaEsEscalaMonetaria(t)) return false;
    if (inconsistenciaEsValorComercialVsDocumentoTransporte(t)) return false;
    if (inconsistenciaEsPesoNetoVsBrutoTransporte(t)) return false;
    if (inconsistenciaEsIncotermTransporteVsComercial(t)) return false;
    if (inconsistenciaEsShipperVsVendedor(t)) return false;
    if (inconsistenciaEsOrigenShipperVsMercaderia(t)) return false;
    if (inconsistenciaEsHubVsConsignatario(t)) return false;
    if (inconsistenciaEsViaFacturaVsTransporte(t)) return false;
    if (inconsistenciaEsSumaFacturasIndependientes(t)) return false;
    if (inconsistenciaEsVariacionDireccion(t)) return false;
    if (inconsistenciaEsOrigenArgentinaEnImportacion(t)) return false;
    if (inconsistenciaEsFcaHubVsTransporte(t)) return false;
    if (inconsistenciaEsFleteFacturaVsTransporte(t)) return false;
    if (inconsistenciaEsProcedenciaTransporteVsOrigenMercaderia(t)) return false;
    // Nota: inconsistenciaEsDescripcionGenericaTransporte NO se filtra aquí.
    // Se redirige a alerta warn en normalizarCruceTexto para que el operador la vea.
    if (inconsistenciaEsNcmPrefijoCompatible(t)) return false;
    if (inconsistenciaEsRutaLogisticaConPaisRepetido(t)) return false;
    return true;
  });
}

/**
 * Separa las inconsistencias que corresponden a descripciones genéricas de transporte
 * (baja especificidad, no contradicción material) para redirigirlas como alertas warn.
 */
export function separarDescripcionesGenericasTransporte(
  inconsistencias: string[],
): { mantener: string[]; redirigir: string[] } {
  const mantener: string[] = [];
  const redirigir: string[] = [];
  for (const s of inconsistencias) {
    if (inconsistenciaEsDescripcionGenericaTransporte(s)) {
      redirigir.push(s);
    } else {
      mantener.push(s);
    }
  }
  return { mantener, redirigir };
}
