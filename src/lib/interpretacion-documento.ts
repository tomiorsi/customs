import "server-only";

import { DOC_LABELS, type DocType } from "@/lib/docs";
import {
  iaDocsDisponible,
  invocarIATexto,
  MODELO,
  normalizarDatosDocumentoOperacion,
  VACIO_DATOS_DOC,
  type DatosDocumentoOperacion,
} from "@/lib/ia-documentos";

const MAX_TOKENS = 2048;

const SYSTEM_INTERPRETAR =
  "Sos despachante de aduana argentino. Recibís la TRANSCRIPCIÓN LITERAL de UN " +
  "documento comercial/aduanero (ya extraída del PDF). Tu tarea es INTERPRETAR: " +
  "atar cada dato con su etiqueta de origen y devolver JSON estructurado.\n\n" +
  "REGLAS GLOBALES (todos los tipos de documento):\n" +
  "1. Usá SOLO información presente en la transcripción. No inventes.\n" +
  "2. Cantidades y pesos SIEMPRE con unidad tal como figura o claramente asociada en " +
  "el documento. NUNCA devuelvas un número suelto sin unidad cuando el texto indica " +
  "toneladas, kg, bultos u otra medida.\n" +
  "3. En «partes», cada persona/empresa va con la ETIQUETA del documento " +
  "(Seller, Buyer, Shipper, Consignee, Importador, Exportador, Producer, Notify, " +
  "Sold To, etc.) — no adivines el rol sin etiqueta cercana en el texto.\n" +
  "4. Montos: conservá moneda si aparece (USD, BRL). Separá FOB, flete, seguro y " +
  "total cuando el documento los distingue.\n" +
  "5. NCM/HS: copiá el código tal como aparece en el documento (puntos y letra de ítem si hay).\n" +
  "6. Fechas en DD/MM/AAAA cuando sea posible.\n" +
  "7. Números de factura, orden, BL o CRT: copialos en transporte.transporte_doc_nro " +
  "o en observaciones si hay varios (Invoice Number, CUSTOMER ORDER, Factura Comercial).\n" +
  "8. «via»: solo si el documento lo indica. CRT/road/truck → terrestre; BL/ocean/vessel → " +
  "maritima; AWB/air → aerea. Facturas y packing no definen vía salvo mención explícita del " +
  "medio. El contexto de operación es referencia: no lo uses si contradice la transcripción.\n" +
  "9. Omití claves vacías. Respondé EXCLUSIVAMENTE JSON válido.\n";

const ESQUEMA_DATOS =
  "{\n" +
  '  "comercial": {\n' +
  '    "valor_factura": "total factura/CPT/CIF según documento",\n' +
  '    "valor_fob": "", "valor_cif": "", "flete": "", "seguro": "",\n' +
  '    "incoterm": "CPT, CFR, FOB...", "moneda": "USD"\n' +
  "  },\n" +
  '  "mercaderia": {\n' +
  '    "mercaderia": "descripción del producto",\n' +
  '    "marca": "", "ncm": "si figura",\n' +
  '    "cantidad": "con unidad", "unidad": "MT, KG...",\n' +
  '    "bultos": "con tipo si figura", "tipo_embalaje": "",\n' +
  '    "peso_neto": "con unidad", "peso_bruto": "con unidad"\n' +
  "  },\n" +
  '  "partes": [\n' +
  '    {"etiqueta":"Seller|Buyer|Shipper|...","nombre":"","domicilio":"","pais":"","identificacion":"CUIT/CNPJ"}\n' +
  "  ],\n" +
  '  "origen": {"pais_origen":"","pais_procedencia":"","pais_destino":""},\n' +
  '  "transporte": {\n' +
  '    "transporte_doc_nro":"BL/CRT/factura nº",\n' +
  '    "transportista":"","puerto_origen":"","puerto_destino":"","eta":"","medio_transporte":""\n' +
  "  },\n" +
  '  "pago": {"forma_pago":"","fecha_factura":"","plazo_pago_dias":""},\n' +
  '  "logistica": {"contenedor":"","tipo_contenedor":"","cantidad_contenedores":"","volumen_cbm":""},\n' +
  '  "formalidades": {"entidad_emisora":"","sellos_firmas_vistos":"","observaciones_visuales":""},\n' +
  '  "via": "maritima|aerea|terrestre|null"\n' +
  "}";

