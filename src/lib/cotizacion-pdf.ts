import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { OperationWithClient } from "@/lib/data";
import type { LiquidacionResult } from "@/lib/liquidacion";
import type { Requisito } from "@/lib/requisitos";
import { nombreOperacion } from "@/lib/operacion-display";
import {
  PREFIJO_ARCHIVO_RESUMEN_FONDOS,
  TITULO_RESUMEN_FONDOS,
} from "@/lib/cotizacion-labels";

/**
 * Genera PDF de importación para el cliente:
 * - paso 1: cotización preliminar (mercadería/CIF, tributos, gastos locales);
 * - paso 4: resumen de fondos (VEP + adelanto logístico; CIF solo como base aduanera).
 *
 * Los honorarios no se imprimen con monto (se acuerdan con la dirección).
 * Devuelve los bytes del PDF.
 */

const ESTUDIO = process.env.NEXT_PUBLIC_ESTUDIO_NOMBRE || "J&C Comex";

const ACCENT = rgb(0.976, 0.451, 0.086); // #f97316
const TEXT = rgb(0.07, 0.09, 0.15); // #111827
const MUTED = rgb(0.42, 0.45, 0.5); // #6b7280
const LINE = rgb(0.886, 0.91, 0.941); // #e2e8f0
const BRAND = rgb(0.431, 0.455, 0.502); // #6e7480 (gris del logotipo de la página)
const ACCENT_SOFT = rgb(1, 0.953, 0.906); // #fff3e7 (banda suave naranja)
const ACCENT_DARK = rgb(0.722, 0.275, 0.063); // #b84610 (texto sobre la banda)

/** Logo de la marca, para el encabezado del PDF. */
const LOGO_PATH = path.join(process.cwd(), "public", "jc-logo.png");

/**
 * Embebe el logo en el documento. Si el archivo no está, devolvemos null y el
 * encabezado cae al nombre en texto: un PDF de cotización no puede fallar por
 * una imagen.
 */
async function logoEmbebido(doc: PDFDocument) {
  try {
    return await doc.embedPng(await readFile(LOGO_PATH));
  } catch {
    return null;
  }
}

