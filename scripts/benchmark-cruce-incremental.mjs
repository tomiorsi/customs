/**
 * Benchmark incremental: simula subida documento a documento (orden real de despacho).
 *
 * Uso:
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/benchmark-cruce-incremental.mjs 1
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/benchmark-cruce-incremental.mjs 1 --verbose
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/benchmark-cruce-incremental.mjs 1 --hasta 3
 */
import fs from "node:fs";
import path from "node:path";
import { DOC_LABELS, faltantePerteneceSoloEmbarque, etapasDocsIA, docTypeCubreFaltante } from "../src/lib/docs.ts";
import { serializarDatosDocumento } from "../src/lib/interpretacion-documento.ts";
import { iaDocsDisponible } from "../src/lib/ia-documentos.ts";
import { cruzarDocumentacionEtapaTexto } from "../src/lib/cruce-texto.ts";
import { evaluarHallazgosDocumentoSubido } from "../src/lib/hallazgos-documento.ts";
import { derivarFaltantesOperacion } from "../src/lib/faltantes-operacion.ts";
import { refNormativaValida } from "../src/lib/ia-guardrails.ts";

const BASE = path.join(process.cwd(), "data/a fijarse");
const verbose = process.argv.includes("--verbose");
const carpetaId = process.argv.find((a) => /^\d+$/.test(a)) ?? "1";
const hastaArg = process.argv.find((a) => a.startsWith("--hasta"));
const hastaPaso = hastaArg
  ? Number(hastaArg.split("=")[1] ?? process.argv[process.argv.indexOf(hastaArg) + 1])
  : null;

/** Prioridad de subida real: comercial → origen → transporte → gastos → aduana. */
const PRIORIDAD_TIPO = {
  proforma: 5,
  pedido_compra: 6,
  factura_comercial: 10,
  packing_list: 20,
  certificado_origen: 30,
  declaracion_transbordo: 32,
  certificado_peso: 35,
  seguro: 36,
  catalogo: 37,
  cotizacion_forwarder: 40,
  transporte_borrador: 48,
  transporte: 50,
  liberacion_transporte: 55,
  factura_gastos: 60,
  despacho: 90,
  remito: 95,
  otro: 80,
};

const TIPOS_EMBARQUE = new Set([
  "transporte",
  "transporte_borrador",
  "liberacion_transporte",
  "factura_gastos",
  "declaracion_transbordo",
  "certificado_peso",
]);

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
    id: `bench-incr-${carpetaId}`,
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

