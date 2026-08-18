/**
 * Benchmark en lenguaje de importador real: ¿la partida esperada entra en el
 * paquete que arma el motor CON la expansión de Fase 0?
 *
 * Complementa a benchmark-motor-partidas.mjs, que mide el motor puro con texto
 * legal del nomenclador y nunca ejecuta la Fase 0.
 *
 * Usa las expansiones cacheadas para no repetir el gasto de IA:
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/cachear-expansiones.mjs
 *
 * Uso:
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/benchmark-lenguaje-usuario.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { resolverPartidasConExpansion } from "../src/lib/clasificador/motor";
import {
  nombreBaseProducto,
  textoParaFiltroParquet,
  textoParaSimsParquet,
} from "../src/lib/clasificador/estado-clasificacion";

const BATERIA = path.join(process.cwd(), "scripts/fixtures/muestras-lenguaje-usuario.json");
const CACHE = path.join(process.cwd(), "scripts/fixtures/expansiones-lenguaje-usuario.json");

const main = async () => {
  const bateria = JSON.parse(fs.readFileSync(BATERIA, "utf8"));
  if (!fs.existsSync(CACHE)) {
    console.error("Falta el caché de expansiones. Corré antes scripts/cachear-expansiones.mjs");
    process.exit(1);
  }
  const cache = JSON.parse(fs.readFileSync(CACHE, "utf8"));

  let ok = 0;
  const fallos = [];
  for (const m of bateria.muestras) {
    const args = {
      textoNombreBase: nombreBaseProducto(m.producto),
      textoFiltro: textoParaFiltroParquet(m.producto, []),
      textoSims: textoParaSimsParquet(m.producto, []),
    };
    const partidas = await resolverPartidasConExpansion(args, cache[m.producto] ?? []);
    if (partidas.includes(m.partida)) ok++;
    else fallos.push({ ...m, partidas });
  }

  const n = bateria.muestras.length;
  console.log(`Lenguaje de usuario: ${ok}/${n} (${((ok / n) * 100).toFixed(1)}%)`);
  if (fallos.length) {
    console.log("\nFallos:");
    for (const f of fallos) {
      console.log(`- ${f.producto} | esperada ${f.partida} | motor [${f.partidas.join(", ")}]`);
      console.log(`  ${f.porque}`);
    }
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
