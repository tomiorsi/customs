/**
 * Uso: npx tsx --require ./scripts/register-server-only-stub.cjs scripts/test-sims.mjs [texto]
 */
import { paquetePartidasParaIa } from "../src/lib/clasificador/motor";
import {
  nombreBaseProducto,
  textoParaFiltroParquet,
  textoParaSimsParquet,
} from "../src/lib/clasificador/estado-clasificacion";

const texto = process.argv[2]?.trim();
if (!texto) {
  console.error("Uso: test-sims.mjs <descripción del artículo> [maxPorPartida]");
  process.exit(1);
}
const maxPorPartida = Number(process.argv[3] ?? 8);

async function main() {
  const bloques = await paquetePartidasParaIa({
    textoNombreBase: nombreBaseProducto(texto),
    textoFiltro: textoParaFiltroParquet(texto, []),
    textoSims: textoParaSimsParquet(texto, []),
  });
  for (const b of bloques) {
    console.log(`\n${b.partida} (${b.sims.length} SIMs):`);
    for (const s of b.sims.slice(0, maxPorPartida)) {
      console.log(`  ${s.codigo} | ${s.ruta} > ${s.descripcion}`);
    }
    if (b.sims.length > maxPorPartida) console.log(`  ... +${b.sims.length - maxPorPartida} más`);
  }
}

main().catch(console.error);
