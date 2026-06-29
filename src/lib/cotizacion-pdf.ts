import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { OperationWithClient } from "@/lib/data";
import type { LiquidacionResult } from "@/lib/liquidacion";
import type { Requisito } from "@/lib/requisitos";

/**
 * Genera el PDF de la COTIZACIÓN PRELIMINAR de importación: el mismo desglose
 * que ve el operador en el paso 1 (mercadería/CIF, tributos, gastos locales y
 * totales), en un documento limpio de una sola página para enviar al cliente.
 *
 * Los honorarios no se imprimen con monto (se acuerdan con la dirección) y los
 * valores son estimados/orientativos (el detalle firme se ajusta con el BL real
 * en el paso 2). Devuelve los bytes del PDF.
 */

const ESTUDIO = process.env.NEXT_PUBLIC_ESTUDIO_NOMBRE || "RCV Orsi";

const ACCENT = rgb(0.976, 0.451, 0.086); // #f97316
const TEXT = rgb(0.07, 0.09, 0.15); // #111827
const MUTED = rgb(0.42, 0.45, 0.5); // #6b7280
const LINE = rgb(0.886, 0.91, 0.941); // #e2e8f0
const BRAND = rgb(0.431, 0.455, 0.502); // #6e7480 (gris del logotipo de la página)
const WHITE = rgb(1, 1, 1);
const ACCENT_SOFT = rgb(1, 0.953, 0.906); // #fff3e7 (banda suave naranja)
const ACCENT_DARK = rgb(0.722, 0.275, 0.063); // #b84610 (texto sobre la banda)

/** Trazos del ícono de contenedor del logo (lucide "Box", igual que en la web). */
const ICONO_BOX_PATHS = [
  "M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.7 0l10.3-6c.5-.3.9-1 .9-1.5Z",
  "M10 21.9V14L2.1 9.1",
  "m10 14 11.9-6.9",
  "M14 19.8v-8.1",
  "M18 17.5V9.4",
];

export function formatUsd(n: number): string {
  const neg = n < 0;
  const s = Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "- " : ""}US$ ${s}`;
}

const money = formatUsd;

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
): Promise<Uint8Array> {
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

  /* ── helpers de dibujo ── */
  const text = (
    s: string,
    x: number,
    yy: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    page.drawText(s, {
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
    const f = opts.font ?? font;
    const size = opts.size ?? 10;
    const w = f.widthOfTextAtSize(s, size);
    text(s, xRight - w, yy, opts);
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
    const f = opts.font ?? font;
    const size = opts.size ?? 10;
    let cx = x;
    for (const ch of s) {
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

  /* ── encabezado: logo (cuadro naranja + ícono) + nombre, igual que en la web ── */
  const S = 40; // lado del cuadro del logo
  const boxTop = y; // borde superior del cuadro
  const boxBottom = boxTop - S;
  const boxCenter = boxBottom + S / 2;
  page.drawSvgPath(roundedRect(S, S, 10), { x: X0, y: boxTop, color: ACCENT });
  // Ícono de contenedor en blanco, centrado en el cuadro (viewBox 32, translate 4,4).
  const k = S / 32;
  for (const p of ICONO_BOX_PATHS) {
    page.drawSvgPath(p, {
      x: X0 + 4 * k,
      y: boxTop - 4 * k,
      scale: k,
      borderColor: WHITE,
      borderWidth: 2.2 * k,
    });
  }
  // Nombre del estudio (gris) + subtítulo, centrados verticalmente contra el cuadro.
  const tx = X0 + S + 13;
  text(ESTUDIO, tx, boxCenter + 1.5, { size: 19, font: bold, color: BRAND });
  textTracked("ESTUDIO ADUANERO", tx + 1, boxCenter - 11, 1.3, {
    size: 7,
    font: bold,
    color: BRAND,
  });

  // Nombre que le puso el cliente a la operación + el cliente debajo.
  const titulo = (op.titulo || "").trim() || op.ref;
  right(titulo, X1, boxCenter + 1.5, { size: 11.5, font: bold });
  if (op.company_name) {
    right(op.company_name, X1, boxCenter - 11, { size: 9, color: MUTED });
  }
  y = boxBottom - 26;

  /* ── banda del título (estilo de la página: naranja suave con barra de acento) ── */
  const bandH = 50;
  const bandTop = y;
  const bandBottom = bandTop - bandH;
  page.drawSvgPath(roundedRect(X1 - X0, bandH, 12), {
    x: X0,
    y: bandTop,
    color: ACCENT_SOFT,
  });
  // Barra de acento a la izquierda.
  page.drawSvgPath(roundedRect(4, bandH - 20, 2), {
    x: X0 + 14,
    y: bandTop - 10,
    color: ACCENT,
  });
  const bandCenter = bandBottom + bandH / 2;
  const bx = X0 + 28;
  text("Cotización preliminar de importación", bx, bandCenter - 5, {
    size: 14,
    font: bold,
    color: ACCENT_DARK,
  });
  y = bandBottom - 24;

  /* ── datos de la operación ── */
  y -= 4;
  const datos: [string, string][] = [
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
  y -= 6;

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

  // 1) Mercadería (CIF)
  grupo("Mercadería (CIF)", money(c.cif));
  item(
    "Valor de la mercadería",
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

  // 3) Despacho y gastos locales
  grupo("Despacho y gastos locales", money(gastosLocales));
  item("Honorarios despachante", "A convenir", "se acuerdan aparte");
  item("Gastos locales (naviera, terminal, despacho)", money(gastosLocales));
  y -= 14;

  /* ── totales: el costo de importación (sin la mercadería) es el número clave ── */
  const costoImportacion = liq.costoTotal - valorMercaderia;
  hr(y, ACCENT);
  y -= 22;
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
  y -= 22;
  // Referencia: mercadería + costo de importación = costo puesto en depósito.
  text("Valor de la mercadería (factura)", X0, y, { size: 9.5, color: MUTED });
  right(money(valorMercaderia), X1, y, { size: 9.5, color: MUTED });
  y -= 15;
  text("Costo puesto en depósito (mercadería + importación)", X0, y, {
    size: 9.5,
    color: MUTED,
  });
  right(money(liq.costoTotal), X1, y, { size: 9.5, color: MUTED });
  y -= 22;

  // Notas de flujo de fondos (lo que se adelanta y se recupera/reintegra).
  hr(y);
  y -= 14;
  if (c.recuperable > 0) {
    const notaVep = wrap(
      `Además adelantás ${money(c.recuperable)} de tributos por VEP que recuperás como ` +
        `crédito fiscal / pago a cuenta (no son costo para este perfil).`,
      96,
    );
    for (const linea of notaVep) {
      text(linea, X0, y, { size: 8.5, color: MUTED });
      y -= 11;
    }
    y -= 3;
  }
  {
    const notaLog = `Adelanto de logística estimado: ${money(liq.adelanto)}.`;
    for (const linea of wrap(notaLog, 96)) {
      text(linea, X0, y, { size: 8.5, color: MUTED });
      y -= 11;
    }
  }
  y -= 16;

  /* ── certificados, intervenciones y trámites (según NCM + origen) ── */
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

  /* ── disclaimer ── */
  ensure(70);
  hr(y);
  y -= 16;
  const disclaimer = [
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
