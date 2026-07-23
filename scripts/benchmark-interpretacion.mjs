/**
 * Benchmark interpretación: data/a fijarse (lectura local + IA texto).
 *
 * Uso:
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/benchmark-interpretacion.mjs
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/benchmark-interpretacion.mjs 2 3 4 5
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/benchmark-interpretacion.mjs --verbose
 */
import fs from "node:fs";
import path from "node:path";
import { clasificarPorNombre } from "../src/lib/docs.ts";
import { clasificarDocumentoPorContenido } from "../src/lib/clasificar-documento.ts";
import { pipelineDocumentoSubido } from "../src/lib/ia-extraccion.ts";
import { serializarDatosDocumento } from "../src/lib/interpretacion-documento.ts";
import { iaDocsDisponible } from "../src/lib/ia-documentos.ts";
import { contextoOperacionIA } from "../src/lib/marco-validacion.ts";

const CONTEXTO_IMPO = contextoOperacionIA({ tipo: "importacion" });

const BASE = path.join(process.cwd(), "data/a fijarse");
const verbose = process.argv.includes("--verbose");
const carpetasArg = process.argv
  .filter((a) => /^\d+$/.test(a))
  .map((a) => a.trim());
const CARPETAS = carpetasArg.length ? carpetasArg : ["1"];

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function ncmValido(ncm) {
  if (!ncm) return true;
  const t = String(ncm).trim().toUpperCase();
  if (/^\d{4}(\.\d{2}){1,2}(\.\d{2})?[A-Z0-9]{0,2}$/.test(t)) return true;
  const dig = t.replace(/\D/g, "");
  return dig.length >= 8 && dig.length <= 10;
}

function revisarDatos(datos) {
  const problemas = [];
  if (datosVacios(datos)) problemas.push("datos_vacios");
  const ncm = datos?.mercaderia?.ncm;
  if (ncm && !ncmValido(ncm)) problemas.push(`ncm_invalido:${ncm}`);
  const c = datos?.mercaderia?.cantidad;
  const pn = datos?.mercaderia?.peso_neto;
  if (c && pn) {
    const nc = Number(String(c).replace(/[^\d.,]/g, "").replace(",", "."));
    const np = Number(String(pn).replace(/[^\d.,]/g, "").replace(",", "."));
    if (Number.isFinite(nc) && Number.isFinite(np) && np > 0 && nc < np * 0.2) {
      problemas.push("cantidad_vs_peso");
    }
  }
  return problemas;
}

function datosVacios(datos) {
  if (!datos) return true;
  const keys = [
    datos.comercial,
    datos.mercaderia,
    datos.partes,
    datos.transporte,
    datos.origen,
    datos.pago,
    datos.via,
  ];
  return keys.every((k) => k == null || (Array.isArray(k) && k.length === 0));
}

function visionUsada(meta) {
  if (!meta) return false;
  if (meta.fuente === "vision") return true;
  if (meta.texto_vision) return true;
  if (meta.lectura_verificada_pdf) return true;
  return false;
}