export function formatUsd(n: number): string {
  const neg = n < 0;
  const s = Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "- " : ""}US$ ${s}`;
}

const money = formatUsd;

export type VistaCotizacionPdf = "cotizacion" | "liquidacion";

export {
  PREFIJO_ARCHIVO_RESUMEN_FONDOS,
  TITULO_RESUMEN_FONDOS,
} from "@/lib/cotizacion-labels";

/** Helvetica (WinAnsi) no admite flechas ni comillas tipográficas Unicode. */
function sanitizePdfText(s: string): string {
  return s
    .replace(/\u2192/g, "->")
    .replace(/\u2190/g, "<-")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, " ");
}

/** Corta un texto en líneas de hasta `max` caracteres, sin partir palabras. */
function wrap(s: string, max: number): string[] {
  const palabras = s.split(/\s+/);
  const lineas: string[] = [];
  let actual = "";
  for (const p of palabras) {
    if (actual && (actual + " " + p).length > max) {
      lineas.push(actual);
      actual = p;
    } else {
      actual = actual ? `${actual} ${p}` : p;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

export async function generarCotizacionPDF(
  op: OperationWithClient,
  liq: LiquidacionResult,
  requisitos: Requisito[] = [],
  opts: { vista?: VistaCotizacionPdf } = {},
): Promise<Uint8Array> {
  const vista = opts.vista === "liquidacion" ? "liquidacion" : "cotizacion";
  const esLiquidacion = vista === "liquidacion";
  const doc = await PDFDocument.create();
  const A4: [number, number] = [595.28, 841.89];
  // `page` es reasignable: si una sección no entra, abrimos una página nueva.
  let page = doc.addPage(A4);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const M = 48; // margen
  const X0 = M;
  const X1 = width - M; // borde derecho del contenido
  let y = height - M;

  const c = liq.cotiz;
  const valorMercaderia = c.cif - c.flete - c.seguro;
  const totalTributos =
    c.di +
    (c.tasaExenta ? 0 : c.tasa) +
    c.iva +
    c.percIva +
    c.percGan +
    c.iibb;
  const gastosLocales = liq.logistica.costoLogistica;
  const fondosOperacion = totalTributos + liq.adelanto;

  /* ── helpers de dibujo ── */
  const text = (
    s: string,
    x: number,
    yy: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const safe = sanitizePdfText(s);
    page.drawText(safe, {
      x,
      y: yy,
      size: opts.size ?? 10,
      font: opts.font ?? font,
      color: opts.color ?? TEXT,
    });
  };
  const right = (
    s: string,
    xRight: number,
    yy: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const safe = sanitizePdfText(s);
    const f = opts.font ?? font;
    const size = opts.size ?? 10;
    const w = f.widthOfTextAtSize(safe, size);
    text(safe, xRight - w, yy, opts);
  };
  const hr = (yy: number, color = LINE) => {
    page.drawLine({
      start: { x: X0, y: yy },
      end: { x: X1, y: yy },
      thickness: 0.75,
      color,
    });
  };
  // Path de rectángulo redondeado con origen arriba-izquierda (coords pdf-lib).
  const roundedRect = (w: number, h: number, rad: number) => {
    const a = Math.min(rad, w / 2, h / 2);
    return (
      `M ${a} 0 L ${w - a} 0 Q ${w} 0 ${w} ${a} L ${w} ${h - a} ` +
      `Q ${w} ${h} ${w - a} ${h} L ${a} ${h} Q 0 ${h} 0 ${h - a} ` +
      `L 0 ${a} Q 0 0 ${a} 0 Z`
    );
  };
  // Texto con espaciado entre letras (para el subtítulo, como el tracking de la web).
  const textTracked = (
    s: string,
    x: number,
    yy: number,
    tracking: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const safe = sanitizePdfText(s);
    const f = opts.font ?? font;
    const size = opts.size ?? 10;
    let cx = x;
    for (const ch of safe) {
      text(ch, cx, yy, opts);
      cx += f.widthOfTextAtSize(ch, size) + tracking;
    }
  };
  // Abre una página nueva (A4) y reinicia el cursor vertical arriba.
  const nuevaPagina = () => {
    page = doc.addPage(A4);
    y = height - M;
  };
  // Garantiza `need` puntos de alto libres antes del margen inferior; si no
  // alcanzan, salta a una página nueva.
  const ensure = (need: number) => {
    if (y - need < M) nuevaPagina();
  };

  /* ── encabezado: título + línea naranja en la misma línea que el estudio + logo ── */
  const S = 40; // lado del cuadro del logo
  const headerTop = y;
  const logoY = headerTop - 22;
  const studioY = logoY - S / 2;
  const titleY = studioY + 2; // misma altura que el nombre del estudio

  // Línea naranja + título a la izquierda
  page.drawSvgPath(roundedRect(3.5, 18, 1.5), {
    x: X0,
    y: titleY + 13,
    color: ACCENT,
  });
  text(esLiquidacion ? TITULO_RESUMEN_FONDOS : "Cotización preliminar de importación", X0 + 12, titleY, {
    size: esLiquidacion ? 12 : 13,
    font: bold,
    color: ACCENT_DARK,
  });

  // Logo a la derecha. Es un wordmark: ya dice el nombre, así que al lado solo
  // va el descriptor del estudio.
  const logoX = X1 - S - 2;
  const logo = await logoEmbebido(doc);
  if (logo) {
    page.drawImage(logo, { x: logoX, y: logoY - S, width: S, height: S });
  } else {
    // Sin archivo de logo el PDF igual sale: cae al nombre en texto.
    text(ESTUDIO, logoX - 10, studioY + 2, { size: 14, font: bold, color: BRAND });
  }

  const studioX = logoX - 95;
  textTracked("ESTUDIO ADUANERO", studioX + 0.5, studioY - 8, 1.3, {
    size: 6,
    font: bold,
    color: BRAND,
  });

  y = logoY - S - 8;

  /* ── datos de la operación ── */
  y -= 4;
  const datos: [string, string][] = [
    ...(op.company_name
      ? [["Cliente", op.company_name] as [string, string]]
      : []),
    ["Mercadería", op.mercaderia || "—"],
    [
      "Origen",
      `${liq.pais}${liq.preferencia ? ` (${liq.preferencia})` : ""}`,
    ],
    ["NCM", liq.ncm || "a confirmar"],
    ["Incoterm", liq.incoterm || "—"],
    [
      "Carga",
      liq.tipoContenedor
        ? `${liq.cantidadContenedores > 1 ? `${liq.cantidadContenedores}× ` : ""}${liq.tipoContenedor}`
        : "a confirmar",
    ],
    ["Valor declarado", `${money(liq.valor)} (${liq.valorFuente})`],
  ];
  for (const [k, v] of datos) {
    text(k, X0, y, { size: 9.5, color: MUTED });
    text(v, X0 + 120, y, { size: 9.5, font: bold });
    y -= 16;
  }
  y -= 22;

  /* ── grupos de costos ── */
  const grupo = (titulo: string, total: string) => {
    text(titulo.toUpperCase(), X0, y, { size: 9, font: bold, color: MUTED });
    right(total, X1, y, { size: 11, font: bold });
    y -= 6;
    hr(y);
    y -= 16;
  };
  const item = (label: string, valor: string, nota?: string) => {
    text(label, X0 + 8, y, { size: 9.5, color: MUTED });
    if (nota) {
      const lw = font.widthOfTextAtSize(label, 9.5);
      text(nota, X0 + 8 + lw + 6, y, { size: 8, color: MUTED });
    }
    right(valor, X1, y, { size: 9.5 });
    y -= 15;
  };

  // 1) Base aduanera / CIF
  grupo(esLiquidacion ? "Base aduanera de referencia (CIF)" : "Mercadería (CIF)", money(c.cif));
  item(
    esLiquidacion ? "Mercadería / valor base" : "Valor de la mercadería",
    money(valorMercaderia),
    liq.fleteFuente === "incluido"
      ? `${liq.valorFuente} · incluye flete`
      : liq.valorFuente,
  );
  if (c.flete > 0) {
    item(
      "Flete",
      money(c.flete),
      liq.fleteFuente === "manual" ? "del forwarder" : "estimado",
    );
  }
  if (c.seguro > 0) item("Seguro", money(c.seguro), "1% s/ merc. + flete");
  if (esLiquidacion) {
    item("Uso del CIF", "base para tributos", "no es cobro del estudio");
  }
  y -= 8;

  // 2) Impuestos y tributos (VEP)
  grupo("Impuestos y tributos (los paga el cliente por VEP)", money(totalTributos));
  item(`Derecho de importación (${c.diPct}%)`, money(c.di));
  item("Tasa de estadística", c.tasaExenta ? "Exenta" : money(c.tasa));
  item(
    `IVA (${liq.ivaPct}%)`,
    money(c.iva),
    liq.perfil === "responsable_inscripto" ? "crédito fiscal" : "costo",
  );
  if (c.percIva > 0)
    item(`Percepción IVA (${liq.regimen.percIvaPct}%)`, money(c.percIva));
  if (c.percGan > 0)
    item(`Percepción Ganancias (${liq.regimen.percGanPct}%)`, money(c.percGan));
  if (c.iibb > 0)
    item(`Percepción IIBB (${liq.regimen.iibbPct}%)`, money(c.iibb));
  y -= 8;

  // 3) Logística y transporte
  grupo(esLiquidacion ? "Adelanto logístico y transporte" : "Logística y transporte", money(gastosLocales));
  item("Honorarios despachante", "A convenir", "se acuerdan aparte");
  item(
    esLiquidacion ? "Adelanto logístico y transporte" : "Transporte y gastos locales (naviera, terminal)",
    money(gastosLocales),
    esLiquidacion ? "adelanto estimado" : undefined,
  );
  y -= 14;

  /* ── totales ── */
  const costoImportacion = liq.costoTotal - valorMercaderia;
  hr(y, ACCENT);
  y -= 22;
  if (esLiquidacion) {
    text("Fondos a prever para la operación", X0, y, { size: 13, font: bold });
    right(money(fondosOperacion), X1, y, {
      size: 16,
      font: bold,
      color: ACCENT,
    });
    y -= 13;
    text(
      "incluye VEP de tributos + adelanto logístico · no incluye mercadería ni pagos al proveedor / forwarder",
      X0,
      y,
      { size: 8, color: MUTED },
    );
    y -= 22;
    item("Tributos por VEP", money(totalTributos), "cliente paga ARCA");
    item("Adelanto logístico", money(liq.adelanto), "cliente paga al estudio");
    item("Mercadería, flete y seguro", "se pagan aparte", "proveedor / forwarder");
    if (c.recuperable > 0) {
      item("Parte recuperable del VEP", money(c.recuperable), "crédito fiscal / pago a cuenta");
    }
    y -= 14;
  } else {
    // Número principal: lo que cuesta importar, aparte de la mercadería.
    text("Costo de importación", X0, y, { size: 13, font: bold });
    right(money(costoImportacion), X1, y, {
      size: 16,
      font: bold,
      color: ACCENT,
    });
    y -= 13;
    text(
      "seguro, tributos no recuperables y gastos locales · no incluye la mercadería ni los honorarios",
      X0,
      y,
      { size: 8, color: MUTED },
    );
    y -= 40;
  }


  /* ── certificados, intervenciones y trámites (solo cotización preliminar) ── */
  if (!esLiquidacion) {
  ensure(70);
  text("CERTIFICADOS, INTERVENCIONES Y TRÁMITES", X0, y, {
    size: 9,
    font: bold,
    color: MUTED,
  });
  y -= 6;
  hr(y);
  y -= 14;

  if (requisitos.length === 0) {
    const sinReq = liq.ncm
      ? "Según la NCM y el origen declarados no detectamos intervenciones de terceros organismos ni prueba de origen obligatoria. Igualmente lo confirmamos al avanzar el despacho."
      : "Con la clasificación (NCM) a confirmar todavía no podemos detectar certificados, intervenciones ni trámites. Apenas la cerramos, te avisamos qué hace falta gestionar.";
    for (const linea of wrap(sinReq, 100)) {
      text(linea, X0, y, { size: 8.5, color: MUTED });
      y -= 11;
    }
    y -= 5;
  } else {
    const intro =
      "Detectados automáticamente por la NCM y el origen. Conviene ir gestionándolos para no demorar el despacho:";
    for (const linea of wrap(intro, 100)) {
      text(linea, X0, y, { size: 8.5, color: MUTED });
      y -= 11;
    }
    y -= 4;

    for (const r of requisitos) {
      const detalleLineas = wrap(r.detalle, 96);
      const tramites = (r.tramites ?? []).filter((t) => t.nombre || t.link);
      // alto estimado del bloque: título + detalle + trámites + aire
      const need = 14 + detalleLineas.length * 11 + tramites.length * 11 + 8;
      ensure(need);

      text(r.titulo, X0 + 8, y, { size: 9.5, font: bold });
      right(r.nivel === "requerido" ? "Requerido" : "Verificar", X1, y, {
        size: 8,
        font: bold,
        color: r.nivel === "requerido" ? ACCENT_DARK : MUTED,
      });
      y -= 13;
      for (const linea of detalleLineas) {
        text(linea, X0 + 16, y, { size: 8.5, color: MUTED });
        y -= 11;
      }
      for (const t of tramites) {
        const etiqueta = t.nombre ? `Trámite: ${t.nombre}` : "Trámite (TAD)";
        text(etiqueta, X0 + 16, y, { size: 8, color: ACCENT_DARK });
        if (t.link) {
          const lw = font.widthOfTextAtSize(etiqueta, 8);
          text(t.link, X0 + 16 + lw + 6, y, { size: 7.5, color: MUTED });
        }
        y -= 11;
      }
      y -= 7;
    }
  }
  y -= 9;
  }

  /* ── disclaimer ── */
  ensure(70);
  hr(y);
  y -= 16;
  const disclaimer = esLiquidacion
    ? [
        "Resumen ESTIMATIVO de fondos a prever, en dólares estadounidenses. No es factura ni cotización de mercadería.",
        "El cálculo puede variar según la clasificación final (NCM), el contenedor real y los gastos definitivos del forwarder.",
        "Los tributos los paga el cliente por VEP; el adelanto de logística cubre solo los pagos que el despachante realiza por cuenta y orden.",
        "La mercadería, el flete internacional y el seguro se pagan aparte según la documentación del proveedor / forwarder.",
      ]
    : [
        "Cotización ESTIMATIVA y orientativa, en dólares estadounidenses. El cálculo puede variar según la",
        "clasificación final (NCM), el contenedor real y el flete definitivo del forwarder. Los tributos los abona el",
        "cliente por VEP; el adelanto de logística cubre los pagos que el despachante realiza por cuenta y orden.",
        "El retiro del contenedor se habilita con la carta de garantía. Los honorarios del despacho se acuerdan por separado.",
      ];
  for (const linea of disclaimer) {
    text(linea, X0, y, { size: 8, color: MUTED });
    y -= 12;
  }

  return doc.save();
}
