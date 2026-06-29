/**
 * Verifica paquete IA (5 partidas + SIMs completas) y utilidades de partidas.
 *
 * Uso:
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/probar-filtro-sims.mjs
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/probar-filtro-sims.mjs "descripción del artículo"
 */
import { paquetePartidasParaIa, palabrasClaveHechos } from "../src/lib/clasificador/motor";
import {
  nombreBaseProducto,
  textoParaFiltroParquet,
  textoParaSimsParquet,
} from "../src/lib/clasificador/estado-clasificacion";

let fallos = 0;

function ok(cond, msg) {
  if (cond) console.log("OK:", msg);
  else {
    console.log("FALLO:", msg);
    fallos++;
  }
}

async function main() {
  ok(!palabrasClaveHechos("articulo para exportacion").includes("para"), "stopword para excluida");

  const producto = process.argv[2]?.trim();
  if (!producto) {
    console.log("SKIP: paquete IA (pasá descripción como argv[2] para probar retrieval)");
  } else {
    const bloques = await paquetePartidasParaIa({
      textoNombreBase: nombreBaseProducto(producto),
      textoFiltro: textoParaFiltroParquet(producto, []),
      textoSims: textoParaSimsParquet(producto, []),
    });
    ok(bloques.length >= 1 && bloques.length <= 5, "paquete IA entrega entre 1 y 5 partidas");
    ok(
      bloques.every((b) => b.sims.length > 0),
      "cada partida del paquete incluye al menos una SIM",
    );
  }

  console.log(fallos ? `\n${fallos} fallo(s)` : "\nTodos OK");
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