async function procesarCarpeta(carpetaId) {
  const CARPETA = path.join(BASE, carpetaId);
  if (!fs.existsSync(CARPETA)) {
    console.error("No existe:", CARPETA);
    return null;
  }

  const pdfs = fs
    .readdirSync(CARPETA)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();

  console.log(`\n${"=".repeat(60)}\nInterpretación — carpeta ${carpetaId} (${pdfs.length} PDFs)\n`);

  const items = [];
  let visionN = 0;
  let okN = 0;
  const tCarpeta = Date.now();

  for (const file of pdfs) {
    const full = path.join(CARPETA, file);
    const base64 = fs.readFileSync(full).toString("base64");
    const tipo = clasificarPorNombre(file);
    const t0 = Date.now();

    const r = await pipelineDocumentoSubido(
      {
        rol: "documento a clasificar",
        nombre: file,
        mediaType: "application/pdf",
        base64,
      },
      { tipoConocido: tipo, contextoOperacion: CONTEXTO_IMPO, esImportacion: true },
    );

    let tipoFinal = r.tipo;
    if (tipo === "otro" && r.lectura?.texto?.length > 80) {
      const porContenido = await clasificarDocumentoPorContenido({
        texto: r.lectura.texto,
        nombreArchivo: file,
        resumen: r.resumen,
      });
      if (porContenido !== "otro") tipoFinal = porContenido;
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const vision = visionUsada(r.meta_lectura);
    if (vision) visionN++;
    const lecturaOk = (r.lectura?.texto?.length ?? 0) > 80;
    const problemas = revisarDatos(r.datos);
    const ocrFallo = Boolean(r.meta_lectura?.ocrFallo);
    if (ocrFallo) problemas.push("ocr_fallo");
    const ok = lecturaOk && problemas.length === 0;
    if (ok) okN++;

    const row = {
      archivo: file,
      tipo_nombre: tipo,
      tipo_final: tipoFinal,
      problemas,
      ok,
      lectura_chars: r.lectura?.texto?.length ?? 0,
      vision_cloud: vision,
      ocr_local: Boolean(r.meta_lectura?.ocr_usado),
      fuente: r.meta_lectura?.fuente ?? null,
      segundos: Number(elapsed),
      resumen: r.resumen?.slice(0, 120),
      datos: r.datos,
      vacios: r.vacios_interpretacion,
    };
    items.push(row);

    const estado = ok ? "OK" : `REVISAR ${problemas.join(", ")}`;
    console.log(
      `  ${file}\n` +
        `    ${estado} | ${elapsed}s | tipo=${tipoFinal} | lectura=${row.lectura_chars}ch | ` +
        `vision=${vision ? "SÍ" : "no"} | ocr_local=${row.ocr_local}`,
    );
    if (verbose || !ok) {
      console.log(serializarDatosDocumento(r.datos));
      if (r.vacios_interpretacion?.length) {
        console.log("  vacíos:", r.vacios_interpretacion);
      }
      console.log("");
    }
  }

  const segCarpeta = ((Date.now() - tCarpeta) / 1000).toFixed(1);
  const out = path.join(
    process.cwd(),
    `scripts/fixtures/benchmark-interpretacion-carpeta-${carpetaId}.json`,
  );
  const resumen = {
    carpeta: carpetaId,
    ok: okN,
    total: pdfs.length,
    vision_cloud_veces: visionN,
    segundos: Number(segCarpeta),
    items,
  };
  fs.writeFileSync(out, JSON.stringify(resumen, null, 2), "utf8");

  console.log(`Carpeta ${carpetaId}: ${okN}/${pdfs.length} OK | ${segCarpeta}s | visión=${visionN}`);
  return resumen;
}

async function main() {
  loadEnv();
  process.env.LECTURA_SIN_VALIDAR_VISION = "1";

  if (!iaDocsDisponible()) {
    console.error("Falta ANTHROPIC_API_KEY en .env");
    process.exit(1);
  }

  const resultados = [];
  for (const id of CARPETAS) {
    const r = await procesarCarpeta(id);
    if (r) resultados.push(r);
  }

  const okTotal = resultados.reduce((s, r) => s + r.ok, 0);
  const nTotal = resultados.reduce((s, r) => s + r.total, 0);
  const visionTotal = resultados.reduce((s, r) => s + r.vision_cloud_veces, 0);
  const segTotal = resultados.reduce((s, r) => s + r.segundos, 0);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`TOTAL: ${okTotal}/${nTotal} OK | ${segTotal.toFixed(1)}s | visión cloud=${visionTotal}`);

  if (process.argv.includes("--audit")) {
    const { spawnSync } = await import("node:child_process");
    const ids = CARPETAS.join(" ");
    const audit = spawnSync(
      "npx",
      [
        "tsx",
        "--require",
        "./scripts/register-server-only-stub.cjs",
        "scripts/audit-interpretacion-fundada.mjs",
        ...CARPETAS,
      ],
      { cwd: process.cwd(), stdio: "inherit", shell: true },
    );
    process.exit(audit.status === 0 && okTotal === nTotal ? 0 : 1);
  }

  process.exit(okTotal === nTotal ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
