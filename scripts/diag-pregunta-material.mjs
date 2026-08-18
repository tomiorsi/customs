/**
 * Diagnóstico de la pregunta «¿De qué material está hecho el artículo?».
 *
 * Reproduce, sin IA, las dos condiciones que la disparan en index.ts:
 *   hayCompetenciaMaterialEntreBloques(bloques) && !materiaDeclaradaEnHechos(hechos)
 * y mide qué pasa con el paquete de partidas al responderla.
 *
 * Uso:
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/diag-pregunta-material.mjs
 */
import {
  paquetePartidasParaIa,
  hayCompetenciaMaterialEntreBloques,
  materiaDeclaradaEnHechos,
} from "../src/lib/clasificador/motor";
import {
  nombreBaseProducto,
  textoParaFiltroParquet,
  textoParaSimsParquet,
  bloqueHechos,
} from "../src/lib/clasificador/estado-clasificacion";

const OPCIONES = ["Caucho", "Plástico", "Metal", "Textil", "Otro / no sé"];
const PREGUNTA = "¿De qué material está hecho el artículo?";

function argsMotor(producto, respuestas = []) {
  return {
    textoNombreBase: nombreBaseProducto(producto),
    textoFiltro: textoParaFiltroParquet(producto, respuestas),
    textoSims: textoParaSimsParquet(producto, respuestas),
  };
}

async function estado(producto, respuestas = []) {
  const bloques = await paquetePartidasParaIa(argsMotor(producto, respuestas));
  const hechos = bloqueHechos(producto, respuestas);
  return {
    bloques,
    partidas: bloques.map((b) => b.partida),
    caps: [...new Set(bloques.map((b) => b.partida.slice(0, 2)))],
    compite: hayCompetenciaMaterialEntreBloques(bloques),
    declara: materiaDeclaradaEnHechos(hechos),
    pregunta: hayCompetenciaMaterialEntreBloques(bloques) && !materiaDeclaradaEnHechos(hechos),
  };
}

const CASOS = [
  // [producto, partida correcta esperada]
  ["zapatillas de tela", "6404"],
  ["zapatillas de lona", "6404"],
  ["zapatillas de cuero", "6403"],
  ["remera de tela", "6109"],
  ["campera de gamuza", "4203"],
  ["mesa de mdf", "9403"],
  ["bolso de tela", "4202"],
  ["silla de plástico", "9401"],
  ["manguera de caucho", "4009"],
  ["cable de cobre", "8544"],
  ["vaso de vidrio", "7013"],
  ["caja de cartón", "4819"],
  ["tornillo de acero", "7318"],
  ["cortina de tela", "6303"],
  ["guantes de látex", "4015"],
  ["mochila de nylon", "4202"],
  ["pelota de fútbol", "9506"],
  ["cepillo de dientes", "9603"],
  ["taza de cerámica", "6912"],
  ["alfombra de tela", "5703"],
];

const main = async () => {
  console.log("═".repeat(96));
  console.log("PASO 1 — ¿Cuándo se dispara la pregunta de material?");
  console.log("═".repeat(96));
  console.log(
    `${"producto".padEnd(24)} ${"caps".padEnd(22)} ${"compite".padEnd(8)} ${"declara".padEnd(8)} pregunta?`,
  );
  console.log("─".repeat(96));

  const preguntados = [];
  for (const [producto, esperada] of CASOS) {
    const e = await estado(producto);
    if (e.pregunta) preguntados.push([producto, esperada, e]);
    console.log(
      `${producto.padEnd(24)} ${e.caps.join(",").padEnd(22)} ${String(e.compite).padEnd(8)} ${String(e.declara).padEnd(8)} ${e.pregunta ? "SÍ  ←" : "no"}`,
    );
  }

  console.log();
  console.log("═".repeat(96));
  console.log("PASO 2 — En los casos que preguntan: ¿cada opción a dónde lleva?");
  console.log("═".repeat(96));

  for (const [producto, esperada, base] of preguntados) {
    console.log(`\n▸ "${producto}"   (partida correcta: ${esperada})`);
    console.log(`  sin responder      → [${base.partidas.join(" ")}]  ${base.partidas.includes(esperada) ? "✓ tiene la correcta" : "✗ NO la tiene"}`);

    for (const opcion of OPCIONES) {
      const respuestas = [{ pregunta: PREGUNTA, opcion }];
      const e = await estado(producto, respuestas);
      const tiene = e.partidas.includes(esperada);
      const cambio =
        e.partidas.join(",") === base.partidas.join(",") ? "sin cambio" : "cambió";
      console.log(
        `  ${opcion.padEnd(18)} → [${e.partidas.join(" ")}]  ${tiene ? "✓" : "✗"}  ${cambio}`,
      );
    }
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
