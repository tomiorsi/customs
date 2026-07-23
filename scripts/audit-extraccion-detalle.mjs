/**
 * Auditoría detallada: datos interpretados vs transcripción PDF.
 * No solo "¿está en el texto?" sino reglas semánticas por tipo de documento.
 *
 * Uso:
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/audit-extraccion-detalle.mjs
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/audit-extraccion-detalle.mjs 2
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  esCargoTransportePorPesoYTarifa,
  montoAncladoEnTexto,
  parseMontoDocumento,
  transporteDeclaraValorMercaderia,
  transporteSinValorComercialDeclarado,
} from "../src/lib/equivalencias-campo.ts";

const ROOT = process.cwd();
const BASE = path.join(ROOT, "data/a fijarse");
const carpetas = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
const IDS = carpetas.length ? carpetas : ["1", "2", "3", "4", "5"];

function loadPdfText(pdfPath) {
  const r = spawnSync("python3", ["scripts/pdf_texto.py", pdfPath], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(r.stderr || "pdf_texto falló");
  return JSON.parse(r.stdout).texto;
}

function norm(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase();
}

function montoEnTexto(valor, texto) {
  return montoAncladoEnTexto(valor, texto);
}

function fragEnTexto(frag, texto, min = 4) {
  const f = norm(frag).trim();
  if (!f || f.length < min) return false;
  return norm(texto).includes(f);
}

function esTransporte(tipo, texto) {
  if (tipo === "transporte" || tipo === "transporte_borrador") return true;
  const tu = norm(texto);
  if (/\bNVD\b/.test(tu) && /\bNCV\b/.test(tu)) return true;
  return /\b(AWB|HAWB|AIR\s*WAYBILL|BILL\s+OF\s+LADING|B\/L\b|CRT\b|CMR\b)/i.test(texto);
}

function esFactura(tipo) {
  return tipo === "factura_comercial" || tipo === "proforma";
}

function hallazgosDoc(item, texto) {
  const tipo = item.tipo_final ?? item.tipo_nombre ?? "otro";
  const d = item.datos ?? {};
  const c = d.comercial ?? {};
  const m = d.mercaderia ?? {};
  const o = d.origen ?? {};
  const p = d.pago ?? {};
  const t = d.transporte ?? {};
  const issues = [];
  const ok = [];
  const vacios = item.vacios ?? [];

  const addIssue = (campo, severidad, detalle) =>
    issues.push({ campo, severidad, detalle });
  const addOk = (campo, detalle) => ok.push({ campo, detalle });

  // --- Comercial ---
  if (c.valor_factura) {
    if (esTransporte(tipo, texto)) {
      if (transporteSinValorComercialDeclarado(texto)) {
        addIssue(
          "comercial.valor_factura",
          "CRITICO",
          `AWB/BL con NVD/NCV o sin valor propio: no debe tener valor_factura (${c.valor_factura})`,
        );
      } else if (
        m.peso_neto &&
        esCargoTransportePorPesoYTarifa(String(m.peso_neto), String(c.valor_factura), texto)
      ) {
        addIssue(
          "comercial.valor_factura",
          "CRITICO",
          `${c.valor_factura} es cargo peso×tarifa → debe ser flete, no valor_factura`,
        );
      } else if (montoEnTexto(c.valor_factura, texto) && !transporteDeclaraValorMercaderia(texto)) {
        const ctxFlete = /freight|flete|prepaid|collect|charges?|portes/i.test(texto);
        if (ctxFlete) {
          addIssue(
            "comercial.valor_factura",
            "ALTO",
            `En transporte, ${c.valor_factura} puede ser cargo/flete mal etiquetado`,
          );
        }
      }
    }
    if (!montoEnTexto(c.valor_factura, texto) && esFactura(tipo)) {
      addIssue(
        "comercial.valor_factura",
        "ALTO",
        `Total ${c.valor_factura} no anclado claramente en transcripción`,
      );
    } else if (c.valor_factura && esFactura(tipo)) {
      addOk("comercial.valor_factura", c.valor_factura);
    }
  } else if (esFactura(tipo)) {
    const tieneTotal = /total|amount due|invoice total|valor total/i.test(texto);
    if (tieneTotal) {
      addIssue("comercial.valor_factura", "ALTO", "Factura con total en PDF pero sin valor_factura extraído");
    }
  }

  if (esTransporte(tipo, texto) && transporteSinValorComercialDeclarado(texto) && !c.valor_factura) {
    addOk("comercial.valor_factura", "omitido correctamente (NVD/NCV o as per invoice)");
  }

  if (c.flete) {
    if (esFactura(tipo) && !/freight|flete|shipping/i.test(texto)) {
      addIssue("comercial.flete", "MEDIO", `Flete ${c.flete} en factura sin contexto flete en PDF`);
    }
    if (esTransporte(tipo, texto) && m.peso_neto) {
      const pn = parseMontoDocumento(String(m.peso_neto));
      const fl = parseMontoDocumento(String(c.flete));
      if (pn != null && fl != null && Math.abs(pn - fl) < 0.05) {
        addIssue("comercial.flete", "CRITICO", `Flete ${c.flete} = peso neto → confusión columna AWB`);
      }
    }
    if (!montoEnTexto(c.flete, texto)) {
      addIssue("comercial.flete", "ALTO", `Flete ${c.flete} no anclado en texto`);
    }
  }

  if (c.moneda && !/\bUSD\b|US\$|U\$S|DOLLAR|BRL|R\$|EUR/i.test(norm(texto))) {
    addIssue("comercial.moneda", "BAJO", `Moneda ${c.moneda} no literal en PDF (fundamentación suele quitarla)`);
  }

  if (c.incoterm && !norm(texto).includes(norm(c.incoterm).slice(0, 3))) {
    addIssue("comercial.incoterm", "MEDIO", `Incoterm ${c.incoterm} no hallado en texto`);
  }

  // --- Mercadería ---
  for (const [campo, val] of [
    ["mercaderia.ncm", m.ncm],
    ["mercaderia.cantidad", m.cantidad],
    ["mercaderia.peso_neto", m.peso_neto],
    ["mercaderia.peso_bruto", m.peso_bruto],
  ]) {
    if (!val) continue;
    const vs = String(val);
    if (campo === "mercaderia.peso_bruto" && esTransporte(tipo, texto) && m.peso_neto) {
      if (esCargoTransportePorPesoYTarifa(String(m.peso_neto), vs, texto)) {
        addIssue(campo, "CRITICO", `${vs} es total cargo AWB, no peso bruto`);
        continue;
      }
    }
    if (!montoEnTexto(vs, texto) && !fragEnTexto(vs.replace(/\s*kg\s*/i, ""), texto, 3)) {
      addIssue(campo, "ALTO", `${vs} no anclado en transcripción`);
    }
  }

  if (m.ncm) {
    const dig = String(m.ncm).replace(/\D/g, "");
    if (dig.length < 8) addIssue("mercaderia.ncm", "ALTO", `NCM ${m.ncm} inválido`);
  }

  // --- Origen ---
  if (o.pais_origen?.includes("Argentina") && esFactura(tipo)) {
    if (/BUYER|SHIP\s+TO|SOLD\s+TO|CONSIGNEE/i.test(norm(texto)) && !/COUNTRY\s+OF\s+ORIGIN[^\n]{0,80}ARGENTINA/i.test(norm(texto))) {
      addIssue("origen.pais_origen", "ALTO", "Argentina como origen pero parece domicilio comprador");
    }
  }

  if (esFactura(tipo) && !o.pais_origen && /COUNTRY\s+OF\s+ORIGIN|ORIGIN\s+CTRY/i.test(norm(texto))) {
    addIssue("origen.pais_origen", "MEDIO", "PDF tiene Country of Origin pero no se extrajo pais_origen");
  }

  // --- Pago ---
  if (p.fecha_factura && !texto.includes(p.fecha_factura)) {
    const iso = p.fecha_factura;
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [, y, mo, d] = m;
      const patrones = [`${d}/${mo}/${y}`, `${mo}/${d}/${y.slice(2)}`];
      if (!patrones.some((pt) => texto.includes(pt))) {
        addIssue("pago.fecha_factura", "MEDIO", `Fecha ${p.fecha_factura} no verificada en texto`);
      }
    }
  }

  // --- Partes ---
  for (const parte of d.partes ?? []) {
    if (parte.nombre && !fragEnTexto(parte.nombre.slice(0, 12), texto, 6)) {
      addIssue(`partes.${parte.etiqueta}`, "MEDIO", `«${parte.nombre}» no hallado en PDF`);
    }
  }

  // --- Vacíos del pipeline (señales) ---
  for (const v of vacios) {
    if (/valor_factura|flete|peso_bruto|peso_neto|pais_origen/.test(v.campo)) {
      addOk(`vacío:${v.campo}`, v.motivo);
    }
  }

  // --- Campos ausentes sospechosos en facturas ---
  if (esFactura(tipo)) {
    if (!d.partes?.length) addIssue("partes", "ALTO", "Factura sin partes extraídas");
    if (!c.incoterm && /\bFCA\b|\bFOB\b|\bCIF\b|\bEXW\b/i.test(texto)) {
      addIssue("comercial.incoterm", "MEDIO", "Incoterm en PDF pero no extraído");
    }
  }

  return { archivo: item.archivo, tipo, issues, ok, vacios };
}

