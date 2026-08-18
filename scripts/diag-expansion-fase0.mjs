/**
 * ¿La Fase 0 (expansión legal con IA) rescata el retrieval, y si no, por qué?
 *
 * Compara tres paquetes: sin expansión, con expansión (como corre hoy: los
 * términos se CONCATENAN al texto original) y solo con los términos expandidos.
 * Aísla si el ruido del texto original sigue dominando el ranking.
 *
 * Uso:
 *   set -a; . ./.env; set +a
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/diag-expansion-fase0.mjs
 */
import { expandirConsultaLegal } from "../src/lib/clasificador/ia";
import {
  resolverPartidasPaquete,
  resolverPartidasConExpansion,
} from "../src/lib/clasificador/motor";
import {
  nombreBaseProducto,
  textoParaFiltroParquet,
  textoParaSimsParquet,
} from "../src/lib/clasificador/estado-clasificacion";

const argsMotor = (producto) => ({
  textoNombreBase: nombreBaseProducto(producto),
  textoFiltro: textoParaFiltroParquet(producto, []),
  textoSims: textoParaSimsParquet(producto, []),
});

const CASOS = [
  ["zapatillas de tela", "6404"],
  ["remera de algodón", "6109"],
  ["notebook", "8471"],
  ["heladera con freezer", "8418"],
  ["taza de cerámica", "6912"],
];

const main = async () => {
  console.log(`IA disponible: ${Boolean(process.env.ANTHROPIC_API_KEY)}\n`);
  let rescatadosConExp = 0;
  let rescatadosSoloExp = 0;

  for (const [producto, esperada] of CASOS) {
    const args = argsMotor(producto);
    const terminos = await expandirConsultaLegal(producto);

    const base = await resolverPartidasPaquete(args);
    const conExp = await resolverPartidasConExpansion(args, terminos);
    const soloExp = terminos.length
      ? await resolverPartidasPaquete({
          textoNombreBase: terminos.join(" "),
          textoFiltro: terminos.join(" "),
          textoSims: terminos.join(" "),
        })
      : [];

    if (conExp.includes(esperada)) rescatadosConExp++;
    if (soloExp.includes(esperada)) rescatadosSoloExp++;

    const m = (arr) => (arr.includes(esperada) ? "✓" : "✗");
    console.log(`▸ "${producto}"   esperada ${esperada}`);
    console.log(`   expansión IA  : ${terminos.join(" · ") || "(vacía)"}`);
    console.log(`   base          : ${m(base)} [${base.join(" ")}]`);
    console.log(`   con expansión : ${m(conExp)} [${conExp.join(" ")}]`);
    console.log(`   solo expandido: ${m(soloExp)} [${soloExp.join(" ")}]`);
    console.log();
  }

  console.log("─".repeat(60));
  console.log(`Aciertos con expansión (como corre hoy): ${rescatadosConExp}/${CASOS.length}`);
  console.log(`Aciertos solo con los términos legales : ${rescatadosSoloExp}/${CASOS.length}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
