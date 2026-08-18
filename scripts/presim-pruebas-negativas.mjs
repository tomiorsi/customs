/**
 * Pruebas negativas del validador del pre-SIM.
 *
 * Un validador que aprueba todo no sirve de nada. Acá se rompe una declaración
 * real a propósito, de una forma distinta cada vez, y se exige que el
 * validador la marque. Si alguna rotura pasa desapercibida, falla la prueba.
 *
 * Uso: npx tsx --require ./scripts/register-server-only-stub.cjs \
 *        scripts/presim-pruebas-negativas.mjs <archivo.txt>
 */
import fs from "node:fs";
import path from "node:path";
import { leerDeclaracion } from "../src/lib/presim/archivo.ts";
import { validarDeclaracion } from "../src/lib/presim/validar.ts";
import { leerFilas } from "../src/lib/parquet-store.ts";

const archivo = process.argv[2];
if (!archivo) { console.error("Pasar un .txt real como base."); process.exit(1); }

const ncmFilas = await leerFilas(path.join(process.cwd(), "data/Nomenclatura/ncm.parquet"), ["codigo"]);
const NCM = new Set(ncmFilas.map((r) => String(r.codigo ?? "").trim()));
const validar = (d) => validarDeclaracion(d, { ncmValido: (n) => NCM.has(n) });

const base = leerDeclaracion(fs.readFileSync(archivo, "latin1"));

/**
 * La marca de una sección en `GEN` para este subrégimen.
 *
 * Hace falta porque las roturas de sección no aplican a cualquier archivo: no
 * se puede probar «sacar [BUL]» sobre una declaración cuyo subrégimen no la
 * exige. La prueba se saltea en vez de dar un falso negativo.
 */