function inferirViaOperacion(docRows) {
  let mejor = { via: null, prioridad: -1 };
  for (const d of docRows) {
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

function primerValorPreferido(docRows, preferredDocTypes, extractor) {
  for (const d of docRows) {
    if (!preferredDocTypes.includes(d.doc_type)) continue;
    const valor = extractor(datosDocBench(d));
    if (valor) return valor;
  }
  for (const d of docRows) {
    const valor = extractor(datosDocBench(d));
    if (valor) return valor;
  }
  return null;
}

function inferirOperacion(docRows) {
  const ncm =
    primerValorPreferido(
      docRows,
      ["factura_comercial", "proforma", "packing_list", "certificado_origen", "transporte"],
      (datos) => datos.mercaderia?.ncm,
    ) ?? null;
  const paisOrigen =
    primerValorPreferido(
      docRows,
      ["factura_comercial", "proforma", "certificado_origen", "certificado_peso"],
      (datos) => datos.origen?.pais_origen,
    ) ?? null;
  const via = inferirViaOperacion(docRows);
  const incoterm =
    primerValorPreferido(
      docRows,
      ["factura_comercial", "proforma", "pedido_compra", "despacho"],
      (datos) => datos.comercial?.incoterm,
    ) ?? null;
  let mercaderia = null;
  const valorFactura =
    primerValorPreferido(
      docRows,
      ["factura_comercial", "proforma", "pedido_compra"],
      (datos) => datos.comercial?.valor_factura,
    ) ?? null;

  for (const d of docRows) {
    const datos = datosDocBench(d);
    if (datos.mercaderia?.mercaderia && !mercaderia) {
      mercaderia = String(datos.mercaderia.mercaderia).slice(0, 120);
    }
  }

  return mockOp({
    docs: docRows.length,
    ncm,
    pais_origen: paisOrigen,
    pais_destino: "Argentina",
    via,
    incoterm,
    mercaderia,
    valor_factura: valorFactura,
  });
}

function itemToDocRow(it, i) {
  return {
    id: `doc-${carpetaId}-${i}`,
    operation_id: `bench-incr-${carpetaId}`,
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
  };
}

function ordenarParaSubida(items) {
  return [...items].sort((a, b) => {
    const ta = PRIORIDAD_TIPO[a.tipo_final ?? a.tipo_nombre] ?? 99;
    const tb = PRIORIDAD_TIPO[b.tipo_final ?? b.tipo_nombre] ?? 99;
    if (ta !== tb) return ta - tb;
    return a.archivo.localeCompare(b.archivo);
  });
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

function lecturaParaHallazgos(item) {
  const bruta = item.lectura_bruta?.trim() ?? "";
  if (bruta.length >= 40) return bruta;
  const partes = [
    item.resumen?.trim(),
    serializarDatosDocumento(item.datos ?? {}),
  ].filter(Boolean);
  return partes.join("\n\n");
}

function quitarFaltantesYaCargados(faltantes, docRows, via) {
  return faltantes.filter((f) => {
    for (const d of docRows) {
      if (docTypeCubreFaltante(d.doc_type, f, via)) return false;
    }
    return true;
  });
}

function sanearFaltantesDocumentacion(faltantes, via) {
  return faltantes.filter((f) => !faltantePerteneceSoloEmbarque(f, via));
}

function fusionarFaltantes(base, extra) {
  const out = [...base];
  for (const f of extra) {
    const nd = f.doc.trim().toLowerCase();
    const dup = out.some(
      (x) =>
        x.doc.trim().toLowerCase() === nd ||
        x.doc.toLowerCase().includes(nd) ||
        nd.includes(x.doc.toLowerCase()),
    );
    if (!dup) out.push(f);
  }
  return out;
}

function tiposPresentes(docRows) {
  return [...new Set(docRows.map((d) => d.doc_type))];
}

function imprimirHallazgos(hallazgos) {
  for (const h of hallazgos) {
    const ref = h.ref ? ` [${h.ref}]` : "";
    console.log(`  · [${h.nivel}] ${h.texto?.slice(0, 130)}${ref}`);
  }
}

function imprimirFaltantes(faltantes) {
  if (!faltantes.length) {
    console.log("  (ninguno)");
    return;
  }
  for (const f of faltantes) {
    const refOk = f.ref && refNormativaValida(f.ref) ? "✓" : "✗";
    console.log(`  · ${f.doc}`);
    console.log(`    ${f.motivo?.slice(0, 120)}`);
    if (f.ref) console.log(`    ref=${f.ref} ${refOk}`);
  }
}

function imprimirLista(titulo, items, max = 140) {
  console.log(`${titulo}: ${items.length}`);
  if (!items.length) {
    console.log("  (ninguna)");
    return;
  }
  for (const s of items) {
    console.log(`  · ${String(s).slice(0, max)}`);
  }
}

async function evaluarPaso(op, item, docRows, paso, etapaEmbarqueAbierta) {
  const docType = item.tipo_final ?? item.tipo_nombre;
  const etapas = etapasDocsIA(docType);
  const t0 = Date.now();

  const hallazgos = await evaluarHallazgosDocumentoSubido(op, {
    docType,
    fileName: item.archivo,
    lectura: lecturaParaHallazgos(item),
    datos: item.datos,
    vacios: item.vacios,
  });

  const derivados = await derivarFaltantesOperacion(op);

  let cruceDoc = null;
  let cruceEmb = null;

  if (etapas.includes("documentacion")) {
    cruceDoc = await cruzarDocumentacionEtapaTexto(op, "documentacion", docRows);
  }

  const abrirEmbarque =
    etapaEmbarqueAbierta ||
    TIPOS_EMBARQUE.has(docType) ||
    docType === "despacho";

  if (abrirEmbarque && etapas.includes("embarque")) {
    cruceEmb = await cruzarDocumentacionEtapaTexto(op, "embarque", docRows);
  }

  const faltantesDoc = quitarFaltantesYaCargados(
    sanearFaltantesDocumentacion(
      fusionarFaltantes(derivados, cruceDoc?.faltantes ?? []),
      op.via,
    ),
    docRows,
    op.via,
  );

  const faltantesEmb = quitarFaltantesYaCargados(
    cruceEmb?.faltantes ?? [],
    docRows,
    op.via,
  );

  const seg = ((Date.now() - t0) / 1000).toFixed(1);

  return {
    paso,
    archivo: item.archivo,
    tipo: docType,
    etapas,
    abrirEmbarque,
    segundos: Number(seg),
    hallazgos,
    cruce_documentacion: cruceDoc
      ? {
          resumen: cruceDoc.resumen,
          faltantes: faltantesDoc,
          inconsistencias: cruceDoc.inconsistencias ?? [],
          alertas: cruceDoc.alertas ?? [],
        }
      : null,
    cruce_embarque: cruceEmb
      ? {
          resumen: cruceEmb.resumen,
          faltantes: faltantesEmb,
          inconsistencias: cruceEmb.inconsistencias ?? [],
          alertas: cruceEmb.alertas ?? [],
        }
      : null,
    operacion: {
      ncm: op.ncm,
      pais_origen: op.pais_origen,
      via: op.via,
      incoterm: op.incoterm,
      valor_factura: op.valor_factura,
    },
    tipos_en_carpeta: tiposPresentes(docRows),
  };
}

async function main() {
  loadEnv();
  process.env.LECTURA_SIN_VALIDAR_VISION = "1";

  if (!iaDocsDisponible()) {
    console.error("Falta ANTHROPIC_API_KEY");
    process.exit(1);
  }

  const items = cargarInterpretacionCache(carpetaId);
  if (!items?.length) {
    console.error(
      `Sin cache de interpretación para carpeta ${carpetaId}. Corré benchmark-interpretacion.mjs ${carpetaId} primero.`,
    );
    process.exit(1);
  }

  const ordenados = ordenarParaSubida(items);
  const resultados = [];
  const docRows = [];
  let etapaEmbarqueAbierta = false;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`CRUCE INCREMENTAL — carpeta ${carpetaId}`);
  console.log("Orden de subida simulado (comercial → origen → transporte → aduana)");
  console.log("=".repeat(60));
  console.log("\nSecuencia planificada:");
  for (const [i, it] of ordenados.entries()) {
    console.log(
      `  ${i + 1}. ${it.archivo} → ${it.tipo_final ?? it.tipo_nombre}`,
    );
  }

  for (const [i, item] of ordenados.entries()) {
    const paso = i + 1;
    if (hastaPaso != null && paso > hastaPaso) break;

    docRows.push(itemToDocRow(item, i));
    const op = inferirOperacion(docRows);

    console.log(`\n${"─".repeat(60)}`);
    console.log(`PASO ${paso}: Subiendo ${item.archivo}`);
    console.log(
      `  Tipo: ${DOC_LABELS[item.tipo_final] ?? item.tipo_final} | En carpeta: ${docRows.length} doc(s)`,
    );
    console.log(
      `  Operación ahora: NCM=${op.ncm ?? "s/d"} | origen=${op.pais_origen ?? "s/d"} | vía=${op.via ?? "s/d"} | Incoterm=${op.incoterm ?? "s/d"}`,
    );

    const r = await evaluarPaso(op, item, docRows, paso, etapaEmbarqueAbierta);
    if (r.abrirEmbarque) etapaEmbarqueAbierta = true;
    resultados.push(r);

    console.log(`\n  Hallazgos de ESTE documento (${r.segundos}s):`);
    imprimirHallazgos(r.hallazgos);

    if (r.cruce_documentacion) {
      console.log("\n  Cruce documentación (solo lo cargado hasta ahora):");
      if (r.cruce_documentacion.resumen) {
        console.log(`  Resumen: ${r.cruce_documentacion.resumen.slice(0, 200)}`);
      }
      console.log("  Faltantes:");
      imprimirFaltantes(r.cruce_documentacion.faltantes);
      imprimirLista("  Inconsistencias", r.cruce_documentacion.inconsistencias);
    } else {
      console.log("\n  Cruce documentación: (no aplica a este tipo en esta etapa)");
    }

    if (r.cruce_embarque) {
      console.log("\n  Cruce embarque (transporte/logística):");
      if (r.cruce_embarque.resumen) {
        console.log(`  Resumen: ${r.cruce_embarque.resumen.slice(0, 200)}`);
      }
      console.log("  Faltantes:");
      imprimirFaltantes(r.cruce_embarque.faltantes);
      imprimirLista("  Inconsistencias", r.cruce_embarque.inconsistencias);
    } else if (!etapaEmbarqueAbierta) {
      console.log(
        "\n  Cruce embarque: omitido (aún no corresponde subir transporte/BL/CRT)",
      );
    }

    if (verbose) {
      console.log("\n  Datos extraídos:");
      console.log(serializarDatosDocumento(item.datos));
    }
  }

  const outPath = path.join(
    process.cwd(),
    `scripts/fixtures/benchmark-cruce-incremental-carpeta-${carpetaId}.json`,
  );
  fs.writeFileSync(
    outPath,
    JSON.stringify({ carpeta: carpetaId, pasos: resultados }, null, 2),
    "utf8",
  );
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Guardado: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
