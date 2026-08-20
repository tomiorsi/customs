/**
 * Índice palabra → partida, aprendido del archivo del estudio.
 *
 * La idea es la de cualquier índice alfabético del arancel: que la palabra que
 * alguien escribe esté ligada a una partida. Lo que cambia es de dónde sale el
 * enlace. Acá sale del trabajo del propio estudio: cada ítem despachado tiene
 * la descripción que escribió el despachante y la posición que efectivamente
 * declaró. «Arrabio» quedó ligado a 7201 porque así se despachó, no porque
 * alguien escribiera esa equivalencia a mano.
 *
 * Eso resuelve lo que el buscador no puede: «arrabio» no figura en el
 * nomenclador —dice «fundición en bruto»— y por eso hoy no devuelve nada.
 * Ningún ranking arregla una palabra que no está en el texto.
 *
 * ── Cómo se evita calibrar contra la muestra ──
 *
 * El índice se arma con la MITAD del archivo y se mide contra la otra mitad,
 * que nunca se usó para armarlo. Si el número sube ahí, subió de verdad; si
 * sube solo donde aprendió, es memoria y no sirve. El corte es por hash del
 * texto, así que es el mismo en cada corrida y no depende del orden.
 *
 * Y la regla es general, no una lista escrita contra los casos que fallaban:
 * «toda palabra que este estudio usó queda ligada a las partidas que declaró
 * con ella». Una palabra nueva no entra al índice y cae en el buscador de
 * siempre.
 *
 * Uso: npx tsx --require ./scripts/register-server-only-stub.cjs \
 *        scripts/lexico-archivo.mjs [--n 400] [--escribir]
 */
import fs from "node:fs";
import { partidasCandidatas } from "../src/lib/clasificador/motor";
import { textoParaSimsParquet } from "../src/lib/clasificador/estado-clasificacion";

const N = Number(process.argv[process.argv.indexOf("--n") + 1]) || 400;
const ESCRIBIR = process.argv.includes("--escribir");
const CSV = "data/Normas/SIM/sintia/desp_item.csv";
const SALIDA = "data/Nomenclatura/lexico-archivo.json";

/**
 * Cuántas partidas distintas puede tocar una palabra para seguir sirviendo.
 *
 * No es una lista de palabras vacías escrita a mano: es el mismo criterio que
 * usa el motor —una clave que aparece en todos lados no distingue nada—, pero
 * medido sobre el archivo. «DE» o «ACERO» quedan afuera solas.
 */
const MAX_PARTIDAS_POR_PALABRA = 12;
/** Con una sola aparición no hay señal: puede ser un error de tipeo. */
const MIN_APARICIONES = 2;

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

/** Palabras de una descripción, normalizadas igual que el resto del sistema. */
function palabras(texto) {
  return [
    ...new Set(
      texto
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, " ")
        .split(" ")
        .filter((p) => p.length >= 3 && !/^\d+$/.test(p)),
    ),
  ];
}

/** Corte estable en dos mitades: el mismo texto cae siempre del mismo lado. */
function mitad(texto) {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) & 0x7fffffff;
  return h % 2;
}

const bruto = filas(fs.readFileSync(CSV, "utf8"));
const cab = bruto[0].map((c) => c.replace(/^﻿/, "").trim());
const iDesc = cab.indexOf("descripcion");
const iNcm = cab.indexOf("ncm");

const aprender = [], probar = [];
for (const f of bruto.slice(1)) {
  const desc = (f[iDesc] ?? "").replace(/\bsub\d+\b/gi, " ").replace(/\s+/g, " ").trim();
  const ncm = (f[iNcm] ?? "").replace(/\D/g, "");
  if (!desc || ncm.length < 8) continue;
  const m = { desc, partida: ncm.slice(0, 4), pal: desc.split(" ").length };
  (mitad(desc) === 0 ? aprender : probar).push(m);
}

// ── El índice, solo con la mitad de aprender ──
const cuenta = new Map();
for (const m of aprender) {
  for (const p of palabras(m.desc)) {
    if (!cuenta.has(p)) cuenta.set(p, new Map());
    const c = cuenta.get(p);
    c.set(m.partida, (c.get(m.partida) ?? 0) + 1);
  }
}
const lexico = new Map();
for (const [palabra, porPartida] of cuenta) {
  if (porPartida.size > MAX_PARTIDAS_POR_PALABRA) continue;
  const total = [...porPartida.values()].reduce((a, b) => a + b, 0);
  if (total < MIN_APARICIONES) continue;
  lexico.set(
    palabra,
    [...porPartida.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([partida, veces]) => ({ partida, peso: veces / total })),
  );
}

console.log(`Archivo: ${aprender.length} ítems para aprender · ${probar.length} para medir.`);
console.log(`Índice: ${lexico.size} palabras ligadas a partidas.\n`);

