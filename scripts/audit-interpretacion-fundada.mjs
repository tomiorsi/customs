/**
 * Verifica que los datos interpretados estén 100% anclados en el PDF.
 * Usa la misma fundamentación que el pipeline de producción.
 *
 * Uso: npx tsx --require ./scripts/register-server-only-stub.cjs scripts/audit-interpretacion-fundada.mjs 1
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fundamentarDatosDesdeTranscripcion } from "../src/lib/fundamentacion-interpretacion.ts";

const ROOT = process.cwd();
const BASE = path.join(ROOT, "data/a fijarse");
const carpetas = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
const IDS = carpetas.length ? carpetas : ["1", "2", "3", "4", "5"];

function loadPdfText(pdfPath) {
  const r = spawnSync("python3", ["scripts/pdf_texto.py", pdfPath], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr || "pdf_texto falló");
  return JSON.parse(r.stdout).texto;
}

function stable(obj) {
  return JSON.stringify(obj ?? null);
}

/**
 * Qué campos cambió la re-fundamentación, con el valor que se perdió.
 *
 * Antes el informe decía solo «campo sin anclar» y `vacios` venía vacío en 6 de
 * 7 fallas: se sabía que algo no anclaba pero no qué. Sin esto no se puede
 * arreglar el motor, solo adivinarle.
 */
function camposCambiados(antes, despues, prefijo = "") {
  const out = [];
  const esObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  const claves = new Set([
    ...Object.keys(antes ?? {}),
    ...Object.keys(despues ?? {}),
  ]);
  for (const k of claves) {
    const a = antes?.[k];
    const d = despues?.[k];
    const ruta = prefijo ? `${prefijo}.${k}` : k;
    if (stable(a) === stable(d)) continue;
    if (esObj(a) && esObj(d)) {
      out.push(...camposCambiados(a, d, ruta));
      continue;
    }
    out.push({
      campo: ruta,
      antes: a === undefined ? "(ausente)" : stable(a),
      despues: d === undefined ? "(descartado)" : stable(d),
    });
  }
  return out;
}

function auditarCarpeta(id) {
  const fixture = path.join(
    ROOT,
    `scripts/fixtures/benchmark-interpretacion-carpeta-${id}.json`,
  );
  if (!fs.existsSync(fixture)) {
    console.error("Sin fixture:", fixture);
    return { carpeta: id, ok: 0, total: 0, docs: [] };
  }
  const items = JSON.parse(fs.readFileSync(fixture, "utf8")).items ?? [];
  const docs = [];
  for (const item of items) {
    const pdf = path.join(BASE, id, item.archivo);
    const texto = loadPdfText(pdf);
    const tipo = item.tipo_final ?? item.tipo_nombre ?? "otro";
    const { datos: limpio, vacios } = fundamentarDatosDesdeTranscripcion(
      item.datos,
      texto,
      tipo,
      { esImportacion: true },
    );
    const ok = stable(item.datos) === stable(limpio);
    const cambios = ok ? [] : camposCambiados(item.datos, limpio);
    docs.push({
      archivo: item.archivo,
      tipo,
      ok,
      vacios_revalidacion: vacios,
      cambios_revalidacion: cambios,
      datos: item.datos,
    });
    const flag = ok ? "OK" : "FALLA";
    console.log(`  [${flag}] ${item.archivo} (${tipo})`);
    if (!ok) {
      const motivo = new Map(vacios.map((v) => [v.campo, v.motivo]));
      console.log("    datos no pasan re-fundamentación:");
      for (const c of cambios) {
        const por = motivo.get(c.campo);
        console.log(
          `    · ${c.campo}: ${c.antes} → ${c.despues}${por ? `  (${por})` : ""}`,
        );
      }
      // Motivos registrados sobre campos que no aparecieron en el diff.
      for (const v of vacios) {
        if (!cambios.some((c) => c.campo === v.campo)) {
          console.log(`    · ${v.campo}: ${v.motivo}`);
        }
      }
    }
  }
  const okN = docs.filter((d) => d.ok).length;
  return { carpeta: id, ok: okN, total: docs.length, docs };
}

console.log("AUDITORÍA FUNDADA (mismo motor que producción)\n");
const informes = [];
for (const id of IDS) {
  console.log(`--- Carpeta ${id} ---`);
  informes.push(auditarCarpeta(id));
  console.log("");
}

const okTotal = informes.reduce((s, i) => s + i.ok, 0);
const nTotal = informes.reduce((s, i) => s + i.total, 0);
const out = path.join(ROOT, "scripts/fixtures/audit-interpretacion-fundada.json");
fs.writeFileSync(out, JSON.stringify(informes, null, 2), "utf8");
console.log(`${"=".repeat(60)}`);
console.log(`TOTAL: ${okTotal}/${nTotal} PDFs 100% fundamentados`);
console.log(`Guardado: ${out}`);
process.exit(okTotal === nTotal ? 0 : 1);
