/**
 * Compara interpretación IA vs extracción heurística del PDF y parquets legales (NCM/VUCE).
 *
 * Uso:
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/audit-interpretacion-parquet.mjs
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/audit-interpretacion-parquet.mjs 4
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { arancelPorNcm } from "../src/lib/clasificador/motor.ts";
import { fichaPosicion } from "../src/lib/vuce.ts";
import { buscarPais } from "../src/lib/cotizador.ts";

const ROOT = process.cwd();
const BASE = path.join(ROOT, "data/a fijarse");
const IDS = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
const CARPETAS = IDS.length ? IDS : ["1", "2", "3", "4", "5"];

function loadPdfText(pdfPath) {
  const r = spawnSync("python3", ["scripts/pdf_texto.py", pdfPath], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(r.stderr || "pdf_texto falló");
  return JSON.parse(r.stdout).texto;
}

function normDigits(s) {
  return String(s ?? "").replace(/\D/g, "");
}

function normUpper(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase();
}

function aliasEnTexto(alias, texto) {
  const a = normUpper(alias).trim();
  if (!a || a.length < 2) return false;
  const re = new RegExp(`(?:^|[^A-Z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^A-Z0-9]|$)`);
  return re.test(normUpper(texto));
}

function extraerHeuristico(texto, tipo) {
  const t = texto;
  const tu = normUpper(t);
  const out = {};

  const ncmMatch =
    t.match(/\b(?:NCM|HS|HTS|N\.?C\.?M\.?|Import HS)[:\s#]*(\d{4}[.\s]?\d{2}[.\s]?\d{2}(?:[.\s]?\d{2})?)/i) ??
    t.match(/\b(\d{4}\.\d{2}\.\d{2}(?:\.\d{2})?)\b/);
  if (ncmMatch) out.ncm = normDigits(ncmMatch[1]).slice(0, 8);

  const inc = t.match(/\b(FOB|FCA|CFR|CIF|CPT|DAP|EXW|DDP|DAT|DPU)\b/i);
  if (inc) out.incoterm = inc[1].toUpperCase();

  const mon = t.match(/\b(USD|US\$|U\.S\.D|BRL|R\$|EUR|CNY)\b/i);
  if (mon) out.moneda = mon[1].replace(/[^A-Z]/gi, "").toUpperCase().replace("US", "USD");

  const montos = [...t.matchAll(/(?:Total|Amount|Valor|Value|FOB|CIF|CFR)[:\s]*(?:USD|US\$)?\s*([\d.,]+)/gi)];
  if (montos.length) out.valor_candidato = montos[montos.length - 1][1];

  const fechas = [...t.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b/g)];
  if (fechas.length) {
    const [, d, m, y] = fechas[0];
    const yy = y.length === 2 ? `20${y}` : y;
    out.fecha_candidata = `${yy}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  if (/COUNTRY OF ORIGIN|ORIGIN CTRY|PA[ÍI]S DE ORIGEM|ORIGEM/i.test(t)) {
    const block = t.match(/(?:COUNTRY OF ORIGIN|ORIGIN CTRY|PA[ÍI]S DE ORIGEM)[:\s]*([^\n]{3,40})/i);
    if (block) out.origen_mencion = block[1].trim();
  }
  if (/SHIP TO|CONSIGNEE|DESTINATION|DESTINO|IMPORTADOR/i.test(t)) {
    const block = t.match(/(?:SHIP TO|CONSIGNEE|DESTINATION|DESTINO)[:\s]*([^\n]{5,80})/i);
    if (block) out.destino_mencion = block[1].trim();
  }

  if (/\bCRT\b|CARRETERA|TRUCK|ROAD\b/i.test(t)) out.via = "terrestre";
  else if (/\bAWB\b|AIRWAY|AIR\b/i.test(t)) out.via = "aerea";
  else if (/\bB\/L\b|\bBL\b|VESSEL|OCEAN\b/i.test(t)) out.via = "maritima";

  if (tipo === "packing_list") {
    delete out.ncm;
    delete out.moneda;
  }

  return out;
}

function cmpCampo(nombre, iaVal, pdfVal, texto) {
  if (iaVal == null || iaVal === "") return { campo: nombre, ia: iaVal, pdf: pdfVal, estado: "ia_vacio" };
  if (pdfVal == null || pdfVal === "") {
    const ok = aliasEnTexto(String(iaVal).slice(0, Math.min(20, String(iaVal).length)), texto);
    return {
      campo: nombre,
      ia: iaVal,
      pdf: pdfVal,
      estado: ok ? "ia_ok_literal" : "ia_sin_ancla",
    };
  }
  const iaN = normDigits(String(iaVal));
  const pdfN = normDigits(String(pdfVal));
  if (iaN.length >= 6 && pdfN.length >= 6) {
    if (iaN === pdfN || iaN.includes(pdfN) || pdfN.includes(iaN)) {
      return { campo: nombre, ia: iaVal, pdf: pdfVal, estado: "coincide" };
    }
  }
  if (normUpper(String(iaVal)) === normUpper(String(pdfVal))) {
    return { campo: nombre, ia: iaVal, pdf: pdfVal, estado: "coincide" };
  }
  if (aliasEnTexto(String(iaVal), texto)) {
    return { campo: nombre, ia: iaVal, pdf: pdfVal, estado: "ia_ok_literal" };
  }
  return { campo: nombre, ia: iaVal, pdf: pdfVal, estado: "diverge" };
}

async function validarNcmParquet(ncmRaw) {
  const ncm8 = normDigits(ncmRaw).slice(0, 8);
  if (ncm8.length < 8) return { ncm8, valido: false, motivo: "NCM incompleta" };
  const [arancel, ficha] = await Promise.all([arancelPorNcm(ncm8), fichaPosicion(ncm8)]);
  if (!arancel && !ficha.ncm8) {
    return { ncm8, valido: false, motivo: "no figura en nomenclador parquet" };
  }
  return {
    ncm8,
    valido: true,
    descripcion: arancel?.descripcion ?? ficha.descripcion ?? null,
    die: arancel?.di ?? null,
    intervenciones: ficha.intervenciones?.length ?? 0,
    antidumping: ficha.antidumping?.length ?? 0,
  };
}

async function auditarDoc(carpeta, item) {
  const pdf = path.join(BASE, carpeta, item.archivo);
  const texto = loadPdfText(pdf);
  const tipo = item.tipo_final ?? item.tipo_nombre ?? "otro";
  const datos = item.datos ?? {};
  const com = datos.comercial ?? {};
  const merc = datos.mercaderia ?? {};
  const orig = datos.origen ?? {};
  const heur = extraerHeuristico(texto, tipo);

  const comparaciones = [
    cmpCampo("ncm", merc.ncm, heur.ncm, texto),
    cmpCampo("incoterm", com.incoterm, heur.incoterm, texto),
    cmpCampo("moneda", com.moneda, heur.moneda, texto),
    cmpCampo("pais_origen", orig.pais_origen, heur.origen_mencion, texto),
    cmpCampo("pais_destino", orig.pais_destino, heur.destino_mencion, texto),
    cmpCampo("via", datos.via, heur.via, texto),
    cmpCampo("valor_factura", com.valor_factura, heur.valor_candidato, texto),
    cmpCampo("fecha_factura", datos.pago?.fecha_factura, heur.fecha_candidata, texto),
  ].filter((c) => c.ia != null && c.ia !== "");

  let parquet = null;
  const ncmRef = merc.ncm ?? heur.ncm;
  if (ncmRef) parquet = await validarNcmParquet(ncmRef);

  const origenPais = orig.pais_origen ? buscarPais(orig.pais_origen) : null;
  const problemas = comparaciones.filter(
    (c) => c.estado === "diverge" || c.estado === "ia_sin_ancla",
  );

  return {
    archivo: item.archivo,
    tipo,
    lectura_chars: texto.length,
    heuristica: heur,
    ia_resumen: {
      ncm: merc.ncm ?? null,
      incoterm: com.incoterm ?? null,
      moneda: com.moneda ?? null,
      valor: com.valor_factura ?? com.valor_fob ?? com.valor_cif ?? null,
      origen: orig.pais_origen ?? null,
      destino: orig.pais_destino ?? null,
      via: datos.via ?? null,
      fecha: datos.pago?.fecha_factura ?? null,
      mercaderia: merc.mercaderia?.slice(0, 80) ?? null,
    },
    vacios_ia: item.vacios ?? [],
    comparaciones,
    problemas,
    parquet,
    origen_preferencia: origenPais?.preferencia ?? null,
    ok: problemas.length === 0 && (parquet?.valido !== false),
  };
}

async function auditarCarpeta(id) {
  const fixture = path.join(ROOT, `scripts/fixtures/benchmark-interpretacion-carpeta-${id}.json`);
  const items = JSON.parse(fs.readFileSync(fixture, "utf8")).items ?? [];
  const docs = [];
  for (const item of items) {
    docs.push(await auditarDoc(id, item));
  }
  return { carpeta: id, ok: docs.filter((d) => d.ok).length, total: docs.length, docs };
}

console.log("AUDITORÍA: IA vs PDF heurístico vs parquet legal\n");
const informes = [];
for (const id of CARPETAS) {
  console.log(`--- Carpeta ${id} ---`);
  const inf = await auditarCarpeta(id);
  informes.push(inf);
  for (const d of inf.docs) {
    const flag = d.ok ? "OK" : "REVISAR";
    console.log(`  [${flag}] ${d.archivo} (${d.tipo})`);
    if (d.parquet?.valido) {
      console.log(
        `    NCM parquet: ${d.parquet.ncm8} · DIE ${d.parquet.die ?? "?"}% · ${d.parquet.intervenciones} intervenciones VUCE`,
      );
    } else if (d.parquet) {
      console.log(`    NCM parquet: ${d.parquet.motivo}`);
    }
    for (const p of d.problemas) {
      console.log(`    · ${p.campo}: IA=«${p.ia}» vs PDF≈«${p.pdf ?? "?"}» (${p.estado})`);
    }
    for (const v of d.vacios_ia) {
      console.log(`    · vacío IA: ${v.campo} — ${v.motivo}`);
    }
  }
  console.log("");
}

const okTotal = informes.reduce((s, i) => s + i.ok, 0);
const nTotal = informes.reduce((s, i) => s + i.total, 0);
const out = path.join(ROOT, "scripts/fixtures/audit-interpretacion-parquet.json");
fs.writeFileSync(out, JSON.stringify(informes, null, 2));
console.log(`${"=".repeat(60)}`);
console.log(`TOTAL: ${okTotal}/${nTotal} sin divergencias vs PDF ni NCM inválida`);
console.log(`Guardado: ${out}`);
