/**
 * Analiza la lista de repuestos R5 (descripciones reales en español) contra el
 * NCM manuscrito del despachante. Corre motor+IA (auto-responde la 1ª opción).
 *
 *   set -a; . ./.env; set +a
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/analizar-repuestos-r5.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { clasificarProducto } from "../src/lib/clasificador";
import { costoClasificacionUsd } from "../src/lib/clasificador/costo-ia";
import { iaDisponible } from "../src/lib/clasificador/ia";
import { partidasMotor } from "../src/lib/clasificador/motor";
import {
  nombreBaseProducto,
  textoParaFiltroParquet,
  textoParaSimsParquet,
} from "../src/lib/clasificador/estado-clasificacion";

const FIXTURE = path.join(process.cwd(), "scripts/fixtures/muestras-repuestos-r5.json");
const MAX_PASOS = 4;
const dig = (s) => (s ?? "").replace(/\D/g, "");

function elegirRespuesta(pregunta, producto) {
  const op = pregunta.opciones ?? [];
  return { pregunta: pregunta.pregunta, opcion: op.length ? op[0] : producto.slice(0, 120) };
}

async function clasificarConAuto(producto) {
  const respuestas = [];
  let pasos = 0;
  let ultimo = null;
  const preguntas = [];
  while (pasos <= MAX_PASOS) {
    ultimo = await clasificarProducto(producto, respuestas);
    if (ultimo.decision !== "NEEDS_AI") break;
    const p = ultimo.preguntas?.[0];
    if (!p?.pregunta?.trim()) break;
    preguntas.push(p.pregunta);
    respuestas.push(elegirRespuesta(p, producto));
    pasos++;
  }
  return { resultado: ultimo, pasos, preguntas };
}

async function main() {
  if (!iaDisponible()) {
    console.error("Falta ANTHROPIC_API_KEY (usá: set -a; . ./.env; set +a)");
    process.exit(1);
  }
  const { muestras } = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  let partOk = 0, partTot = 0, ncmOk = 0;

  for (const m of muestras) {
    const motorArgs = {
      textoNombreBase: nombreBaseProducto(m.producto),
      textoFiltro: textoParaFiltroParquet(m.producto, []),
      textoSims: textoParaSimsParquet(m.producto, []),
    };
    const top5 = await partidasMotor(motorArgs);
    const { resultado, pasos, preguntas } = await clasificarConAuto(m.producto);
    const got = resultado.ncm ?? "";
    const gotPart = dig(got).slice(0, 4);

    let veredicto;
    if (m.partida == null) {
      veredicto = `(sin ref) → ${resultado.decision} ${got || ""}`;
    } else {
      partTot++;
      const pHit = gotPart === m.partida;
      const nHit = dig(got) === dig(m.ncm);
      if (pHit) partOk++;
      if (nHit) ncmOk++;
      const motorHit = top5.includes(m.partida) ? "" : "  [motor NO trae la partida en top5]";
      veredicto = `${pHit ? "PARTIDA_OK" : "PARTIDA_FALLA"}${nHit ? " +NCM_EXACTA" : ""} | esp ${m.partida} (${m.ncm}) | obt ${gotPart || resultado.decision} (${got || "-"})${motorHit}`;
    }

    console.log(`\n#${m.n} "${m.producto}"`);
    console.log(`   ${veredicto}`);
    console.log(`   motor top5: [${top5.join(", ")}] | pasos preguntas: ${pasos}`);
    if (preguntas.length) console.log(`   preguntó: ${preguntas.map((q) => `«${q}»`).join(" ")}`);
    if (m.partida != null && gotPart !== m.partida && resultado.justificacion) {
      console.log(`   justif: ${resultado.justificacion.slice(0, 200)}`);
    }
  }

  console.log(`\n================ RESUMEN ================`);
  console.log(`Con NCM de referencia: ${partTot} ítems`);
  console.log(`Partida (4 díg) correcta: ${partOk}/${partTot}`);
  console.log(`NCM exacta:               ${ncmOk}/${partTot}`);
  console.log(`Costo IA: ~$${costoClasificacionUsd().toFixed(3)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
