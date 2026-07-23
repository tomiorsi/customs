/**
 * Benchmark IA: NCM exacta en el paquete del motor (20 muestras).
 *
 * Uso:
 *   python3 scripts/generar-muestras-ia-20.py
 *   python3 scripts/generar-muestras-ia-20.py --seed 20260631 --excluir scripts/fixtures/muestras-ia-20.json --out scripts/fixtures/muestras-ia-20-lote2.json
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/benchmark-ia-ncm.mjs
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/benchmark-ia-ncm.mjs --verbose
 */
import fs from "node:fs";
import path from "node:path";
import { clasificarProducto } from "../src/lib/clasificador";
import { costoClasificacionUsd } from "../src/lib/clasificador/costo-ia";
import { iaDisponible } from "../src/lib/clasificador/ia";
import {
  paquetePartidasParaIa,
  partidasMotor,
} from "../src/lib/clasificador/motor";
import {
  nombreBaseProducto,
  textoParaFiltroParquet,
  textoParaSimsParquet,
} from "../src/lib/clasificador/estado-clasificacion";

const FIXTURES_DIR = path.join(process.cwd(), "scripts/fixtures");
const DEFAULT = path.join(FIXTURES_DIR, "muestras-ia-20.json");
const verbose = process.argv.includes("--verbose");
const MAX_PASOS = 4;

const fixtureArg = process.argv.find((a) => !a.startsWith("--") && a.endsWith(".json"));
const FIXTURE = fixtureArg
  ? path.resolve(fixtureArg)
  : DEFAULT;

function normNcm(s) {
  return (s ?? "").trim().toUpperCase().replace(/\s/g, "");
}

function digitosNcm(s) {
  return (s ?? "").replace(/\D/g, "");
}

function ncmExacta(esperado, obtenido) {
  if (!obtenido) return false;
  return normNcm(esperado) === normNcm(obtenido);
}

function argsMotor(producto, respuestas) {
  return {
    textoNombreBase: nombreBaseProducto(producto),
    textoFiltro: textoParaFiltroParquet(producto, respuestas),
    textoSims: textoParaSimsParquet(producto, respuestas),
  };
}

function ncmEnPaquete(esperado, bloques) {
  const d = digitosNcm(esperado);
  for (const b of bloques) {
    for (const s of b.sims) {
      if (digitosNcm(s.codigo) === d) return true;
    }
  }
  return false;
}

function elegirRespuesta(pregunta, producto) {
  const op = pregunta.opciones ?? [];
  if (op.length) return { pregunta: pregunta.pregunta, opcion: op[0] };
  return { pregunta: pregunta.pregunta, opcion: producto.slice(0, 120) };
}

async function clasificarConAuto(producto) {
  const respuestas = [];
  let pasos = 0;
  let ultimo = null;

  while (pasos <= MAX_PASOS) {
    ultimo = await clasificarProducto(producto, respuestas);
    if (ultimo.decision !== "NEEDS_AI") break;
    const p = ultimo.preguntas?.[0];
    if (!p?.pregunta?.trim()) break;
    respuestas.push(elegirRespuesta(p, producto));
    pasos++;
  }
  return { resultado: ultimo, respuestas, pasos };
}

async function main() {
  if (!iaDisponible()) {
    console.error("Falta ANTHROPIC_API_KEY en el entorno.");
    process.exit(1);
  }
  if (!fs.existsSync(FIXTURE)) {
    console.error("Generá muestras: python3 scripts/generar-muestras-ia-20.py");
    process.exit(1);
  }

  const { muestras } = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  let motorOk = 0;
  let menuOk = 0;
  let iaOk = 0;
  const fallos = [];

  for (const m of muestras) {
    const motorArgs = argsMotor(m.producto, []);
    const partidas = await partidasMotor(motorArgs);
    const bloques = await paquetePartidasParaIa(motorArgs);
    const hitMotor = partidas.includes(m.partida);
    const hitMenu = ncmEnPaquete(m.ncm, bloques);
    if (hitMotor) motorOk++;
    if (hitMenu) menuOk++;

    const { resultado, respuestas, pasos } = await clasificarConAuto(m.producto);
    const got = resultado.ncm ?? "";
    const hitIa = resultado.decision === "DIRECTO" && ncmExacta(m.ncm, got);
    if (hitIa) iaOk++;

    const row = {
      ncm: m.ncm,
      partida: m.partida,
      motor: hitMotor,
      menu: hitMenu,
      ia: hitIa,
      decision: resultado.decision,
      obtenido: got || null,
      partidasMotor: partidas,
      pasos,
      respuestas: respuestas.length,
      justificacion: (resultado.justificacion ?? "").slice(0, 160),
    };

    if (!hitIa) fallos.push(row);

    if (verbose) {
      console.log(
        `${hitIa ? "OK" : "FALLO"} ${m.ncm} → ${got || resultado.decision} | motor ${hitMotor ? "✓" : "✗"} menu ${hitMenu ? "✓" : "✗"}`,
      );
      if (!hitIa && resultado.justificacion) {
        console.log(`  ${resultado.justificacion.slice(0, 120)}…`);
      }
    }
  }

  console.log(`\nMotor partida (top-5): ${motorOk}/${muestras.length}`);
  console.log(`NCM esperada en menú SIM:  ${menuOk}/${muestras.length}`);
  console.log(`IA NCM exacta:           ${iaOk}/${muestras.length}`);
  console.log(`Costo IA acumulado:      ~$${costoClasificacionUsd().toFixed(3)}`);

  if (fallos.length) {
    console.log("\nDiagnóstico fallos:");
    for (const f of fallos) {
      let causa = "ia_ncm_incorrecta";
      if (!f.motor) causa = "motor_sin_partida";
      else if (!f.menu) causa = "ncm_fuera_del_menu";
      else if (f.decision === "NEEDS_AI") causa = "quedo_en_preguntas";
      else if (f.decision === "SIN_RESULTADO") causa = "sin_resultado";
      else if (f.decision === "DIRECTO" && f.obtenido) causa = "ia_otra_ncm";

      console.log(`- ${f.ncm} (${f.partida}) [${causa}]`);
      console.log(`  motor [${f.partidasMotor.join(", ")}] | obtenido ${f.obtenido ?? f.decision}`);
      if (f.justificacion) console.log(`  ${f.justificacion}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
