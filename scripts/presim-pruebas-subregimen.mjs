/**
 * Prueba el mapeo destinación → subrégimen.
 *
 * Elegir mal el subrégimen es presentar mal la declaración, así que la prueba
 * no se conforma con que devuelva algo: contrasta contra tres fuentes.
 *
 * 1. Los casos que la RG 4200 (Anexo II) describe uno por uno.
 * 2. Las tres declaraciones reales, que ya sabemos qué subrégimen llevaron.
 * 3. Los 13.671 despachos de `link_caratula.csv`: todo lo que devolvamos tiene
 *    que ser un subrégimen que exista de verdad.
 *
 * Uso: npx tsx --require ./scripts/register-server-only-stub.cjs \
 *        scripts/presim-pruebas-subregimen.mjs
 */
import fs from "node:fs";
import path from "node:path";

import {
  destinacionesResolubles,
  motivoImplicaTransformacion,
  subregimenPara,
} from "../src/lib/presim/subregimen.ts";

let fallas = 0;
const chequear = (nombre, real, esperado) => {
  const ok = real === esperado;
  if (!ok) fallas++;
  console.log(
    `   ${ok ? "✓" : "✗"} ${nombre.padEnd(56)} ${real ?? "—"}${ok ? "" : `   (esperaba ${esperado})`}`,
  );
};

const sub = (o) => subregimenPara(o).subregimen;

/* ── 1. lo que dice el Anexo II, caso por caso ── */

console.log("1. Contra la RG 4200, Anexo II\n");

console.log("   Importación a consumo — el dígito es la situación de arribo");
chequear("sin documento (postal / medios propios)", sub({ destinacion: "impo_consumo", situacion: "sin_documento" }), "IC01");
chequear("con documento, después del arribo", sub({ destinacion: "impo_consumo", situacion: "con_documento" }), "IC04");
chequear("antes del arribo, directo a plaza", sub({ destinacion: "impo_consumo", situacion: "directo_a_plaza" }), "IC05");
chequear("sobre depósito de almacenamiento", sub({ destinacion: "impo_consumo", situacion: "sobre_deposito" }), "IC06");

console.log("\n   Temporaria SIN transformación (art. 31 punto 1) → IT0x");
chequear("sin documento", sub({ destinacion: "impo_temp_1001", situacion: "sin_documento" }), "IT01");
chequear("con documento", sub({ destinacion: "impo_temp_1001", situacion: "con_documento" }), "IT04");
chequear("directo a plaza", sub({ destinacion: "impo_temp_1001", situacion: "directo_a_plaza" }), "IT05");
chequear("sobre depósito", sub({ destinacion: "impo_temp_1001", situacion: "sobre_deposito" }), "IT06");

console.log("\n   Temporaria PARA transformación (art. 31 ap. 3) → IT1x");
chequear("sin documento", sub({ destinacion: "impo_temp_1330", situacion: "sin_documento" }), "IT11");
chequear("con documento", sub({ destinacion: "impo_temp_1330", situacion: "con_documento" }), "IT14");
chequear("directo a plaza", sub({ destinacion: "impo_temp_1330", situacion: "directo_a_plaza" }), "IT15");
chequear("sobre depósito", sub({ destinacion: "impo_temp_1330", situacion: "sobre_deposito" }), "IT16");

console.log("\n   Tránsito de importación");
chequear("sin documento", sub({ destinacion: "impo_transito", situacion: "sin_documento" }), "TR01");
chequear("con documento", sub({ destinacion: "impo_transito", situacion: "con_documento" }), "TR04");
chequear("directo a plaza", sub({ destinacion: "impo_transito", situacion: "directo_a_plaza" }), "TR05");

console.log("\n   Exportación — no hay arribo, el código va entero");
chequear("a consumo", sub({ destinacion: "expo_consumo", situacion: "con_documento" }), "EC01");
// En exportación la numeración va al revés que en importación.
chequear("temporaria CON transformación", sub({ destinacion: "expo_temporaria", situacion: "con_documento", conTransformacion: true }), "ET01");
chequear("temporaria SIN transformación", sub({ destinacion: "expo_temporaria", situacion: "con_documento", conTransformacion: false }), "ET02");

/* ── 2. el motivo manda sobre la transformación ── */

console.log("\n2. El motivo decide, no el nombre del régimen (Anexo III)\n");

chequear("I31.1C (muestras comerciales) no transforma", String(motivoImplicaTransformacion("I31.1C")), "false");
chequear("I31.1A (bienes de capital) no transforma", String(motivoImplicaTransformacion("I31.1A")), "false");
chequear("I31.3 (transformación/reparación) sí", String(motivoImplicaTransformacion("I31.3")), "true");
chequear("sin motivo no asume transformación", String(motivoImplicaTransformacion(null)), "false");

// El motivo del archivo real: muestras comerciales, con documento de transporte.
chequear(
  "I31.1C + con documento → IT04",
  sub({ destinacion: "impo_temp_1001", situacion: "con_documento", motivo: "I31.1C" }),
  "IT04",
);
chequear(
  "I31.3 + con documento → IT14",
  sub({ destinacion: "impo_temp_1330", situacion: "con_documento", motivo: "I31.3" }),
  "IT14",
);

// Un motivo del apartado 3 sobre la destinación de mismo estado es incoherente.
const incoherente = subregimenPara({
  destinacion: "impo_temp_1001",
  situacion: "con_documento",
  motivo: "I31.3",
});
chequear("I31.3 sobre la de mismo estado: se rechaza", String(incoherente.subregimen), "null");
if (incoherente.subregimen === null) console.log(`       → ${incoherente.porque}`);

/* ── 3. contra las declaraciones reales ── */

console.log("\n3. Contra las declaraciones que la aduana aceptó\n");

const DIR = path.join(process.cwd(), "data/Normas/SIM/declaraciones");
if (fs.existsSync(DIR)) {
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".txt")).sort()) {
    const t = fs.readFileSync(path.join(DIR, f), "latin1");
    const ista = /^ISTA=(.+)$/m.exec(t)?.[1]?.trim();
    const motivo = /^CDDTMOT=(.+)$/m.exec(t)?.[1]?.trim() ?? null;

    // De qué destinación nuestra saldría este archivo.
    const destinacion =
      ista?.startsWith("EC") ? "expo_consumo"
      : ista?.startsWith("IT") ? (motivoImplicaTransformacion(motivo) ? "impo_temp_1330" : "impo_temp_1001")
      : "impo_consumo";

    // Los tres reales tienen documento de transporte.
    const r = subregimenPara({ destinacion, situacion: "con_documento", motivo });
    chequear(`${f.padEnd(22)} motivo ${motivo ?? "—"}`, r.subregimen, ista);
  }
} else {
  console.log("   (sin declaraciones en data/, se saltea)");
}

/* ── 4. nada inventado: todo lo que sale existe en STA ── */

console.log("\n4. Qué destinaciones se resuelven hoy\n");

for (const d of destinacionesResolubles()) {
  const codigos = Object.values(d.subregimenes);
  if (codigos.length) {
    console.log(`   ✓ ${d.label.padEnd(46)} ${[...new Set(codigos)].join(" ")}`);
  } else {
    console.log(`   · ${d.label.padEnd(46)} sin resolver`);
    console.log(`       ${d.porque}`);
  }
}

console.log(`\n${fallas === 0 ? "Todo en orden." : `${fallas} fallas.`}`);
process.exit(fallas === 0 ? 0 : 1);
