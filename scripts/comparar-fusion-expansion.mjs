/**
 * Compara variantes de fusión entre el retrieval base y el de la Fase 0.
 *
 * Usa las expansiones cacheadas (sin llamar a la IA). Las variantes se definen
 * por principio, se miden una vez y se elige; no se iteran contra el resultado.
 *
 *   A (actual) base(5) + exp sobre TEXTO ORIGINAL + términos, anexado al final
 *   B          base(5) + exp sobre los TÉRMINOS SOLOS, anexado al final
 *   C          intercalado 1:1 entre base y exp sobre los términos solos
 *
 * Uso:
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/comparar-fusion-expansion.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { resolverPartidasPaquete } from "../src/lib/clasificador/motor";
import {
  nombreBaseProducto,
  textoParaFiltroParquet,
  textoParaSimsParquet,
} from "../src/lib/clasificador/estado-clasificacion";

const TOPE = 7;

const argsMotor = (producto) => ({
  textoNombreBase: nombreBaseProducto(producto),
  textoFiltro: textoParaFiltroParquet(producto, []),
  textoSims: textoParaSimsParquet(producto, []),
});

const argsPlano = (texto) => ({
  textoNombreBase: texto,
  textoFiltro: texto,
  textoSims: texto,
});

/** Anexa `extra` detrás de `base` sin desplazarla, hasta el tope. */
function anexar(base, extra, tope = TOPE) {
  const out = [...base];
  for (const p of extra) {
    if (out.length >= tope) break;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/** Intercala 1:1, de modo que ambas listas ocupen lugares altos. */
function intercalar(base, extra, tope = TOPE) {
  const out = [];
  for (let i = 0; out.length < tope && (i < base.length || i < extra.length); i++) {
    for (const lista of [base, extra]) {
      const p = lista[i];
      if (p && !out.includes(p) && out.length < tope) out.push(p);
    }
  }
  return out;
}

/**
 * D: en vez de mandar los términos como una bolsa única (donde el scoring
 * binario por clave pierde que la IA repitió el núcleo), corre el retrieval por
 * término y cuenta en cuántos aparece cada partida. La redundancia entre
 * términos pasa a ser señal de ranking.
 */
async function porVotacion(terminos, tope = TOPE) {
  const votos = new Map();
  for (const t of terminos) {
    const partidas = await resolverPartidasPaquete(argsPlano(t));
    // Voto ponderado por posición: encabezar el ranking de un término pesa más.
    partidas.forEach((p, i) => {
      votos.set(p, (votos.get(p) ?? 0) + 1 / (i + 1));
    });
  }
  return [...votos.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, tope)
    .map(([p]) => p);
}

const main = async () => {
  const bateria = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "scripts/fixtures/muestras-lenguaje-usuario.json"), "utf8"),
  );
  const cache = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "scripts/fixtures/expansiones-lenguaje-usuario.json"), "utf8"),
  );

  const res = { base: 0, A: 0, B: 0, C: 0, D: 0 };
  const filas = [];

  for (const m of bateria.muestras) {
    const terminos = cache[m.producto] ?? [];
    const extraTexto = terminos.join(" ").trim();
    const args = argsMotor(m.producto);

    const base = await resolverPartidasPaquete(args);
    const expConcat = extraTexto
      ? await resolverPartidasPaquete({
          textoNombreBase: `${args.textoNombreBase} ${extraTexto}`.trim(),
          textoFiltro: `${args.textoFiltro} ${extraTexto}`.trim(),
          textoSims: `${args.textoSims} ${extraTexto}`.trim(),
        })
      : [];
    const expSolo = extraTexto ? await resolverPartidasPaquete(argsPlano(extraTexto)) : [];

    const A = anexar(base, expConcat);
    const B = anexar(base, expSolo);
    const C = intercalar(base, expSolo);
    const D = terminos.length ? intercalar(base, await porVotacion(terminos)) : base;

    const hit = (arr) => arr.includes(m.partida);
    if (hit(base)) res.base++;
    if (hit(A)) res.A++;
    if (hit(B)) res.B++;
    if (hit(C)) res.C++;
    if (hit(D)) res.D++;

    filas.push({
      producto: m.producto,
      esperada: m.partida,
      base: hit(base),
      A: hit(A),
      B: hit(B),
      C: hit(C),
      D: hit(D),
      listaC: C,
      listaD: D,
    });
  }

  const n = bateria.muestras.length;
  console.log(`${"producto".padEnd(28)} ${"esp".padEnd(5)} base  A    B    C    D`);
  console.log("─".repeat(60));
  for (const f of filas) {
    const m = (b) => (b ? " ✓  " : " ✗  ");
    console.log(
      `${f.producto.padEnd(28)} ${f.esperada.padEnd(5)}${m(f.base)} ${m(f.A)} ${m(f.B)} ${m(f.C)} ${m(f.D)}`,
    );
  }
  console.log("─".repeat(60));
  console.log(`sin expansión (base)          : ${res.base}/${n}  (${((res.base / n) * 100).toFixed(1)}%)`);
  console.log(`A · anexar exp concatenada HOY: ${res.A}/${n}  (${((res.A / n) * 100).toFixed(1)}%)`);
  console.log(`B · anexar exp de términos    : ${res.B}/${n}  (${((res.B / n) * 100).toFixed(1)}%)`);
  console.log(`C · intercalar 1:1            : ${res.C}/${n}  (${((res.C / n) * 100).toFixed(1)}%)`);
  console.log(`D · intercalar + votación     : ${res.D}/${n}  (${((res.D / n) * 100).toFixed(1)}%)`);

  console.log("\nCasos que D rescata y A no tenía:");
  for (const f of filas.filter((x) => x.D && !x.A)) {
    console.log(`  ${f.producto.padEnd(28)} ${f.esperada}  → [${f.listaD.join(" ")}]`);
  }
  console.log("\nCasos que D pierde y A tenía (regresiones):");
  const reg = filas.filter((x) => !x.D && x.A);
  console.log(reg.length ? reg.map((f) => `  ${f.producto.padEnd(28)} ${f.esperada}`).join("\n") : "  (ninguna)");
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
