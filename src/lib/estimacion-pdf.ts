import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { embeberLogo, encajarLogo } from "@/lib/pdf-marca";
import { formatUsd } from "@/lib/cotizacion-pdf";
import { destinacionPorId } from "@/lib/destinaciones";
import type { PublicUser } from "@/lib/types";

/**
 * Estimación de la calculadora, en UNA página.
 *
 * Es distinto del PDF de la operación: no hay carpeta ni cliente, es un cálculo
 * exploratorio ("¿cuánto me sale traer esto?"). Por eso entra entero en una
 * hoja —se mira de un vistazo, se manda por WhatsApp, se imprime— y por eso
 * lleva al pie que es una estimación y no una cotización en firme.
 *
 * Todo el layout está pensado para no desbordar: los bloques tienen alto
 * conocido y las líneas opcionales solo aparecen cuando tienen valor, así que
 * el peor caso sigue entrando.
 */

const ACCENT = rgb(0.976, 0.451, 0.086);
const TEXT = rgb(0.07, 0.09, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.886, 0.91, 0.941);
const ACCENT_SOFT = rgb(1, 0.953, 0.906);
const ACCENT_DARK = rgb(0.722, 0.275, 0.063);
const BRAND = rgb(0.431, 0.455, 0.502);

const ESTUDIO = process.env.NEXT_PUBLIC_ESTUDIO_NOMBRE || "J&C Comex";

export type EstimacionPdfInput = {
  modo: "importacion" | "exportacion";
  destinacion: string | null;
  descripcion: string | null;
  ncm: string | null;
  pais: string;
  via: string;
  incoterm: string;
  moneda: string;
  cantidad: number | null;
  unidad: string | null;
  perfilLabel: string;
  destinoLabel: string | null;
  /** Números ya calculados por el motor, tal como se ven en pantalla. */
  cifra: {
    valor: number;
    flete: number;
    seguro: number;
    cif: number;
    diPct: number;
    di: number;
    tasa: number;
    tasaExenta: boolean;
    ivaPct: number;
    iva: number;
    percIva: number;
    percGan: number;
    iibb: number;
    honorarios: number;
    honorariosIva: number;
    gastosTerminal: number;
    recuperable: number;
    desembolso: number;
    costoReal: number;
    porUnidad: number | null;
    garantia: number | null;
    suspensiva: boolean;
  };
};

