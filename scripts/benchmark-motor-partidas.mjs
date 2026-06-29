/**
 * Benchmark motor: ¿la partida esperada está en el top-5?
 *
 * Uso:
 *   python3 scripts/generar-muestras-motor.py
 *   python3 scripts/generar-muestras-motor.py --seed 20260628 --out scripts/fixtures/muestras-motor-40-lote2.json --excluir scripts/fixtures/muestras-motor-40.json
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/benchmark-motor-partidas.mjs
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/benchmark-motor-partidas.mjs --todos
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/benchmark-motor-partidas.mjs --verbose scripts/fixtures/muestras-motor-40-lote2.json
 */
import fs from "node:fs";
import path from "node:path";
import { partidasMotor, partidasCandidatas } from "../src/lib/clasificador/motor";
import {
  nombreBaseProducto,
  textoParaFiltroParquet,
  textoParaSimsParquet,
} from "../src/lib/clasificador/estado-clasificacion";

const FIXTURES_DIR = path.join(process.cwd(), "scripts/fixtures");
const DEFAULT = path.join(FIXTURES_DIR, "muestras-motor-40.json");
const verbose = process.argv.includes("--verbose");
const todos = process.argv.includes("--todos");

function fixturePaths() {
  const args = process.argv.filter((a) => !a.startsWith("--") && a.endsWith(".json"));
  if (args.length) return args.map((f) => path.resolve(f));
  if (todos) {
    return fs
      .readdirSync(FIXTURES_DIR)
      .filter((f) => f.startsWith("muestras-motor-") && f.endsWith(".json"))
      .sort()
      .map((f) => path.join(FIXTURES_DIR, f));
  }
  return [DEFAULT];
}

function argsMotor(producto) {
  return {
    textoNombreBase: nombreBaseProducto(producto),
    textoFiltro: textoParaFiltroParquet(producto, []),
    textoSims: textoParaSimsParquet(producto, []),
  };
}

async function evaluarMuestras(muestras, etiqueta) {
  let ok = 0;
  const fallos = [];

  for (const m of muestras) {
    const motorArgs = argsMotor(m.producto);
    const partidas = await partidasMotor(motorArgs);
    const hit = partidas.includes(m.partida);
    if (hit) ok++;
    else {
      const rank = (await partidasCandidatas(motorArgs.textoSims)).findIndex(
        (c) => c.partida === m.partida,
      );
      fallos.push({ ...m, partidas, rankLexico: rank });
    }
    if (verbose) {
      console.log(
        `[${etiqueta}] ${hit ? "OK" : "FALLO"} ${m.ncm} (${m.partida}) → [${partidas.join(", ")}]`,
      );
      console.log(`  ${m.producto.slice(0, 100)}${m.producto.length > 100 ? "…" : ""}`);
    }
  }
  return { ok, fallos, total: muestras.length };
}

async function main() {
  const paths = fixturePaths();
  if (!paths.length) {
    console.error("Sin fixtures. Generá muestras con scripts/generar-muestras-motor.py");
    process.exit(1);
  }

  let okGlobal = 0;
  let totalGlobal = 0;
  const fallosGlobal = [];

  for (const fixture of paths) {
    if (!fs.existsSync(fixture)) {
      console.error("No existe:", fixture);
      process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(fixture, "utf8"));
    const muestras = data.muestras ?? [];
    const etiqueta = path.basename(fixture);
    const { ok, fallos, total } = await evaluarMuestras(muestras, etiqueta);
    okGlobal += ok;
    totalGlobal += total;
    fallosGlobal.push(...fallos.map((f) => ({ ...f, fixture: etiqueta })));
    console.log(`${etiqueta}: ${ok}/${total}`);
  }

  console.log(
    `\nMotor partidas (total): ${okGlobal}/${totalGlobal} (${((okGlobal / totalGlobal) * 100).toFixed(1)}%)`,
  );

  if (fallosGlobal.length) {
    console.log("\nFallos:");
    for (const f of fallosGlobal) {
      console.log(
        `- [${f.fixture}] ${f.ncm} esperado ${f.partida} | motor [${f.partidas.join(", ")}] | rank léxico ${f.rankLexico}`,
      );
      console.log(`  ${f.producto.slice(0, 120)}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
