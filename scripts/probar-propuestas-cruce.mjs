#!/usr/bin/env node
/**
 * Prueba offline propuestas Fase B (árbol parquet, sin cruce IA).
 * Uso: node scripts/probar-propuestas-cruce.mjs "descripción"
 *      node scripts/probar-propuestas-cruce.mjs "descripción" PARTIDA NCM_HIPOTESIS
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./scripts/stub-server-only.mjs", pathToFileURL("./"));

const argv = process.argv.slice(2);
const producto = argv[0] || "zapatillas de cuero con suela de goma";
const partida4 = argv[1] || "6403";
const hipNcm = argv[2] || "6403.91.00.100A";

const {
  subpartidasRivalesEnPartida,
  lineasDisputaParaCruce,
  candidatosDePartida,
  agruparCandidatosPorSubpartida,
  etiquetaSubpartida,
} = await import("../src/lib/clasificador/motor.ts");

const subHip = etiquetaSubpartida(hipNcm);

console.log("PRODUCTO:", producto.slice(0, 100));
console.log("PARTIDA:", partida4, "| HIP:", hipNcm, "| sub:", subHip);

const rivales = await subpartidasRivalesEnPartida(producto, partida4, {
  excluir: subHip,
});
console.log("\nSubpartidas rivales:");
for (const r of rivales) {
  console.log(`  ${r.subpartida}  ${r.descripcion}`);
}

const porSub = agruparCandidatosPorSubpartida(await candidatosDePartida(partida4));
const propuestas = [hipNcm];

if (rivales[0]) {
  const cand = porSub.get(rivales[0].subpartida) ?? [];
  const lineas = await lineasDisputaParaCruce(cand, producto, partida4);
  console.log(`\nHermanos en disputa (${rivales[0].subpartida}):`);
  for (const c of cand) {
    const mark = lineas.some((l) => l.codigo === c.codigo) ? "→" : " ";
    console.log(`  ${mark} ${c.codigo}  | ${c.descripcion}`);
  }
  propuestas.push(...lineas.slice(0, 2).map((c) => c.codigo));
}

console.log("\nPropuestas simuladas:", propuestas);
