/**
 * Diagnóstico: ¿el material desplaza al artículo en el ranking de partidas?
 *
 * Compara «<artículo>» solo contra «<artículo> de <material>» y mide si la
 * partida correcta entra en el top-5 en cada caso. Además cuantifica sobre los
 * fixtures reales cuántas muestras disparan la pregunta de material.
 *
 * Uso:
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/diag-articulo-vs-material.mjs
 */
import fs from "node:fs";
import path from "node:path";
import {
  paquetePartidasParaIa,
  partidasMotor,
  hayCompetenciaMaterialEntreBloques,
  materiaDeclaradaEnHechos,
} from "../src/lib/clasificador/motor";
import {
  nombreBaseProducto,
  textoParaFiltroParquet,
  textoParaSimsParquet,
  bloqueHechos,
} from "../src/lib/clasificador/estado-clasificacion";

function argsMotor(producto) {
  return {
    textoNombreBase: nombreBaseProducto(producto),
    textoFiltro: textoParaFiltroParquet(producto, []),
    textoSims: textoParaSimsParquet(producto, []),
  };
}

// [artículo solo, artículo + material, partida correcta]
const PARES = [
  ["zapatillas", "zapatillas de tela", "6404"],
  ["remera", "remera de tela", "6109"],
  ["mesa", "mesa de mdf", "9403"],
  ["taza", "taza de cerámica", "6912"],
  ["guantes", "guantes de látex", "4015"],
  ["cortina", "cortina de tela", "6303"],
  ["silla", "silla de plástico", "9401"],
  ["mochila", "mochila de nylon", "4202"],
  ["botella", "botella de vidrio", "7010"],
  ["cuchara", "cuchara de acero", "8215"],
];

const main = async () => {
  console.log("═".repeat(92));
  console.log("PASO 3 — ¿El material desplaza al artículo?");
  console.log("═".repeat(92));
  console.log(`${"consulta".padEnd(26)} ${"top-5".padEnd(30)} correcta?`);
  console.log("─".repeat(92));

  let soloOk = 0;
  let conMaterialOk = 0;
  for (const [solo, conMaterial, esperada] of PARES) {
    const a = await partidasMotor(argsMotor(solo));
    const b = await partidasMotor(argsMotor(conMaterial));
    const okA = a.includes(esperada);
    const okB = b.includes(esperada);
    if (okA) soloOk++;
    if (okB) conMaterialOk++;
    console.log(`${solo.padEnd(26)} ${a.join(" ").padEnd(30)} ${okA ? "✓" : "✗"}  (esperada ${esperada})`);
    console.log(
      `${("  + material →").padEnd(26)} ${b.join(" ").padEnd(30)} ${okB ? "✓" : "✗"} ${okA && !okB ? "  ← LA PERDIÓ" : ""}`,
    );
    console.log();
  }
  console.log(`Artículo solo:        ${soloOk}/${PARES.length} traen la partida correcta`);
  console.log(`Artículo + material:  ${conMaterialOk}/${PARES.length}`);

  // ── Magnitud sobre los fixtures reales ────────────────────────────────────
  console.log();
  console.log("═".repeat(92));
  console.log("PASO 4 — Sobre los 260 fixtures: ¿cuántos disparan la pregunta de material?");
  console.log("═".repeat(92));

  const dir = path.join(process.cwd(), "scripts/fixtures");
  const archivos = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("muestras-motor-") && f.endsWith(".json"));

  let total = 0;
  let preguntan = 0;
  let preguntanYaCorrecta = 0;
  let preguntanSinCorrecta = 0;
  const ejemplos = [];

  for (const f of archivos) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const muestras = Array.isArray(raw) ? raw : (raw.muestras ?? []);
    for (const m of muestras) {
      total++;
      const bloques = await paquetePartidasParaIa(argsMotor(m.producto));
      const hechos = bloqueHechos(m.producto, []);
      const dispara =
        hayCompetenciaMaterialEntreBloques(bloques) && !materiaDeclaradaEnHechos(hechos);
      if (!dispara) continue;
      preguntan++;
      const partidas = bloques.map((b) => b.partida);
      if (partidas.includes(m.partida)) preguntanYaCorrecta++;
      else {
        preguntanSinCorrecta++;
        if (ejemplos.length < 12) ejemplos.push({ p: m.producto, esperada: m.partida, partidas });
      }
    }
  }

  console.log(`Muestras totales:                       ${total}`);
  console.log(`Disparan la pregunta de material:       ${preguntan}  (${((preguntan / total) * 100).toFixed(1)}%)`);
  console.log(`  · con la partida correcta ya en top-5: ${preguntanYaCorrecta}  ← pregunta innecesaria`);
  console.log(`  · sin la partida correcta en top-5:    ${preguntanSinCorrecta}  ← la pregunta no la puede rescatar`);
  if (ejemplos.length) {
    console.log("\nEjemplos donde pregunta y la correcta no está:");
    for (const e of ejemplos) {
      console.log(`  ${e.p.slice(0, 46).padEnd(48)} esperada ${e.esperada}  top5 [${e.partidas.join(" ")}]`);
    }
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
