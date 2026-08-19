/**
 * El motor de partidas contra el archivo real del estudio.
 *
 * Los fixtures de `benchmark-motor-partidas.mjs` son 260 casos escritos con el
 * texto legal del propio nomenclador. Esto es lo contrario: **71.673 subítems
 * que el estudio declaró y la aduana aceptó**, con la descripción tal como la
 * escribió el proveedor —«SET DE VASOS X 6 PCS.», «TETERA DE VIDRIO CON FILTRO
 * 1.5 LTS»—, de una a siete palabras.
 *
 * Es la prueba que importa: el 98,5% de los fixtures mide si el motor encuentra
 * la partida cuando le dan el texto de la partida. Acá se mide si la encuentra
 * cuando le dan lenguaje comercial, que es lo que va a recibir siempre.
 *
 * **No llama a la IA.** `motor.ts` es retrieval sobre parquet, así que el corpus
 * entero se puede correr sin gastar un peso. Medir el clasificador completo
 * —con IA— es otra cosa y va aparte, sobre una muestra.
 *
 * Uso:
 *   npx tsx --require ./scripts/register-server-only-stub.cjs \
 *     scripts/benchmark-motor-corpus.mjs [--n 2000] [--seed 1] [--fallos 30]
 */
import fs from "node:fs";
import path from "node:path";
import { partidasMotor, partidasCandidatas } from "../src/lib/clasificador/motor";
import {
  nombreBaseProducto,
  textoParaFiltroParquet,
  textoParaSimsParquet,
} from "../src/lib/clasificador/estado-clasificacion";

const CORPUS = path.join(process.cwd(), "data/Normas/SIM/sintia/desp_subitems.csv");

const arg = (nombre, def) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : def;
};
const N = arg("n", 0); // 0 = todo
const SEMILLA = arg("seed", 1);
const MOSTRAR_FALLOS = arg("fallos", 25);

/* ── lectura del corpus ── */

function separar(linea) {
  const out = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (comillas) {
      if (c === '"') {
        if (linea[i + 1] === '"') { campo += '"'; i++; } else comillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') comillas = true;
    else if (c === ",") { out.push(campo); campo = ""; }
    else campo += c;
  }
  out.push(campo);
  return out;
}

function leerCorpus() {
  const lineas = fs.readFileSync(CORPUS, "utf8").split(/\r?\n/);
  const cols = separar(lineas[0].replace(/^﻿/, ""));
  const iNcm = cols.indexOf("ncm");
  const iDesc = cols.indexOf("descripcion");
  const casos = [];
  for (let i = 1; i < lineas.length; i++) {
    if (!lineas[i].trim()) continue;
    const c = separar(lineas[i]);
    const ncm = (c[iNcm] ?? "").trim();
    const producto = (c[iDesc] ?? "").trim();
    // La partida son los cuatro primeros dígitos: es lo que el motor devuelve.
    const partida = ncm.slice(0, 4);
    if (!producto || !/^\d{4}\./.test(ncm)) continue;
    casos.push({ producto, ncm, partida });
  }
  return casos;
}

/** Barajado determinístico: la misma semilla da la misma muestra. */
function muestrear(casos, n, semilla) {
  if (!n || n >= casos.length) return casos;
  let s = semilla >>> 0;
  const aleatorio = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const copia = casos.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, n);
}

/* ── evaluación ── */

const argsMotor = (producto) => ({
  textoNombreBase: nombreBaseProducto(producto),
  textoFiltro: textoParaFiltroParquet(producto, []),
  textoSims: textoParaSimsParquet(producto, []),
});

async function main() {
  const todos = leerCorpus();
  const casos = muestrear(todos, N, SEMILLA);
  console.log(
    `Corpus: ${todos.length.toLocaleString("es-AR")} subítems reales.` +
      (casos.length < todos.length
        ? ` Muestra de ${casos.length.toLocaleString("es-AR")} (semilla ${SEMILLA}).`
        : " Se corren todos."),
  );
  console.log("Métrica: ¿la partida declarada está entre las que devuelve el motor?\n");

  let top1 = 0;
  let enLista = 0;
  const fallos = [];
  const porLargo = new Map();
  const t0 = Date.now();

  for (let i = 0; i < casos.length; i++) {
    const m = casos[i];
    const args = argsMotor(m.producto);
    let partidas = [];
    try {
      partidas = await partidasMotor(args);
    } catch {
      // Un caso que rompe el motor cuenta como fallo, no corta la corrida.
    }
    if (partidas[0] === m.partida) top1++;
    const hit = partidas.includes(m.partida);
    if (hit) enLista++;
    else if (fallos.length < MOSTRAR_FALLOS * 4) fallos.push({ ...m, partidas });

    // Por cantidad de palabras: es donde CLAUDE.md dice que cambia el
    // comportamiento, y conviene verlo separado.
    const largo = Math.min(m.producto.split(/\s+/).length, 8);
    const acc = porLargo.get(largo) ?? { ok: 0, n: 0 };
    acc.n++;
    if (hit) acc.ok++;
    porLargo.set(largo, acc);

    if ((i + 1) % 500 === 0 || i + 1 === casos.length) {
      const seg = (Date.now() - t0) / 1000;
      const pct = ((enLista / (i + 1)) * 100).toFixed(1);
      process.stdout.write(
        `\r  ${i + 1}/${casos.length}  en lista ${pct}%  top-1 ${((top1 / (i + 1)) * 100).toFixed(1)}%  ${seg.toFixed(0)}s`,
      );
    }
  }
  console.log("\n");

  const pct = (x) => ((x / casos.length) * 100).toFixed(2);
  console.log(`  partida declarada en la lista: ${enLista.toLocaleString("es-AR")} / ${casos.length.toLocaleString("es-AR")}  (${pct(enLista)}%)`);
  console.log(`  y además en primer lugar:      ${top1.toLocaleString("es-AR")}  (${pct(top1)}%)`);

  console.log("\n  Por largo de la descripción:");
  for (const largo of [...porLargo.keys()].sort((a, b) => a - b)) {
    const { ok, n } = porLargo.get(largo);
    const barra = "█".repeat(Math.round((ok / n) * 28));
    console.log(
      `    ${largo}${largo === 8 ? "+" : " "} palabra${largo === 1 ? " " : "s"}  ${String(n).padStart(6)} casos  ${((ok / n) * 100).toFixed(1).padStart(5)}%  ${barra}`,
    );
  }

  if (fallos.length) {
    console.log(`\n  Primeros fallos (de ${(casos.length - enLista).toLocaleString("es-AR")}):`);
    for (const f of fallos.slice(0, MOSTRAR_FALLOS)) {
      console.log(`    ${f.partida}  «${f.producto.slice(0, 46)}»`);
      console.log(`          devolvió: ${f.partidas.slice(0, 6).join(", ") || "(nada)"}`);
    }
  }

  console.log(
    `\n  ${((Date.now() - t0) / 1000).toFixed(0)}s. Sin costo de IA: el motor es retrieval sobre parquet.`,
  );
}

await main();
