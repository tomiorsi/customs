/**
 * Prueba la traducción de catálogos del sistema a códigos del SIM.
 *
 * Lo que hay que demostrar no es que traduzca, sino que **no invente**: que
 * cada código exista de verdad en su tabla, que las etiquetas que no son un
 * país no devuelvan ninguno, y que no se cuele el país equivocado cuando dos
 * comparten nombre común.
 *
 * Uso: npx tsx --require ./scripts/register-server-only-stub.cjs \
 *        scripts/presim-pruebas-catalogos.mjs
 */
import { codigoIncoterm, codigoPais, codigoUnidad } from "../src/lib/presim/catalogos.ts";
import { buscar } from "../src/lib/presim/tablas.ts";
import { UNIDADES } from "../src/lib/unidades.ts";
import { INCOTERMS, PAISES } from "../src/lib/cotizador.ts";

let fallas = 0;
const chequear = (nombre, ok, detalle = "") => {
  if (!ok) fallas++;
  console.log(`   ${ok ? "✓" : "✗"} ${nombre.padEnd(50)} ${detalle}`);
};

/* ── 1. todas las unidades del sistema traducen y existen ── */

console.log("1. Unidades\n");
let sinCodigo = [];
for (const u of UNIDADES) {
  const r = codigoUnidad(u);
  if (r.codigo === null) sinCodigo.push(`${u}: ${r.porque}`);
}
chequear(`las ${UNIDADES.length} unidades tienen código en UMM`, sinCodigo.length === 0, sinCodigo.join(" · "));

// Que el código exista no alcanza: tiene que ser el correcto. Se comprueba
// leyendo la descripción que el SIM le pone y viendo que hable de lo mismo.
// En singular: el SIM nombra la unidad, no la cantidad. Y ojo con la vigencia
// —«05» decía LITROS hasta 2016 y hoy dice LITRO—, por eso se compara por raíz
// y no por el texto completo.
const MUESTRA = [["Kilogramos", "KILOGRAMO"], ["Unidades", "UNIDAD"], ["Docenas", "DOCENA"], ["Litros", "LITRO"]];
for (const [etiqueta, esperado] of MUESTRA) {
  const r = codigoUnidad(etiqueta);
  const desc = r.codigo ? (buscar("UMM", r.codigo)?.descripcion ?? "") : "";
  chequear(`${etiqueta} → ${r.codigo ?? "—"}`, desc.toUpperCase().includes(esperado), desc);
}

/* ── 2. países ── */

console.log("\n2. Países\n");
const fallan = [];
for (const p of PAISES) {
  const r = codigoPais(p.nombre);
  if (r.codigo === null && !r.porque.includes("cotizar")) fallan.push(`${p.nombre}`);
}
chequear("todos los países reales traducen", fallan.length === 0, fallan.join(", "));

// El caso que justifica no usar parecido de texto.
const sur = codigoPais("Corea del Sur");
chequear("Corea del Sur → 309, no 308", sur.codigo === "309", `${sur.codigo} · ${buscar("PAY", sur.codigo ?? "")?.descripcion ?? ""}`);

// La ñ perdida en el export del Kit.
const esp = codigoPais("España");
chequear("España resuelve pese a «ESPA#A»", esp.codigo === "410", `${esp.codigo} · ${buscar("PAY", esp.codigo ?? "")?.descripcion ?? ""}`);

const ale = codigoPais("Alemania");
chequear("Alemania → 438", ale.codigo === "438", buscar("PAY", ale.codigo ?? "")?.descripcion ?? "");

// Las etiquetas que no son un país no pueden dar un código.
for (const e of ["Otro país (Unión Europea)", "Otro país (extrazona)"]) {
  const r = codigoPais(e);
  chequear(`«${e}» no devuelve país`, r.codigo === null, r.codigo === null ? r.porque : `devolvió ${r.codigo}`);
}

chequear("un país inventado no devuelve código", codigoPais("Wakanda").codigo === null);
chequear("vacío no devuelve código", codigoPais("").codigo === null);

/* ── 3. incoterms ── */

console.log("\n3. Incoterms\n");
const incFallan = INCOTERMS.filter((i) => codigoIncoterm(i.value).codigo === null).map((i) => i.value);
chequear(`los ${INCOTERMS.length} del formulario están en INC`, incFallan.length === 0, incFallan.join(", "));
chequear("minúsculas también resuelven", codigoIncoterm("fob").codigo === "FOB");
chequear("un incoterm inventado no pasa", codigoIncoterm("ZZZ").codigo === null);

console.log(`\n${fallas === 0 ? "Todo en orden." : `${fallas} fallas.`}`);
process.exit(fallas === 0 ? 0 : 1);
