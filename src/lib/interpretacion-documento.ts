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
import {
  fundamentarDatosDesdeTranscripcion,
  reglasInterpretacionPorTipo,
  type OpcionesFundamentacion,
  type ResultadoFundamentacion,
} from "@/lib/fundamentacion-interpretacion";

const MAX_TOKENS_BASE = 2048;
const MAX_TOKENS_CAP = 8192;

function maxTokensParaTexto(chars: number): number {
  return Math.min(MAX_TOKENS_CAP, MAX_TOKENS_BASE + Math.floor(chars / 3));
}

const SYSTEM_INTERPRETAR =
  "Sos despachante de aduana argentino. Recibís la TRANSCRIPCIÓN LITERAL de UN " +
  "documento comercial/aduanero (ya extraída del PDF). Tu tarea es INTERPRETAR: " +
  "atar cada dato con su etiqueta de origen y devolver JSON estructurado.\n\n" +
  "REGLAS GLOBALES (todos los tipos de documento):\n" +
  "1. Usá SOLO información presente en la transcripción. No inventes.\n" +
  "2. Cantidades y pesos SIEMPRE con unidad tal como figura o claramente asociada en " +
  "el documento. NUNCA devuelvas un número suelto sin unidad cuando el texto indica " +
  "toneladas, kg, bultos u otra medida.\n" +
  "3. En «partes», extraé TODAS las personas/empresas con etiqueta visible " +
  "(Seller, Buyer, Bill To, Ship To, Sold To, Shipper, Consignee, Forward To, Notify, " +
  "Exporter, Producer, etc.). Cada una con su etiqueta literal del documento. Si una " +
  "etiqueta quedó corrida por OCR y no tiene nombre/domicilio propios debajo, omitila; " +
  "NO le prestes datos del bloque vecino.\n" +
  "4. Montos: conservá moneda si aparece (USD, BRL, EUR). Separá FOB, flete, seguro y " +
  "total cuando el documento los distingue. Si hay total explícito (Invoice Total, " +
  "Grand Total, Total CFR/CIF/CPT, TOTAL USD) → comercial.valor_factura.\n" +
  "5. NCM/HS: código arancelario completo (mínimo 8 dígitos, con puntos si figuran). " +
  "En BL/AWB/CRT copiá el HS/NCM tal como aparece, sin truncar. " +
  "No uses números de lote, orden de compra ni referencia interna como NCM.\n" +
  "6. En facturas/packing: no confundas precio unitario con cantidad ni peso. Si hay " +
  "líneas con unidades mezcladas (ej. rolls + lbs, pcs + kg), NO las unas en una sola " +
  "cantidad: preferí peso_neto/peso_bruto y bultos, y omití cantidad si no hay total homogéneo.\n" +
  "7. Fechas: convertí a DD/MM/AAAA. Formatos US (mes/día/año) → día/mes/año argentino. " +
  "Aceptá día y mes sin cero a la izquierda si así figuran en el documento.\n" +
  "8. Número de factura comercial → pago.nro_factura. Etiquetas posibles: «Invoice», " +
  "«Invoice No.», «Invoice Number», «Invoice #», «Factura N°», «Nº». El número puede estar " +
  "en la MISMA línea que la etiqueta o en la línea SIGUIENTE (etiqueta arriba, número abajo). " +
  "NO lo confundas con «Invoice Date» (fecha). El nº de BL/AWB/CRT/CMR (solo en documentos de " +
  "transporte) → transporte.transporte_doc_nro; nunca pongas el nº de factura ahí.\n" +
  "9. «via»: solo si el documento lo indica explícitamente.\n" +
  "10. País destino aduanero: si el contexto indica IMPORTACIÓN, origen.pais_destino = Argentina. " +
  "Direcciones en hub logístico o «forward to» no son destino aduanero.\n" +
  "10b. origen.pais_origen en factura comercial: SOLO si el documento lo declara " +
  "explícitamente (Country of Origin, Origin, Origin Ctry, etc.). Nunca inferirlo solo " +
  "desde el domicilio del vendedor/exportador.\n" +
  "11. Omití claves vacías. Respondé EXCLUSIVAMENTE JSON válido.\n" +
  "12. IDIOMA: devolvé los valores de texto libre en ESPAÑOL. Traducí el modo de " +
  "transporte (Road→Terrestre, Air→Aéreo, Sea/Ocean→Marítimo, Rail→Ferroviario) y las " +
  "condiciones de pago (At sight→A la vista, Net 30→A 30 días, Advance→Anticipado). " +
  "Los nombres propios, códigos, números y NCM NO se traducen.\n" +
  "13. UNA sola factura por documento: esta transcripción es de UN documento. " +
  "Una operación puede tener VARIAS facturas comerciales (de distintos proveedores o " +
  "envíos); extraé el nº, total y proveedor SOLO de ESTE documento, sin sumar ni " +
  "mezclar con otras facturas ni inventar un total consolidado.\n";

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
  '    "transporte_doc_nro":"nº de BL/AWB/CRT (solo docs de transporte)",\n' +
  '    "transportista":"","puerto_origen":"","puerto_destino":"","eta":"","medio_transporte":"Terrestre/Aéreo/Marítimo"\n' +
  "  },\n" +
  '  "pago": {"forma_pago":"","nro_factura":"nº de factura comercial","fecha_factura":"","plazo_pago_dias":""},\n' +
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
  /** Importación a Argentina: destino aduanero fijo en marco operativo. */
  esImportacion?: boolean;
  rol?: string;
};