export type InterpretarLecturaInput = {
  texto: string;
  nombreArchivo: string;
  tipo: DocType;
  /** Contexto breve de la operación (NCM, países…) — opcional. */
  contextoOperacion?: string | null;
  rol?: string;
};

/**
 * Paso 2: interpreta lectura.texto → datos estructurados (Haiku texto, sin PDF).
 */
export async function interpretarLecturaDocumento(
  input: InterpretarLecturaInput,
): Promise<DatosDocumentoOperacion> {
  if (!iaDocsDisponible()) return { ...VACIO_DATOS_DOC };

  const texto = input.texto.trim();
  if (texto.length < 40) return { ...VACIO_DATOS_DOC };

  const label = DOC_LABELS[input.tipo] ?? input.tipo;
  const userText =
    (input.contextoOperacion
      ? `Contexto operación (solo referencia; la transcripción manda):\n${input.contextoOperacion}\n\n`
      : "") +
    `Archivo: ${input.nombreArchivo}\n` +
    `Tipo documento: ${label} (${input.tipo})\n` +
    (input.rol ? `Rol: ${input.rol}\n` : "") +
    "\nTRANSCRIPCIÓN LITERAL:\n" +
    "---\n" +
    texto +
    "\n---\n\n" +
    "Devolvé JSON con EXACTAMENTE esta forma (omití claves vacías):\n" +
    ESQUEMA_DATOS;

  try {
    const raw = await invocarIATexto(
      SYSTEM_INTERPRETAR,
      userText,
      MAX_TOKENS,
      {
        etiqueta: "doc.interpretar-lectura",
        detalle: input.nombreArchivo,
        modelo: MODELO,
      },
    );
    return normalizarDatosDocumentoOperacion(raw);
  } catch (err) {
    console.error(`[doc.interpretar] ${input.nombreArchivo}:`, err);
    return { ...VACIO_DATOS_DOC };
  }
}

/** Serializa datos para cruce / prompts posteriores (legible, con unidades). */
export function serializarDatosDocumento(datos: DatosDocumentoOperacion): string {
  const lineas: string[] = ["DATOS INTERPRETADOS:"];

  if (datos.partes?.length) {
    lineas.push("Partes:");
    for (const p of datos.partes) {
      const extra = [p.domicilio, p.pais, p.identificacion].filter(Boolean).join(" · ");
      lineas.push(`  - ${p.etiqueta}: ${p.nombre}${extra ? ` (${extra})` : ""}`);
    }
  }
  if (datos.mercaderia) {
    const m = datos.mercaderia;
    if (m.mercaderia) lineas.push(`Mercadería: ${m.mercaderia}`);
    if (m.ncm) lineas.push(`NCM: ${m.ncm}`);
    if (m.cantidad) lineas.push(`Cantidad: ${m.cantidad}`);
    if (m.peso_neto) lineas.push(`Peso neto: ${m.peso_neto}`);
    if (m.peso_bruto) lineas.push(`Peso bruto: ${m.peso_bruto}`);
    if (m.bultos) lineas.push(`Bultos: ${m.bultos}`);
    if (m.tipo_embalaje) lineas.push(`Embalaje: ${m.tipo_embalaje}`);
  }
  if (datos.comercial) {
    const c = datos.comercial;
    if (c.incoterm) lineas.push(`Incoterm: ${c.incoterm}`);
    if (c.valor_factura) lineas.push(`Valor factura/total: ${c.valor_factura}${c.moneda ? ` ${c.moneda}` : ""}`);
    if (c.valor_fob) lineas.push(`FOB: ${c.valor_fob}`);
    if (c.flete) lineas.push(`Flete: ${c.flete}`);
  }
  if (datos.origen) {
    const o = datos.origen;
    const p = [o.pais_origen, o.pais_procedencia, o.pais_destino].filter(Boolean);
    if (p.length) lineas.push(`Origen/destino: ${p.join(" → ")}`);
  }
  if (datos.transporte?.transporte_doc_nro) {
    lineas.push(`Doc transporte/factura nº: ${datos.transporte.transporte_doc_nro}`);
  }
  if (datos.pago?.forma_pago) lineas.push(`Pago: ${datos.pago.forma_pago}`);
  if (datos.via) lineas.push(`Vía: ${datos.via}`);

  return lineas.join("\n");
}
