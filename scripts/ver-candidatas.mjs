/**
 * Uso: npx tsx --require ./scripts/register-server-only-stub.cjs scripts/ver-candidatas.mjs <partida> <texto> [max]
 */
import {
  descripcionPartida,
  paquetePartidasParaIa,
} from "../src/lib/clasificador/motor";
import {
  nombreBaseProducto,
  textoParaFiltroParquet,
  textoParaSimsParquet,
} from "../src/lib/clasificador/estado-clasificacion";

const p4 = process.argv[2]?.replace(/\D/g, "").slice(0, 4);
const texto = process.argv[3]?.trim();
const max = Number(process.argv[4] ?? 15);

if (!p4 || !texto) {
  console.error("Uso: ver-candidatas.mjs <partida> <texto> [max]");
  process.exit(1);
}

async function main() {
  const bloques = await paquetePartidasParaIa({
    textoNombreBase: nombreBaseProducto(texto),
    textoFiltro: textoParaFiltroParquet(texto, []),
    textoSims: textoParaSimsParquet(texto, []),
  });
  const bloque = bloques.find((b) => b.partida === p4);
  const partidaDesc = bloque?.partidaDesc ?? (await descripcionPartida(p4)) ?? "";
  const sims = (bloque?.sims ?? []).slice(0, max);
  console.log(`Partida ${p4}: ${partidaDesc.slice(0, 80)}`);
  console.log(`Partidas en paquete: ${bloques.map((b) => b.partida).join(", ")}`);
  console.log(`SIMs (${sims.length} de ${bloque?.sims.length ?? 0}):`);
  sims.forEach((f) => console.log(f.codigo, f.descripcion));
}

main().catch(console.error);
