/**
 * Benchmark cruce multi-doc por carpeta (extracción cacheada + IA texto + marco normativo).
 *
 * Uso:
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/benchmark-cruce.mjs 1
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/benchmark-cruce.mjs 1 --solo-cruce
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/benchmark-cruce.mjs 1 --verbose
 */
import fs from "node:fs";
import path from "node:path";
import { clasificarPorNombre } from "../src/lib/docs.ts";
import { clasificarDocumentoPorContenido } from "../src/lib/clasificar-documento.ts";
import { pipelineDocumentoSubido } from "../src/lib/ia-extraccion.ts";
import { serializarDatosDocumento } from "../src/lib/interpretacion-documento.ts";
import { iaDocsDisponible } from "../src/lib/ia-documentos.ts";
import { cruzarDocumentacionEtapaTexto } from "../src/lib/cruce-texto.ts";
import { refNormativaValida } from "../src/lib/ia-guardrails.ts";

const BASE = path.join(process.cwd(), "data/a fijarse");
const verbose = process.argv.includes("--verbose");
const soloCruce = process.argv.includes("--solo-cruce");
const carpetaId = process.argv.find((a) => /^\d+$/.test(a)) ?? "1";

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

function mockOp(campos) {
  return {
    id: `bench-cruce-${carpetaId}`,
    user_id: "bench",
    ref: `MUESTRA-${carpetaId}`,
    tipo: campos.tipo ?? "importacion",
    estado: "en_preparacion",
    etapa: "documentacion",
    checklist: null,
    assigned_to: null,
    created_at: new Date().toISOString(),
    docs: campos.docs ?? 0,
    company_name: "Bench SA",
    client_email: null,
    client_iva_condition: null,
    client_cert_exencion: null,
    client_carta_garantia: null,
    ncm: campos.ncm ?? null,
    pais_origen: campos.pais_origen ?? null,
    pais_procedencia: campos.pais_procedencia ?? null,
    pais_destino: campos.pais_destino ?? "Argentina",
    via: campos.via ?? null,
    incoterm: campos.incoterm ?? null,
    mercaderia: campos.mercaderia ?? null,
    forma_pago: campos.forma_pago ?? null,
    unidad: campos.unidad ?? null,
    tipo_embalaje: campos.tipo_embalaje ?? null,
    valor_factura: campos.valor_factura ?? null,
    valor_fob: campos.valor_fob ?? null,
    transporte_doc_nro: null,
    reconciliacion_meta: null,
    resoluciones_conflictos: null,
    validacion_ia: null,
    hallazgos_ia: null,
  };
}

function datosDocBench(doc) {
  if (doc?.datos && typeof doc.datos === "object") return doc.datos;
  if (typeof doc?.extraccion_ia !== "string") return {};
  try {
    const raw = JSON.parse(doc.extraccion_ia);
    return raw?.datos && typeof raw.datos === "object" ? raw.datos : {};
  } catch {
    return {};
  }
}

function prioridadViaDoc(docType) {
  switch (docType) {
    case "despacho":
      return 4;
    case "transporte":
    case "transporte_borrador":
    case "liberacion_transporte":
      return 3;
    case "factura_gastos":
    case "cotizacion_forwarder":
      return 2;
    default:
      return -1;
  }
}

function inferirViaOperacion(docs) {
  let mejor = { via: null, prioridad: -1 };
  for (const d of docs) {
    const datos = datosDocBench(d);
    const via = typeof datos?.via === "string" ? datos.via : null;
    const prioridad = prioridadViaDoc(d.doc_type);
    if (!via || prioridad < 0) continue;
    if (prioridad > mejor.prioridad) {
      mejor = { via, prioridad };
    }
  }
  return mejor.via;
}

function primerValorPreferido(docs, preferredDocTypes, extractor) {
  for (const d of docs) {
    if (!preferredDocTypes.includes(d.doc_type)) continue;
    const valor = extractor(datosDocBench(d));
    if (valor) return valor;
  }
  for (const d of docs) {
    const valor = extractor(datosDocBench(d));
    if (valor) return valor;
  }
  return null;
}

