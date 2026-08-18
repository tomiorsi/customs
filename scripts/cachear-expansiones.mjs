/**
 * Cachea la expansión de Fase 0 de una batería, para poder probar variantes de
 * fusión del retrieval sin volver a pagar la llamada a la IA.
 *
 * Uso:
 *   set -a; . ./.env; set +a
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/cachear-expansiones.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { expandirConsultaLegal } from "../src/lib/clasificador/ia";

const ENTRADA = path.join(process.cwd(), "scripts/fixtures/muestras-lenguaje-usuario.json");
const SALIDA = path.join(process.cwd(), "scripts/fixtures/expansiones-lenguaje-usuario.json");

const main = async () => {
  const bateria = JSON.parse(fs.readFileSync(ENTRADA, "utf8"));
  const previo = fs.existsSync(SALIDA) ? JSON.parse(fs.readFileSync(SALIDA, "utf8")) : {};
  const cache = { ...previo };

  let nuevas = 0;
  for (const m of bateria.muestras) {
    if (cache[m.producto]) continue;
    // De a una: la concurrencia con IA dispara la latencia y ensucia la medición.
    cache[m.producto] = await expandirConsultaLegal(m.producto);
    nuevas++;
    console.log(`${m.producto.padEnd(28)} → ${cache[m.producto].join(" · ")}`);
  }

  fs.writeFileSync(SALIDA, JSON.stringify(cache, null, 2) + "\n");
  console.log(`\nExpansiones nuevas: ${nuevas} | total en caché: ${Object.keys(cache).length}`);
  console.log(`Guardado en ${path.relative(process.cwd(), SALIDA)}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
