/**
 * Prueba el armado del string de sufijos contra el corpus real.
 *
 * El formato de `CSBTSVL` no está documentado en ningún lado: se dedujo
 * midiendo los subítems que el estudio ya declaró y la aduana aceptó. Así que
 * la prueba tiene que ser contra ese mismo corpus, y no contra unos pocos
 * casos elegidos a mano.
 *
 * La prueba fuerte es la ida y vuelta: cada string real se parsea y se vuelve
 * a armar, y tiene que salir **idéntico**. Si el parser se come un sufijo o el
 * armador cambia el orden, la comparación lo caza.
 *
 * Uso: npx tsx --require ./scripts/register-server-only-stub.cjs \
 *        scripts/presim-pruebas-sufijos.mjs
 */
import fs from "node:fs";
import path from "node:path";

import { armarSufijos, parsearSufijos, sufijosDePosicion } from "../src/lib/presim/sufijos.ts";

const CORPUS = path.join(
  process.cwd(),
  "data/Normas/SIM/sintia/desp_subitems.csv",
);

/* ── lectura del corpus ── */

function* filas(archivo) {
  const texto = fs.readFileSync(archivo, "utf8");
  const lineas = texto.split(/\r?\n/);
  const cab = separar(lineas[0].replace(/^﻿/, ""));
  for (let i = 1; i < lineas.length; i++) {
    if (!lineas[i].trim()) continue;
    const c = separar(lineas[i]);
    const o = {};
    cab.forEach((h, j) => (o[h] = c[j] ?? ""));
    yield o;
  }
}

function separar(linea) {
  const out = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (comillas) {
      if (c === '"') {
        if (linea[i + 1] === '"') {
          campo += '"';
          i++;
        } else comillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') comillas = true;
    else if (c === ",") {
      out.push(campo);
      campo = "";
    } else campo += c;
  }
  out.push(campo);
  return out;
}

/* ── 1. ida y vuelta sobre todo el corpus ── */

console.log("1. Ida y vuelta sobre los subítems reales\n");

let total = 0;
let iguales = 0;
const distintos = [];

for (const f of filas(CORPUS)) {
  const s = (f.SUFIJOS ?? "").trim();
  if (!s) continue;
  total++;
  const rearmado = armarSufijos(parsearSufijos(s));
  if (rearmado === s) iguales++;
  else if (distintos.length < 5) distintos.push({ original: s, rearmado });
}

const pct = ((iguales / total) * 100).toFixed(2);
console.log(`   subítems con sufijos: ${total.toLocaleString("es-AR")}`);
console.log(`   reconstruidos idénticos: ${iguales.toLocaleString("es-AR")} (${pct}%)`);
for (const d of distintos) {
  console.log(`   ✗ original  ${d.original}`);
  console.log(`     rearmado  ${d.rearmado}`);
}

/* ── 2. las reglas medidas, uná por una ── */

console.log("\n2. Las tres reglas del formato\n");

let fallas = total - iguales;
const chequear = (nombre, ok, detalle = "") => {
  if (!ok) fallas++;
  console.log(`   ${ok ? "✓" : "✗"} ${nombre.padEnd(52)} ${detalle}`);
};

const cierra = armarSufijos([{ clave: "AA", texto: "S/M" }]);
chequear("cierra con guion", cierra.endsWith("-"), cierra);

const desordenado = armarSufijos([
  { clave: "NA", codigo: "01" },
  { clave: "AA", texto: "S/M" },
  { clave: "CA", codigo: "03" },
]);
chequear("ordena alfabético", desordenado === "AA(S/M)-CA03-NA01-", desordenado);

const conTexto = armarSufijos([{ clave: "AJ", texto: "TAMBOR X 190 KG" }]);
chequear("el texto va entre paréntesis", conTexto === "AJ(TAMBOR X 190 KG)-", conTexto);

const repetida = armarSufijos([
  { clave: "AA", texto: "vieja" },
  { clave: "AA", texto: "nueva" },
]);
chequear("clave repetida: gana la última", repetida === "AA(nueva)-", repetida);

chequear("string vacío no inventa nada", armarSufijos([]) === "", "«»");
chequear("clave inválida se descarta", armarSufijos([{ clave: "xx", texto: "a" }]) === "", "«»");
chequear(
  "texto con paréntesis adentro sobrevive",
  parsearSufijos("AJ(CAJA (X6))-")[0]?.texto === "CAJA (X6)",
  parsearSufijos("AJ(CAJA (X6))-")[0]?.texto ?? "—",
);

/* ── 3. el catálogo, y hasta dónde llega ── */

console.log("\n3. Catálogo de sufijos por posición\n");

const conCatalogo = sufijosDePosicion("7213.10.00.000");
chequear(
  "una posición conocida devuelve sus sufijos",
  conCatalogo.length > 0,
  `${conCatalogo.length} sufijos`,
);

const tipos = new Set(conCatalogo.map((c) => c.tipo));
chequear(
  "distingue texto de código",
  [...tipos].every((t) => t === "texto" || t === "codigo"),
  [...tipos].join(", ") || "—",
);

const codificado = conCatalogo.find((c) => c.tipo === "codigo");
chequear(
  "los codificados traen sus valores admitidos",
  !codificado || codificado.valores.length > 0,
  codificado ? `${codificado.clave}: ${codificado.valores.length} valores` : "sin codificados acá",
);

chequear(
  "una posición inventada no explota",
  Array.isArray(sufijosDePosicion("9999.99.99.999")),
  "devuelve lista vacía",
);

/* ── 4. cobertura real del catálogo local ── */

console.log("\n4. Cuánto cubre la tabla local (esto NO es una falla)\n");

let conNcm = 0;
let conDefinicion = 0;
for (const f of filas(CORPUS)) {
  const ncm = (f.ncm ?? "").trim();
  if (!ncm || !(f.SUFIJOS ?? "").trim()) continue;
  conNcm++;
  if (sufijosDePosicion(ncm).length) conDefinicion++;
}
const cob = ((conDefinicion / conNcm) * 100).toFixed(1);
console.log(`   subítems cuya posición está en cod_SUFIDOS: ${conDefinicion.toLocaleString("es-AR")} de ${conNcm.toLocaleString("es-AR")} (${cob}%)`);
console.log("   El resto no está en la base local: el Kit lo baja del SIM.");
console.log("   Por eso `sufijosDePosicion` vacío significa «no sé», no «no lleva».");

console.log(`\n${fallas === 0 ? "Todo en orden." : `${fallas} fallas.`}`);
process.exit(fallas === 0 ? 0 : 1);