function inferirOperacion(docs) {
  const ncm =
    primerValorPreferido(
      docs,
      ["factura_comercial", "proforma", "packing_list", "certificado_origen", "transporte"],
      (datos) => datos.mercaderia?.ncm,
    ) ?? null;
  const paisOrigen =
    primerValorPreferido(
      docs,
      ["factura_comercial", "proforma", "certificado_origen", "certificado_peso"],
      (datos) => datos.origen?.pais_origen,
    ) ?? null;
  const via = inferirViaOperacion(docs);
  const incoterm =
    primerValorPreferido(
      docs,
      ["factura_comercial", "proforma", "pedido_compra", "despacho"],
      (datos) => datos.comercial?.incoterm,
    ) ?? null;
  let mercaderia = null;
  const valorFactura =
    primerValorPreferido(
      docs,
      ["factura_comercial", "proforma", "pedido_compra"],
      (datos) => datos.comercial?.valor_factura,
    ) ?? null;
  let tipo = "importacion";

  for (const d of docs) {
    const datos = datosDocBench(d);
    if (datos.mercaderia?.mercaderia && !mercaderia) {
      mercaderia = datos.mercaderia.mercaderia.slice(0, 120);
    }
    if (d.doc_type === "despacho") tipo = "importacion";
  }

  return mockOp({
    tipo,
    docs: docs.length,
    ncm,
    pais_origen: paisOrigen,
    pais_destino: "Argentina",
    via,
    incoterm,
    mercaderia,
    valor_factura: valorFactura,
  });
}

function docRowsFromItems(items) {
  return items.map((it, i) => ({
    id: `doc-${carpetaId}-${i}`,
    operation_id: `bench-cruce-${carpetaId}`,
    user_id: "bench",
    doc_type: it.tipo_final ?? it.tipo_nombre ?? "otro",
    file_name: it.archivo,
    stored_name: it.archivo,
    mime_type: "application/pdf",
    size: null,
    created_at: new Date().toISOString(),
    extraccion_ia: JSON.stringify({
      at: new Date().toISOString(),
      stored_name: it.archivo,
      size: null,
      datos: it.datos,
      lectura_bruta: it.lectura_bruta,
      tipo: it.tipo_final,
      resumen: it.resumen,
    }),
  }));
}

async function extraerCarpeta(carpetaPath) {
  const pdfs = fs
    .readdirSync(carpetaPath)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();

  const items = [];
  for (const file of pdfs) {
    const full = path.join(carpetaPath, file);
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
      { tipoConocido: tipo },
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
    items.push({
      archivo: file,
      tipo_nombre: tipo,
      tipo_final: tipoFinal,
      datos: r.datos,
      lectura_bruta: r.lectura_bruta,
      resumen: r.resumen,
      segundos_extraccion: Number(((Date.now() - t0) / 1000).toFixed(1)),
    });
  }
  return items;
}

function cargarInterpretacionCache(id) {
  const p = path.join(
    process.cwd(),
    `scripts/fixtures/benchmark-interpretacion-carpeta-${id}.json`,
  );
  if (!fs.existsSync(p)) return null;
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return raw.items ?? null;
}

function analizarCruce(etapa, cruce, docs) {
  const tipos = [...new Set(docs.map((d) => d.doc_type))];
  const faltantes = cruce?.faltantes ?? [];
  const inconsistencias = cruce?.inconsistencias ?? [];
  const alertas = cruce?.alertas ?? [];
  const refsOk = faltantes.filter((f) => refNormativaValida(f.ref)).length;
  const refsWarn = alertas.filter(
    (a) => a.nivel !== "ok" && refNormativaValida(a.ref),
  ).length;

  return {
    etapa,
    tipos_presentes: tipos,
    resumen: cruce?.resumen ?? "",
    faltantes: faltantes.map((f) => ({
      doc: f.doc,
      motivo: f.motivo,
      ref: f.ref,
      ref_ok: refNormativaValida(f.ref),
    })),
    inconsistencias,
    alertas: alertas.map((a) => ({
      nivel: a.nivel,
      texto: a.texto,
      ref: a.ref,
    })),
    refs_faltantes_ok: `${refsOk}/${faltantes.length}`,
    refs_alertas_warn: refsWarn,
  };
}