export async function generarEstimacionPDF(
  data: EstimacionPdfInput,
  user: PublicUser | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  const M = 44;
  const X0 = M;
  const X1 = width - M;
  let y = height - M;

  const money = (n: number) => formatUsd(n);

  const text = (
    s: string,
    x: number,
    yy: number,
    o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    page.drawText(s, {
      x,
      y: yy,
      size: o.size ?? 9,
      font: o.font ?? font,
      color: o.color ?? TEXT,
    });
  };

  const right = (
    s: string,
    xr: number,
    yy: number,
    o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const f = o.font ?? font;
    const size = o.size ?? 9;
    text(s, xr - f.widthOfTextAtSize(s, size), yy, o);
  };

  const hr = (yy: number, color = LINE) => {
    page.drawLine({
      start: { x: X0, y: yy },
      end: { x: X1, y: yy },
      thickness: 0.7,
      color,
    });
  };

  /* ── encabezado ── */
  const logo = await embeberLogo(doc, user);
  const headerCentro = y - 18;
  if (logo) {
    page.drawImage(
      logo,
      encajarLogo(logo, {
        derecha: X1,
        centroY: headerCentro,
        maxAncho: 132,
        maxAlto: 46,
      }),
    );
  } else {
    right(ESTUDIO, X1, headerCentro - 4, { size: 13, font: bold, color: BRAND });
  }

  const esExpo = data.modo === "exportacion";
  text(
    esExpo ? "Estimación de exportación" : "Estimación de importación",
    X0,
    headerCentro + 2,
    { size: 15, font: bold, color: ACCENT_DARK },
  );
  const hoy = new Date().toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  text(hoy, X0, headerCentro - 12, { size: 8, color: MUTED });

  y = headerCentro - 34;
  hr(y, ACCENT);
  y -= 20;

  /* ── qué se está estimando ── */
  const dest = destinacionPorId(data.destinacion);
  const datos: [string, string][] = [
    ["Mercadería", data.descripcion?.slice(0, 58) || "Sin clasificar"],
    ["Posición NCM", data.ncm || "Sin definir"],
    ["Destinación", dest?.label ?? (esExpo ? "Exportación a consumo" : "Importación a consumo")],
    [esExpo ? "País de destino" : "País de origen", data.pais],
    ["Vía", data.via],
    ["Incoterm", data.incoterm],
    ["Perfil fiscal", data.perfilLabel],
  ];
  if (data.destinoLabel) datos.push(["Destino de la mercadería", data.destinoLabel]);
  if (data.cantidad && data.cantidad > 0) {
    datos.push([
      "Cantidad",
      `${data.cantidad.toLocaleString("es-AR")}${data.unidad ? ` ${data.unidad}` : ""}`,
    ]);
  }

  // Dos columnas. Cada dato ocupa dos renglones (etiqueta chica arriba, valor
  // debajo), así que la fila necesita alto para los dos MÁS el aire que separa
  // una fila de la siguiente: con menos, la etiqueta de abajo se lee pegada al
  // valor de arriba y el bloque se vuelve ilegible.
  const colW = (X1 - X0) / 2;
  const FILA = 23;
  datos.forEach(([k, v], i) => {
    const col = i % 2;
    const fila = Math.floor(i / 2);
    const x = X0 + col * colW;
    const yy = y - fila * FILA;
    text(k.toUpperCase(), x, yy, { size: 6.5, font: bold, color: MUTED });
    text(v, x, yy - 10, { size: 9 });
  });
  y -= Math.ceil(datos.length / 2) * FILA + 12;

  /* ── aviso del régimen suspensivo ── */
  if (data.cifra.suspensiva && dest) {
    const alto = 30;
    page.drawRectangle({
      x: X0,
      y: y - alto,
      width: X1 - X0,
      height: alto,
      color: ACCENT_SOFT,
    });
    text("RÉGIMEN SUSPENSIVO", X0 + 10, y - 12, {
      size: 7,
      font: bold,
      color: ACCENT_DARK,
    });
    text(
      `${dest.norma} · los tributos no se pagan, se garantizan${
        dest.plazo ? ` · ${dest.plazo.dias} días desde ${dest.plazo.desde}` : ""
      }`,
      X0 + 10,
      y - 23,
      { size: 8, color: ACCENT_DARK },
    );
    y -= alto + 14;
  }

  /* ── helpers de bloque ── */
  const grupo = (titulo: string, total?: string) => {
    text(titulo, X0, y, { size: 9.5, font: bold });
    if (total) right(total, X1, y, { size: 9.5, font: bold });
    y -= 6;
    hr(y);
    y -= 13;
  };

  const item = (label: string, valor: string, nota?: string) => {
    text(label, X0 + 8, y, { size: 8.5, color: TEXT });
    if (nota) {
      const w = font.widthOfTextAtSize(label, 8.5);
      text(nota, X0 + 14 + w, y, { size: 7, color: MUTED });
    }
    right(valor, X1, y, { size: 8.5 });
    y -= 13;
  };

  const c = data.cifra;

  /* ── 1) valor en aduana ── */
  grupo(esExpo ? "Valor de la operación" : "Valor en aduana (CIF)", money(c.cif));
  item("Mercadería (según factura)", money(c.valor));
  if (c.flete > 0) item("Flete internacional", money(c.flete));
  if (c.seguro > 0) item("Seguro", money(c.seguro));
  y -= 6;

  /* ── 2) tributos ── */
  grupo(
    c.suspensiva
      ? "Tributos suspendidos (se garantizan)"
      : esExpo
        ? "Derechos de exportación"
        : "Impuestos y tributos",
    money(c.di + (c.tasaExenta ? 0 : c.tasa) + c.iva + c.percIva + c.percGan + c.iibb),
  );
  item(`Derecho de importación (${c.diPct}%)`, money(c.di));
  item("Tasa de estadística", c.tasaExenta ? "Exenta" : money(c.tasa));
  item(`IVA (${c.ivaPct}%)`, money(c.iva));
  if (c.percIva > 0) item("Percepción IVA", money(c.percIva));
  if (c.percGan > 0) item("Percepción Ganancias", money(c.percGan));
  if (c.iibb > 0) item("Percepción IIBB", money(c.iibb));
  y -= 6;

  /* ── 3) servicios y gastos ── */
  grupo("Servicios y gastos", money(c.honorarios + c.honorariosIva + c.gastosTerminal));
  item("Honorarios del despachante", money(c.honorarios));
  if (c.honorariosIva > 0) item("IVA sobre honorarios", money(c.honorariosIva));
  if (c.gastosTerminal > 0) {
    item("Gastos locales", money(c.gastosTerminal), "naviera, terminal, despacho");
  }
  y -= 10;

  /* ── totales ── */
  hr(y, ACCENT);
  y -= 22;
  text("Total a desembolsar", X0, y, { size: 13, font: bold });
  right(money(c.desembolso), X1, y, { size: 17, font: bold, color: ACCENT });
  y -= 14;
  text(
    c.suspensiva
      ? "no incluye los tributos suspendidos: se garantizan, no se pagan"
      : "incluye tributos, IVA y percepciones",
    X0,
    y,
    { size: 7.5, color: MUTED },
  );
  y -= 20;

  if (c.garantia != null) {
    item("Garantía a constituir", money(c.garantia), "no es un pago");
  }
  if (c.recuperable > 0) {
    item("Recuperás después", money(c.recuperable), "crédito fiscal / pago a cuenta");
  }
  item("Costo final real estimado", money(c.costoReal));
  if (c.porUnidad != null && c.porUnidad > 0) {
    item("Costo por unidad", money(c.porUnidad));
  }

  /* ── pie ── */
  const pieY = M + 26;
  hr(pieY + 16);
  text(
    "Estimación orientativa. No es una cotización en firme: los valores finales dependen de la clasificación",
    X0,
    pieY + 4,
    { size: 7, color: MUTED },
  );
  text(
    "arancelaria definitiva, del flete y del seguro reales, y de la normativa vigente al momento de oficializar.",
    X0,
    pieY - 5,
    { size: 7, color: MUTED },
  );

  return doc.save();
}