/** Partidas que sugiere el índice para un texto, ordenadas por peso. */
function sugerencias(texto) {
  const votos = new Map();
  for (const p of palabras(texto)) {
    for (const { partida, peso } of lexico.get(p) ?? []) {
      votos.set(partida, (votos.get(partida) ?? 0) + peso);
    }
  }
  return [...votos.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

// ── Medición contra la mitad que el índice NO vio ──
let semilla = 20260820;
const rnd = () => ((semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const porLargo = new Map();
for (const m of probar) {
  const k = Math.min(m.pal, 8);
  if (!porLargo.has(k)) porLargo.set(k, []);
  porLargo.get(k).push(m);
}
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

const stats = new Map();
let hechas = 0;
for (const m of elegidas) {
  const base = (await partidasCandidatas(textoParaSimsParquet(m.desc, []), { limite: 20 })).map(
    (c) => c.partida,
  );
  // El índice va ADELANTE y el buscador de siempre atrás, sin perder nada:
  // lo que el índice no sabe lo sigue resolviendo el texto del nomenclador.
  const conIndice = [...new Set([...sugerencias(m.desc), ...base])].slice(0, 20);

  const k = Math.min(m.pal, 8);
  if (!stats.has(k)) stats.set(k, { n: 0, b1: 0, b5: 0, bl: 0, i1: 0, i5: 0, il: 0 });
  const s = stats.get(k);
  s.n++;
  const rb = base.indexOf(m.partida), ri = conIndice.indexOf(m.partida);
  if (rb === 0) s.b1++; if (rb >= 0 && rb < 5) s.b5++; if (rb >= 0) s.bl++;
  if (ri === 0) s.i1++; if (ri >= 0 && ri < 5) s.i5++; if (ri >= 0) s.il++;
  if (++hechas % 100 === 0) process.stdout.write(`\r  ${hechas}/${elegidas.length}`);
}
process.stdout.write("\r");

const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) : "0.0").padStart(5);
console.log("                 SIN índice            CON índice");
console.log("  palabras   n    1º   top5  lista     1º   top5  lista");
console.log("  " + "-".repeat(56));
const T = { n: 0, b1: 0, b5: 0, bl: 0, i1: 0, i5: 0, il: 0 };
for (const k of [...stats.keys()].sort((a, b) => a - b)) {
  const s = stats.get(k);
  for (const c of Object.keys(T)) T[c] += s[c];
  const et = k === 8 ? "8+" : String(k);
  console.log(
    `  ${et.padStart(8)} ${String(s.n).padStart(3)}  ${pct(s.b1, s.n)}%${pct(s.b5, s.n)}%${pct(s.bl, s.n)}%   ${pct(s.i1, s.n)}%${pct(s.i5, s.n)}%${pct(s.il, s.n)}%`,
  );
}
console.log("  " + "-".repeat(56));
console.log(
  `  ${"TOTAL".padStart(8)} ${String(T.n).padStart(3)}  ${pct(T.b1, T.n)}%${pct(T.b5, T.n)}%${pct(T.bl, T.n)}%   ${pct(T.i1, T.n)}%${pct(T.i5, T.n)}%${pct(T.il, T.n)}%`,
);

if (ESCRIBIR) {
  // Para escribir el índice de verdad se usa TODO el archivo: la partición en
  // mitades existe para medir honestamente, no para desperdiciar la mitad.
  const cuentaTodo = new Map();
  for (const m of [...aprender, ...probar]) {
    for (const p of palabras(m.desc)) {
      if (!cuentaTodo.has(p)) cuentaTodo.set(p, new Map());
      const c = cuentaTodo.get(p);
      c.set(m.partida, (c.get(m.partida) ?? 0) + 1);
    }
  }
  const salida = {};
  for (const [palabra, porPartida] of cuentaTodo) {
    if (porPartida.size > MAX_PARTIDAS_POR_PALABRA) continue;
    const total = [...porPartida.values()].reduce((a, b) => a + b, 0);
    if (total < MIN_APARICIONES) continue;
    // Se guarda también CUÁNTAS veces se despachó así. No para pesar el
    // ranking —probado: pesar por confianza no mejora, hasta baja un poco—
    // sino para poder decirlo. Una palabra vista dos veces acierta el 41,8%
    // cuando es la única que decide, y una vista diez o más el 68,2%: son dos
    // cosas distintas y hoy se presentaban iguales, con peso 1,0 las dos.
    salida[palabra] = [...porPartida.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([partida, veces]) => [partida, Number((veces / total).toFixed(3)), veces]);
  }
  fs.writeFileSync(SALIDA, JSON.stringify(salida));
  console.log(`\nÍndice escrito en ${SALIDA}: ${Object.keys(salida).length} palabras.`);
}