async function main() {
  loadEnv();
  process.env.LECTURA_SIN_VALIDAR_VISION = "1";

  if (!iaDocsDisponible()) {
    console.error("Falta ANTHROPIC_API_KEY");
    process.exit(1);
  }

  const carpetaPath = path.join(BASE, carpetaId);
  if (!fs.existsSync(carpetaPath)) {
    console.error("No existe carpeta:", carpetaPath);
    process.exit(1);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`CRUCE — carpeta ${carpetaId}${soloCruce ? " (solo cruce, cache)" : ""}`);
  console.log("=".repeat(60));

  let items = soloCruce ? cargarInterpretacionCache(carpetaId) : null;
  if (!items) {
    console.log("\nExtracción + interpretación...");
    items = await extraerCarpeta(carpetaPath);
  } else {
    console.log("\nUsando cache interpretación:", items.length, "docs");
  }

  const docRows = docRowsFromItems(items);
  const op = inferirOperacion(docRows);

  console.log("\nOperación inferida:");
  console.log(
    `  ${op.tipo} | vía=${op.via ?? "s/d"} | NCM=${op.ncm ?? "s/d"} | origen=${op.pais_origen ?? "s/d"} | Incoterm=${op.incoterm ?? "s/d"}`,
  );
  console.log("\nDocumentos:");
  for (const d of docRows) {
    console.log(`  - ${d.file_name} → ${d.doc_type}`);
  }

  const t0 = Date.now();
  const cruceDoc = await cruzarDocumentacionEtapaTexto(
    op,
    "documentacion",
    docRows,
  );
  const cruceEmb = await cruzarDocumentacionEtapaTexto(op, "embarque", docRows);
  const segCruce = ((Date.now() - t0) / 1000).toFixed(1);

  const analisisDoc = analizarCruce("documentacion", cruceDoc, docRows);
  const analisisEmb = analizarCruce("embarque", cruceEmb, docRows);

  console.log(`\n--- Cruce documentación (${segCruce}s total ambas etapas) ---`);
  if (cruceDoc?.resumen) console.log("Resumen:", cruceDoc.resumen);
  console.log("Faltantes:", analisisDoc.faltantes.length);
  for (const f of analisisDoc.faltantes) {
    console.log(`  · ${f.doc}: ${f.motivo?.slice(0, 100)}`);
    console.log(`    ref=${f.ref} ${f.ref_ok ? "✓" : "✗"}`);
  }
  console.log("Inconsistencias:", analisisDoc.inconsistencias.length);
  for (const s of analisisDoc.inconsistencias) {
    console.log(`  · ${s.slice(0, 140)}`);
  }
  console.log("Alertas:", analisisDoc.alertas.length);
  for (const a of analisisDoc.alertas) {
    console.log(`  · [${a.nivel}] ${a.texto?.slice(0, 120)}`);
  }

  console.log("\n--- Cruce embarque ---");
  if (cruceEmb?.resumen) console.log("Resumen:", cruceEmb.resumen);
  console.log("Faltantes:", analisisEmb.faltantes.length);
  for (const f of analisisEmb.faltantes) {
    console.log(`  · ${f.doc}: ${f.motivo?.slice(0, 100)}`);
  }
  console.log("Inconsistencias:", analisisEmb.inconsistencias.length);
  for (const s of analisisEmb.inconsistencias) {
    console.log(`  · ${s.slice(0, 140)}`);
  }

  if (verbose) {
    console.log("\n--- Datos por documento ---");
    for (const it of items) {
      console.log(`\n[${it.archivo}] tipo=${it.tipo_final}`);
      console.log(serializarDatosDocumento(it.datos));
    }
  }

  const out = {
    carpeta: carpetaId,
    operacion: {
      tipo: op.tipo,
      via: op.via,
      ncm: op.ncm,
      pais_origen: op.pais_origen,
      incoterm: op.incoterm,
    },
    documentos: docRows.map((d) => ({ file: d.file_name, tipo: d.doc_type })),
    cruce_documentacion: analisisDoc,
    cruce_embarque: analisisEmb,
    segundos_cruce: Number(segCruce),
  };

  const outPath = path.join(
    process.cwd(),
    `scripts/fixtures/benchmark-cruce-carpeta-${carpetaId}.json`,
  );
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Guardado: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
