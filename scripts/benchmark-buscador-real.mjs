/**
 * Qué tan bien encuentra la partida el BUSCADOR MANUAL, con texto real.
 *
 * El benchmark que ya existe —`benchmark-motor-partidas.mjs`— mide 260 casos
 * escritos a mano y da 98,5%. Este mide otra cosa: las descripciones tal como
 * las escribió el despachante en 10.080 ítems del archivo del estudio, contra
 * la posición que efectivamente declaró. Esa es la prueba que importa para el
 * buscador de la carpeta, porque es el texto que de verdad se tipea.
 *
 * Corta por LARGO DE TEXTO a propósito. Una palabra y diez palabras son dos
 * problemas distintos: con una sola el puntaje por clave es binario y casi
 * todas las partidas empatan (ver CLAUDE.md, «el desempate del ranking»).
 * Un promedio único esconde eso.
 *
 * NO se usa para ajustar el motor contra estos casos: se usa para medir antes
 * y después de un cambio. Calibrar contra la muestra es exactamente lo que el
 * repo prohíbe.
 *
 * Uso: npx tsx --require ./scripts/register-server-only-stub.cjs \
 *        scripts/benchmark-buscador-real.mjs [--n 1200]
 */
import fs from "node:fs";
import { partidasCandidatas } from "../src/lib/clasificador/motor";
import { textoParaSimsParquet } from "../src/lib/clasificador/estado-clasificacion";

const N = Number(process.argv[process.argv.indexOf("--n") + 1]) || 1200;
const CSV = "data/Normas/SIM/sintia/desp_item.csv";

/** CSV con comillas: el mismo formato que el resto del archivo. */
function filas(texto) {
  const out = [];
  let campo = "", fila = [], dentro = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (dentro) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') dentro = false;
      else campo += c;
    } else if (c === '"') dentro = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n") { fila.push(campo); out.push(fila); fila = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo || fila.length) { fila.push(campo); out.push(fila); }
  return out;
}

const bruto = filas(fs.readFileSync(CSV, "utf8"));
const cab = bruto[0].map((c) => c.replace(/^﻿/, "").trim());
const iDesc = cab.indexOf("descripcion");
const iNcm = cab.indexOf("ncm");

const muestras = [];
for (const f of bruto.slice(1)) {
  // «sub1», «sub2»… es cómo el sistema viejo marcaba el subítem: no es parte
  // de lo que el despachante escribió y no debe entrar en la búsqueda.
  const desc = (f[iDesc] ?? "").replace(/\bsub\d+\b/gi, " ").replace(/\s+/g, " ").trim();
  const ncm = (f[iNcm] ?? "").replace(/\D/g, "");
  if (!desc || ncm.length < 8) continue;
  muestras.push({ desc, partida: ncm.slice(0, 4), palabras: desc.split(" ").length });
}

// Muestreo parejo por largo: sin esto el resultado lo domina el tramo más
// numeroso y no se ve dónde falla de verdad.
const porLargo = new Map();
for (const m of muestras) {
  const k = Math.min(m.palabras, 8);
  if (!porLargo.has(k)) porLargo.set(k, []);
  porLargo.get(k).push(m);
}
let semilla = 20260820;
const rnd = () => ((semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const elegidas = [];
const porTramo = Math.ceil(N / porLargo.size);
for (const [, lista] of porLargo) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  elegidas.push(...copia.slice(0, porTramo));
}

console.log(`Buscador manual contra texto real del archivo.`);
console.log(`${muestras.length} ítems con descripción y posición; se miden ${elegidas.length}.\n`);

const stats = new Map();
let hechas = 0;
for (const m of elegidas) {
  const cand = await partidasCandidatas(textoParaSimsParquet(m.desc, []), { limite: 20 });
  const rank = cand.findIndex((c) => c.partida === m.partida);
  const k = Math.min(m.palabras, 8);
  if (!stats.has(k)) stats.set(k, { n: 0, top1: 0, top5: 0, lista: 0 });
  const s = stats.get(k);
  s.n++;
  if (rank === 0) s.top1++;
  if (rank >= 0 && rank < 5) s.top5++;
  if (rank >= 0) s.lista++;
  if (++hechas % 100 === 0) process.stdout.write(`\r  ${hechas}/${elegidas.length}`);
}
process.stdout.write("\r");

const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) : "0.0").padStart(5);
console.log("  palabras      n   1º lugar   top 5   en lista(20)");
console.log("  " + "-".repeat(50));
let T = { n: 0, top1: 0, top5: 0, lista: 0 };
for (const k of [...stats.keys()].sort((a, b) => a - b)) {
  const s = stats.get(k);
  for (const c of ["n", "top1", "top5", "lista"]) T[c] += s[c];
  const et = k === 8 ? "8+" : String(k);
  console.log(`  ${et.padStart(8)} ${String(s.n).padStart(6)}    ${pct(s.top1, s.n)}%  ${pct(s.top5, s.n)}%    ${pct(s.lista, s.n)}%`);
}
console.log("  " + "-".repeat(50));
console.log(`  ${"TOTAL".padStart(8)} ${String(T.n).padStart(6)}    ${pct(T.top1, T.n)}%  ${pct(T.top5, T.n)}%    ${pct(T.lista, T.n)}%`);
