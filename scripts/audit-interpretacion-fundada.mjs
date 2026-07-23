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
    docs.push({
      archivo: item.archivo,
      tipo,
      ok,
      vacios_revalidacion: vacios,
      datos: item.datos,
    });
    const flag = ok ? "OK" : "FALLA";
    console.log(`  [${flag}] ${item.archivo} (${tipo})`);
    if (!ok) {
      console.log("    datos no pasan re-fundamentación (campo sin anclar)");
      for (const v of vacios) {
        console.log(`    · ${v.campo}: ${v.motivo}`);
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