/**
 * Paso 2: interpreta lectura.texto → datos estructurados (Haiku texto, sin PDF).
 */
export async function interpretarLecturaDocumento(
  input: InterpretarLecturaInput,
): Promise<DatosDocumentoOperacion> {
  const r = await interpretarLecturaDocumentoFundada(input);
  return r.datos;
}

/** Interpretación + descarte de campos no anclados en la transcripción. */
export async function interpretarLecturaDocumentoFundada(
  input: InterpretarLecturaInput,
): Promise<ResultadoFundamentacion> {
  if (!iaDocsDisponible()) {
    return { datos: { ...VACIO_DATOS_DOC }, vacios: [] };
  }

  const texto = input.texto.trim();
  if (texto.length < 40) {
    return { datos: { ...VACIO_DATOS_DOC }, vacios: [] };
  }

  const label = DOC_LABELS[input.tipo] ?? input.tipo;
  const reglasTipo = reglasInterpretacionPorTipo(input.tipo, {
    esImportacion: input.esImportacion,
  });
  const userText =
    (input.contextoOperacion
      ? `Contexto operación (solo referencia; la transcripción manda):\n${input.contextoOperacion}\n\n`
      : "") +
    `Archivo: ${input.nombreArchivo}\n` +
    `Tipo documento: ${label} (${input.tipo})\n` +
    (input.rol ? `Rol: ${input.rol}\n` : "") +
    reglasTipo +
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
      maxTokensParaTexto(texto.length),
      {
        etiqueta: "doc.interpretar-lectura",
        detalle: input.nombreArchivo,
        modelo: MODELO,
      },
    );
    const normalizado = normalizarDatosDocumentoOperacion(raw);
    return fundamentarDatosDesdeTranscripcion(normalizado, texto, input.tipo, {
      esImportacion: input.esImportacion,
    });
  } catch (err) {
    console.error(`[doc.interpretar] ${input.nombreArchivo}:`, err);
    return { datos: { ...VACIO_DATOS_DOC }, vacios: [] };
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
    if (o.pais_origen) lineas.push(`País de origen: ${o.pais_origen}`);
    if (o.pais_procedencia) lineas.push(`País de procedencia: ${o.pais_procedencia}`);
    if (o.pais_destino) lineas.push(`País de destino: ${o.pais_destino}`);
  }
  if (datos.transporte?.transporte_doc_nro) {
    lineas.push(
      `Referencia documental (factura/CO/transporte): ${datos.transporte.transporte_doc_nro}`,
    );
  }
  if (datos.pago?.forma_pago) lineas.push(`Pago: ${datos.pago.forma_pago}`);
  if (datos.via) lineas.push(`Vía: ${datos.via}`);

  return lineas.join("\n");
}
