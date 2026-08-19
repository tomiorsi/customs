/**
 * ¿La interpretación devuelve un renglón por mercadería?
 *
 * Prueba la cadena entera de la lectura sobre una factura real: planilla o PDF
 * → texto → interpretación → `mercaderia.items`.
 *
 * Es la única prueba del pre-SIM que **gasta IA** (unos US$0,02 por documento),
 * así que se corre a mano y contra un archivo concreto, no en masa.
 *
 * Uso:
 *   npx tsx --require ./scripts/register-server-only-stub.cjs \
 *     scripts/prueba-items-proforma.mjs <archivo.xls|.xlsx|.pdf>
 */
import fs from "node:fs";
import path from "node:path";

import { esExcel, extraerTextoExcel } from "../src/lib/excel-preparar.ts";
import { extraerCapaTextoPdf } from "../src/lib/capa-texto-pdf.ts";
import { interpretarLecturaDocumento } from "../src/lib/interpretacion-documento.ts";

const archivo = process.argv[2];
if (!archivo || !fs.existsSync(archivo)) {
  console.error("Pasar el archivo a interpretar.");
  process.exit(1);
}

const buf = fs.readFileSync(archivo);
const nombre = path.basename(archivo);

console.log(`Documento: ${nombre}\n`);

/* ── 1. a texto ── */

let texto = null;
if (esExcel(nombre)) {
  texto = await extraerTextoExcel(buf, nombre);
  console.log(`  planilla leída sin IA: ${texto?.length ?? 0} caracteres`);
} else {
  const capa = await extraerCapaTextoPdf(buf);
  texto = capa.tieneTexto ? capa.texto : null;
  console.log(`  capa de texto del PDF: ${texto?.length ?? 0} caracteres`);
}
if (!texto) {
  console.error("  no se pudo sacar texto del documento.");
  process.exit(1);
}

/* ── 2. interpretación ── */

console.log("  interpretando…\n");
const datos = await interpretarLecturaDocumento({
  texto,
  nombreArchivo: nombre,
  tipo: "factura_comercial",
  esImportacion: true,
});

const merc = datos?.mercaderia ?? null;
const items = merc?.items ?? [];

console.log(`  RENGLONES DEVUELTOS: ${items.length}\n`);
for (const it of items) {
  const partes = [
    `${String(it.orden ?? "?").padStart(2)}.`,
    (it.mercaderia ?? "").slice(0, 34).padEnd(34),
    (it.cantidad ?? "").padStart(12),
    (it.precio_unitario ?? "").padStart(9),
    (it.valor ?? "").padStart(11),
    it.ncm ?? "",
  ];
  console.log("   " + partes.join(" "));
}

console.log("\n  Visión de conjunto (los campos que ya existían):");
for (const k of ["mercaderia", "cantidad", "bultos", "peso_neto", "peso_bruto"]) {
  if (merc?.[k]) console.log(`    ${k.padEnd(12)} ${merc[k]}`);
}

const com = datos?.comercial ?? null;
if (com) {
  console.log("\n  Comercial:");
  for (const [k, v] of Object.entries(com)) if (v) console.log(`    ${k.padEnd(14)} ${v}`);
}

// La suma de los renglones tiene que dar el total: es el mismo invariante que
// cumplen las declaraciones reales (la cabecera es la suma de los ítems).
const suma = items.reduce((s, it) => s + (Number(String(it.valor ?? "").replace(/[^\d.-]/g, "")) || 0), 0);
if (suma) console.log(`\n  Suma de los renglones: ${suma.toFixed(2)}`);

process.exit(items.length ? 0 : 1);