const GEN = leerCsv(path.join(process.cwd(), "data/Normas/SIM/kit/GEN.csv"));
function marcaDeSeccion(sub, marca) {
  const fila = GEN.find((x) => (x.ISTA ?? "").trim() === sub);
  return (fila?.[marca] ?? "").trim();
}
function leerCsv(p) {
  const [cab, ...filas] = fs.readFileSync(p, "utf8").split(/\r?\n/);
  const cols = cab.replace(/^﻿/, "").split(",").map((c) => c.replace(/"/g, "").trim());
  return filas.filter((l) => l.trim()).map((l) => {
    const v = l.split(",").map((c) => c.replace(/"/g, "").trim());
    return Object.fromEntries(cols.map((c, i) => [c, v[i] ?? ""]));
  });
}
const clonar = () => JSON.parse(JSON.stringify(base));
const set = (d, sec, clave, val) => {
  const b = d.bloques.find((x) => x.seccion === sec);
  const i = b.pares.findIndex(([k]) => k === clave);
  if (i >= 0) b.pares[i][1] = val; else b.pares.push([clave, val]);
};
const quitar = (d, sec, clave) => {
  const b = d.bloques.find((x) => x.seccion === sec);
  b.pares = b.pares.filter(([k]) => k !== clave);
};

const CASOS = [
  ["subrégimen inexistente", (d) => set(d, "DDT", "ISTA", "XX99"), "error"],
  ["subrégimen vacío",       (d) => quitar(d, "DDT", "ISTA"), "error"],
  ["campo prohibido para el subrégimen", (d) => set(d, "DDT", "DDDTDJV", "01/01/2026"), "error"],
    // Ojo: 999 es una aduana REAL («EXTERIOR - EXPORTAC.»). El primer intento de
  // esta prueba la usaba y "fallaba" cuando en realidad el validador acertaba.
  ["aduana inexistente",     (d) => set(d, "DDT", "CDDTBUR", "100"), "aviso"],
  ["incoterm inventado",     (d) => set(d, "DDT", "CDDTINCOTE", "ZZZ"), "aviso"],
  ["divisa inventada",       (d) => set(d, "DDT", "CDDTDEVFOB", "XXX"), "aviso"],
  ["país inexistente",       (d) => set(d, "ART", "CARTPAYORI", "9999"), "aviso"],
  ["unidad inexistente",     (d) => set(d, "ART", "CARTUNTDCL", "99"), "aviso"],
  ["NCM que no está en el nomenclador", (d) => set(d, "ART", "IESPNCE", "9999.99.99.999Z"), "error"],
  ["documento inexistente",  (d) => set(d, "DVD", "CDVDDOC", "NOEXISTEDOC"), "aviso"],
  ["declaración sin ítems",  (d) => { d.bloques = d.bloques.filter((b) => b.seccion !== "ART"); }, "error"],
  ["dos ítems con el mismo número", (d) => {
      const art = d.bloques.find((b) => b.seccion === "ART");
      d.bloques.push(JSON.parse(JSON.stringify(art)));
    }, "error"],

  // Secciones enteras. `GEN` marca si van con la misma escala O/P/F que los
  // campos: [BUL] es obligatoria en 214 de los 257 subregímenes y prohibida en
  // 42, así que quitarla o ponerla donde no va tiene que verse.
  ["sacar una sección que el subrégimen exige", (d) => {
      d.bloques = d.bloques.filter((b) => b.seccion !== "BUL");
    }, "aviso", (sub) => marcaDeSeccion(sub, "IBUL") === "O"],
  ["poner una sección que el subrégimen prohíbe", (d) => {
      d.bloques.push({ seccion: "TRC", pares: [["CTRCTIPDOC", "1"], ["CTRCNUMDOC", "1"]] });
    }, "error", (sub) => marcaDeSeccion(sub, "ITRC") === "P"],

  // El SIM tiene rechazo propio para el subítem sin sufijos (error 1029).
  ["subítem sin sufijos", (d) => {
      const sbt = d.bloques.find((b) => b.seccion === "SBT");
      sbt.pares = sbt.pares.filter(([k]) => k !== "CSBTSVL");
    }, "aviso"],
];

const antes = validar(base);
console.log(`base: ${antes.filter((h) => h.nivel === "error").length} error(es), ${antes.filter((h) => h.nivel === "aviso").length} aviso(s)\n`);

const SUB = (base.bloques.find((b) => b.seccion === "DDT")?.pares.find(([k]) => k === "ISTA") ?? [])[1];

let fallas = 0;
let corridos = 0;
for (const [nombre, romper, esperado, aplica] of CASOS) {
  if (aplica && !aplica(SUB)) {
    console.log(`  · ${nombre.padEnd(38)} no aplica a ${SUB}`);
    continue;
  }
  corridos++;
  const d = clonar();
  romper(d);
  const h = validar(d);
  // Lo nuevo respecto de la base: así un aviso preexistente no cuenta como detección.
  const firma = (x) => `${x.nivel}|${x.seccion}|${x.nart}|${x.clave}`;
  const previas = new Set(antes.map(firma));
  const nuevos = h.filter((x) => !previas.has(firma(x)));
  const detecto = nuevos.some((x) => x.nivel === esperado);
  console.log(`  ${detecto ? "✓" : "✗"} ${nombre.padEnd(38)} espera ${esperado}`);
  if (detecto) {
    const x = nuevos.find((y) => y.nivel === esperado);
    console.log(`      → ${x.seccion}/${x.nart} ${x.clave}: ${x.detalle}`);
  } else {
    fallas++;
    console.log(`      → NO LO DETECTÓ. nuevos: ${nuevos.map(firma).join(", ") || "(ninguno)"}`);
  }
}

console.log();
console.log(
  fallas === 0
    ? `TODAS DETECTADAS (${corridos}/${corridos}${corridos < CASOS.length ? `, ${CASOS.length - corridos} no aplican a ${SUB}` : ""})`
    : `${fallas} de ${corridos} sin detectar`,
);
process.exit(fallas === 0 ? 0 : 1);
