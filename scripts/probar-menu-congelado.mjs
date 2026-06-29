/**
 * Verifica el flujo real de menús (index.ts):
 * - Fase 1: partidasCandidatas(producto) — congelado, sin respuestas.
 * - Fase 2: partidasCandidatas(textoFiltro) — producto + respuestas del importador.
 *
 * Uso: npx tsx --require ./scripts/register-server-only-stub.cjs scripts/probar-menu-congelado.mjs
 */
import {
  partidasCandidatas,
  acotarMenuPartidas,
} from "../src/lib/clasificador/motor";
import { textoParaFiltroParquet } from "../src/lib/clasificador/estado-clasificacion";

const MAX_PARTIDAS_FASE1 = 20;

const CASOS = [
  {
    nombre: "repuesto + válvula compresor",
    producto: "repuesto",
    respuestas: [{ pregunta: "¿Qué es?", opcion: "válvula de compresor de aire" }],
  },
  {
    nombre: "pieza + bomba hidráulica",
    producto: "pieza suelta",
    respuestas: [{ pregunta: "Material", opcion: "bomba hidráulica para excavador" }],
  },
];

function diffPartidas(base, ampliadas) {
  const set = new Set(base);
  return ampliadas.filter((p) => !set.has(p));
}

function iguales(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/** Réplica de armado de menús en clasificarProductoInterno. */
async function menusComoProduccion(producto, respuestas) {
  const textoFiltro = textoParaFiltroParquet(producto, respuestas);
  const menuFase1 = (
    await acotarMenuPartidas(await partidasCandidatas(producto), [], MAX_PARTIDAS_FASE1)
  ).map((c) => c.partida);
  const menuFase2 = (
    await acotarMenuPartidas(await partidasCandidatas(textoFiltro), [], MAX_PARTIDAS_FASE1)
  ).map((c) => c.partida);
  return { menuFase1, menuFase2, textoFiltro };
}

async function evaluarCaso(caso) {
  const { producto, respuestas } = caso;
  const conResp = await menusComoProduccion(producto, respuestas);
  const sinResp = await menusComoProduccion(producto, []);
  const extraEnFase2 = diffPartidas(conResp.menuFase1, conResp.menuFase2);

  const fase1Congelada = iguales(conResp.menuFase1, sinResp.menuFase1);
  const fase2Amplia = extraEnFase2.length > 0;

  return {
    menuFase1: conResp.menuFase1.slice(0, 8),
    menuFase2Top: conResp.menuFase2.slice(0, 8),
    extraEnFase2: extraEnFase2.slice(0, 8),
    fase1Congelada,
    fase2Amplia,
    ok: fase1Congelada && fase2Amplia,
  };
}

async function main() {
  let fallos = 0;
  for (const caso of CASOS) {
    const r = await evaluarCaso(caso);
    console.log(`\n=== ${caso.nombre} ===`);
    console.log("Menú Fase 1 (solo producto):", r.menuFase1.join(", ") || "(vacío)");
    console.log("Menú Fase 2 top (HECHOS completo):", r.menuFase2Top.join(", ") || "(vacío)");
    console.log("Partidas solo en Fase 2:", r.extraEnFase2.join(", ") || "(ninguna)");
    console.log("Fase 1 congelada (igual sin respuestas):", r.fase1Congelada ? "sí" : "NO");
    if (r.ok) {
      console.log("RESULTADO: OK");
    } else {
      console.log("RESULTADO: FALLO");
      fallos++;
    }
  }
  console.log(fallos ? `\n${fallos} caso(s) fallaron` : "\nTodos los casos OK");
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