const informe = { generado: new Date().toISOString(), carpetas: [] };

for (const id of IDS) {
  const fixture = path.join(ROOT, `scripts/fixtures/benchmark-interpretacion-carpeta-${id}.json`);
  if (!fs.existsSync(fixture)) continue;
  const items = JSON.parse(fs.readFileSync(fixture, "utf8")).items ?? [];
  const docs = [];
  console.log(`\n${"=".repeat(70)}\nCARPETA ${id}\n${"=".repeat(70)}`);

  for (const item of items) {
    const pdf = path.join(BASE, id, item.archivo);
    const texto = loadPdfText(pdf);
    const r = hallazgosDoc(item, texto);
    docs.push(r);

    const crit = r.issues.filter((i) => i.severidad === "CRITICO");
    const alt = r.issues.filter((i) => i.severidad === "ALTO");
    const flag = crit.length ? "🔴" : alt.length ? "🟠" : r.issues.length ? "🟡" : "🟢";
    console.log(`\n${flag} ${item.archivo} (${r.tipo})`);

    const d = item.datos ?? {};
    const lineas = [];
    if (d.comercial) {
      const c = d.comercial;
      if (c.valor_factura) lineas.push(`  valor_factura: ${c.valor_factura}`);
      if (c.valor_fob) lineas.push(`  valor_fob: ${c.valor_fob}`);
      if (c.flete) lineas.push(`  flete: ${c.flete}`);
      if (c.incoterm) lineas.push(`  incoterm: ${c.incoterm}`);
      if (c.moneda) lineas.push(`  moneda: ${c.moneda}`);
    }
    if (d.mercaderia) {
      const m = d.mercaderia;
      if (m.ncm) lineas.push(`  ncm: ${m.ncm}`);
      if (m.cantidad) lineas.push(`  cantidad: ${m.cantidad}`);
      if (m.peso_neto) lineas.push(`  peso_neto: ${m.peso_neto}`);
      if (m.peso_bruto) lineas.push(`  peso_bruto: ${m.peso_bruto}`);
    }
    if (d.origen) lineas.push(`  origen: ${[d.origen.pais_origen, d.origen.pais_destino].filter(Boolean).join(" → ")}`);
    if (d.pago?.fecha_factura) lineas.push(`  fecha_factura: ${d.pago.fecha_factura}`);
    if (lineas.length) console.log(lineas.join("\n"));

    for (const i of r.issues) {
      console.log(`  [${i.severidad}] ${i.campo}: ${i.detalle}`);
    }
    if (!r.issues.length && r.ok.length) {
      console.log(`  OK — ${r.ok.slice(0, 3).map((x) => x.campo).join(", ")}`);
    }
  }

  informe.carpetas.push({ id, docs });
}

const out = path.join(ROOT, "scripts/fixtures/audit-extraccion-detalle.json");
fs.writeFileSync(out, JSON.stringify(informe, null, 2), "utf8");

const totalCrit = informe.carpetas.flatMap((c) => c.docs).flatMap((d) => d.issues).filter((i) => i.severidad === "CRITICO").length;
const totalAlt = informe.carpetas.flatMap((c) => c.docs).flatMap((d) => d.issues).filter((i) => i.severidad === "ALTO").length;
console.log(`\n${"=".repeat(70)}`);
console.log(`RESUMEN: ${totalCrit} críticos, ${totalAlt} altos — guardado ${out}`);
