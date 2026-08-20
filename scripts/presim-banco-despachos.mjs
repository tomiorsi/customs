/**
 * El pre-SIM contra los 13.467 despachos reales del estudio.
 *
 * Las otras pruebas usan seis archivos. Esta usa el archivo entero: cada
 * despacho que el estudio presentó y la aduana aceptó se vuelve a armar con
 * nuestro motor y se valida. Si un código, un subrégimen o una posición de
 * hace quince años no pasa nuestro validador, el problema es nuestro — esa
 * declaración se oficializó.
 *
 * **Qué prueba y qué no.** El export de Sintia descartó a propósito las
 * columnas sensibles: no hay CUIT, ni FOB, ni flete, ni precios. Así que los
 * importes van con valores de relleno y **no se está probando la aritmética**.
 * Lo que sí se prueba, que es lo que estaba sin probar a esta escala:
 *
 *  - Que los códigos de 13.467 despachos —subrégimen, aduana, aduana de
 *    salida, Incoterm, país, unidad, posición— existan en nuestras tablas y
 *    **rigieran el año del despacho**. El más viejo es de 2011, así que esto
 *    ejercita la lógica de vigencias de verdad.
 *  - Que el armador produzca una declaración estructuralmente sana con **N
 *    ítems y N subítems**, no con uno.
 *  - Que la ida y vuelta —escribir y volver a leer— dé idéntico.
 *  - Que nuestro elector de subrégimen coincida con el que se usó.
 *
 * No llama a la IA. Es todo parquet y CSV.
 *
 * Uso:
 *   npx tsx --require ./scripts/register-server-only-stub.cjs \
 *     scripts/presim-banco-despachos.mjs [--n 500] [--errores 20]
 */
import fs from "node:fs";
import path from "node:path";

import { armarDeclaracion } from "../src/lib/presim/armar.ts";
import { escribirDeclaracion, leerDeclaracion } from "../src/lib/presim/archivo.ts";
import { parsearSufijos } from "../src/lib/presim/sufijos.ts";
import { validarDeclaracion } from "../src/lib/presim/validar.ts";
import { tabla as tablaSim } from "../src/lib/presim/tablas.ts";

/**
 * Desde cuándo tenemos historia de cada subrégimen.
 *
 * Hace falta para separar dos cosas que el validador reporta igual y no lo
 * son: un código que **no existe** (problema de verdad) y un código que existe
 * pero cuya vigencia más vieja en nuestra tabla **arranca después** del
 * despacho. Lo segundo no es un error de la declaración ni del validador: es
 * que el Kit no guarda historia infinita. `EC01` arranca el 01/07/2010, así
 * que un despacho de 2009 nunca va a validar por más correcto que fuera.
 */
const DESDE = new Map();
try {
  for (const [cod, versiones] of tablaSim("STA").porCodigo) {
    const fechas = versiones.map((v) => v.desde).filter(Boolean);
    if (fechas.length) DESDE.set(cod, new Date(Math.min(...fechas.map((d) => d.getTime()))));
  }
} catch {
  /* sin tabla no se clasifica */
}

const DIR = path.join(process.cwd(), "data/Normas/SIM/sintia");

const arg = (n, def) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : def;
};
const N = arg("n", 0);
const MAX_ERRORES = arg("errores", 15);

/* ── lectura ── */

function separar(linea) {
  const out = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (comillas) {
      if (c === '"') {
        if (linea[i + 1] === '"') { campo += '"'; i++; } else comillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') comillas = true;
    else if (c === ",") { out.push(campo); campo = ""; }
    else campo += c;
  }
  out.push(campo);
  return out;
}

function tabla(nombre) {
  const lineas = fs.readFileSync(path.join(DIR, `${nombre}.csv`), "utf8").split(/\r?\n/);
  const cols = separar(lineas[0].replace(/^﻿/, ""));
  const filas = [];
  for (let i = 1; i < lineas.length; i++) {
    if (!lineas[i].trim()) continue;
    const c = separar(lineas[i]);
    filas.push(Object.fromEntries(cols.map((k, j) => [k, (c[j] ?? "").trim()])));
  }
  return filas;
}

/* ── armado de los despachos ── */

/**
 * Importes de relleno.
 *
 * El export no los trae, y hacen falta porque el armador los pide. Se usan
 * valores fijos y distintos de cero para que la declaración salga completa,
 * pero **no significan nada**: acá no se mide plata.
 */
const RELLENO = { fob: 1000, flete: 100, seguro: 10, peso: 100, cantidad: 1 };

function armarBanco() {
  const carat = tabla("link_caratula");
  const items = tabla("link_item").filter((x) => x.ncm && x.id !== "0");
  const subs = tabla("link_subitems").filter((x) => x.IDARTICULO);
  const desp = tabla("desp_subitems");

  const porArticulo = new Map();
  for (const d of desp) {
    const a = d.IDARTICULO?.trim();
    if (a && !porArticulo.has(a)) porArticulo.set(a, d);
  }

  const itemsPorDesp = new Map();
  for (const x of items) {
    const arr = itemsPorDesp.get(x.interno) ?? [];
    arr.push(x);
    itemsPorDesp.set(x.interno, arr);
  }
  const subsPorDesp = new Map();
  for (const x of subs) {
    const arr = subsPorDesp.get(x.interno) ?? [];
    arr.push(x);
    subsPorDesp.set(x.interno, arr);
  }

  const despachos = [];
  for (const c of carat) {
    const its = itemsPorDesp.get(c.interno);
    if (!its?.length) continue;

    // Los subítems se atan a su ítem por el `id`, que es el número de ítem.
    const subsDe = new Map();
    for (const s of subsPorDesp.get(c.interno) ?? []) {
      const arr = subsDe.get(s.id) ?? [];
      arr.push(s);
      subsDe.set(s.id, arr);
    }

    const itemsSim = its.map((it) => {
      const mios = (subsDe.get(it.id) ?? [])
        .map((s) => porArticulo.get(s.IDARTICULO))
        .filter(Boolean);
      const primero = mios[0];
      return {
        ncm: it.ncm,
        // La unidad y el país salen del subítem, que es donde el export los
        // dejó. Sin subítem enlazado se usa un valor válido de relleno.
        unidad: primero?.IdUnidad || "07",
        cantidadDeclarada: Number(primero?.Cantidad) || RELLENO.cantidad,
        cantidadEstadistica: Number(primero?.Cantidad) || RELLENO.cantidad,
        pesoNetoKg: RELLENO.peso,
        fob: RELLENO.fob,
        paisOrigen: primero?.IdPais || "203",
        paisProcedencia: primero?.idpaisproc || primero?.IdPais || "203",
        subitems: mios.length
          ? mios.map((s) => ({ sufijos: parsearSufijos(s.SUFIJOS) }))
          : [{ sufijos: [] }],
      };
    });

    // Fin de año: el export solo trae el año. Se toma el 31/12 y no el 30/06
    // porque un subrégimen que entró en vigencia a mitad de ese año igual
    // estuvo vigente para despachos de ese año — y al revés casi no pasa.
    const anio = Number(c.anio) || 2020;
    despachos.push({
      interno: c.interno,
      real: { subregimen: c.idsubreg, anio },
      op: {
        subregimen: c.idsubreg,
        cuitOperador: "30000000000",
        cuitDespachante: "30000000001",
        aduana: c.idaduana,
        referencia: c.interno,
        incoterm: c.idcondiciondeventa,
        divisa: "DOL",
        fob: RELLENO.fob * itemsSim.length,
        flete: RELLENO.flete,
        seguro: RELLENO.seguro,
        aduanaSalida: c.idaduanasal || undefined,
        paisDestino: c.idpaisdestino || undefined,
        motivo: c.motivodestsuspensiva || undefined,
        plazoDias: Number(c.plazoautorizacion) || undefined,
        items: itemsSim,
        fecha: new Date(anio, 11, 31),
      },
    });
  }
  return despachos;
}

/* ── corrida ── */

const todos = armarBanco();
const banco = N && N < todos.length ? todos.slice(0, N) : todos;

console.log(`Banco: ${todos.length.toLocaleString("es-AR")} despachos reales del archivo del estudio.`);
if (banco.length < todos.length) console.log(`Se corren los primeros ${banco.length.toLocaleString("es-AR")}.`);
const itemsTot = banco.reduce((s, d) => s + d.op.items.length, 0);
console.log(`${itemsTot.toLocaleString("es-AR")} ítems en total. Los importes son de relleno: acá no se mide plata.\n`);

let sinError = 0;
let idaYVuelta = 0;
/** Cuántos despachos y cuántos limpios hay de cada subrégimen. */
const porSubregimen = new Map();
let rotos = 0;
let fueraDeHistoria = 0;
let subregDesconocido = 0;
/** Códigos de cuatro letras que existen pero no son destinaciones. */
const noDestinacion = new Set();
/** Códigos con menos de cuatro letras: carga incompleta en Sintia. */
const truncados = new Set();
const porClave = new Map();
const ejemplos = [];
const t0 = Date.now();

for (let i = 0; i < banco.length; i++) {
  const d = banco[i];
  try {
    const dec = armarDeclaracion(d.op);
    const texto = escribirDeclaracion(dec);
    // Ida y vuelta: escribir y volver a leer tiene que dar lo mismo.
    if (escribirDeclaracion(leerDeclaracion(texto)) === texto) idaYVuelta++;

    let errores = validarDeclaracion(dec, { fecha: d.op.fecha }).filter((h) => h.nivel === "error");
    const sub = d.real.subregimen;
    porSubregimen.set(sub, porSubregimen.get(sub) ?? { total: 0, ok: 0 });
    porSubregimen.get(sub).total++;

    // El error de subrégimen se clasifica antes de contarlo como falla nuestra.
    const errSub = errores.find((e) => e.clave === "ISTA");
    if (errSub) {
      const desde = DESDE.get(d.real.subregimen);
      if (!desde) {
        subregDesconocido++;
        (d.real.subregimen.length === 4 ? noDestinacion : truncados).add(d.real.subregimen);
      }
      else if (d.op.fecha < desde) {
        fueraDeHistoria++;
        errores = errores.filter((e) => e !== errSub);
      }
    }

    if (!errores.length) { sinError++; porSubregimen.get(d.real.subregimen).ok++; }
    else {
      for (const e of errores) {
        const k = `${e.seccion}.${e.clave}`;
        porClave.set(k, (porClave.get(k) ?? 0) + 1);
      }
      if (ejemplos.length < MAX_ERRORES) {
        ejemplos.push({ interno: d.interno, sub: d.real.subregimen, anio: d.real.anio, e: errores[0] });
      }
    }
  } catch (err) {
    rotos++;
    if (ejemplos.length < MAX_ERRORES) {
      ejemplos.push({ interno: d.interno, sub: d.real.subregimen, anio: d.real.anio, e: { detalle: `ROMPIÓ: ${err.message}` } });
    }
  }

  if ((i + 1) % 1000 === 0 || i + 1 === banco.length) {
    process.stdout.write(
      `\r  ${i + 1}/${banco.length}  sin errores ${((sinError / (i + 1)) * 100).toFixed(1)}%  ${((Date.now() - t0) / 1000).toFixed(0)}s`,
    );
  }
}
console.log("\n");

/**
 * Cuánto respaldo real tiene cada subrégimen.
 *
 * Importa porque el estudio que nos pasa los archivos no hace todas las
 * destinaciones, así que hay subregímenes que nunca vimos en un `.txt` del
 * Kit. Lo que sí hay es el archivo de despachos, y ahí sí aparecen: saber
 * cuántos de cada uno pasan es la diferencia entre «no lo probamos» y «lo
 * probamos contra noventa y siete despachos reales».
 */
console.log("  Por subrégimen (los que el motor sabe emitir):\n");
const EMITIBLES = new Set([
  "IC01","IC03","IC04","IC05","IC06","IT01","IT04","IT06","IT14","IT15","IT16",
  "IDA4","EC01","EC02","EC03","EC04","ET01","ET02",
  "ZFI1","ZFI3","ZFI4","ZFI5","ZFI7","ZFI8","ZFE1","ZFE2","ZFE3","ZFE4","ZFE5","ZFE6",
]);
const filas = [...porSubregimen.entries()]
  .filter(([k]) => EMITIBLES.has(k))
  .sort((a, b) => b[1].total - a[1].total);
for (const [sub, v] of filas) {
  const p = ((v.ok / v.total) * 100).toFixed(1);
  console.log(`    ${sub}  ${String(v.total).padStart(5)} despachos   ${p.padStart(5)}% sin errores`);
}
const sinNinguno = [...EMITIBLES].filter((k) => !porSubregimen.has(k)).sort();
if (sinNinguno.length) {
  console.log(`\n    Sin un solo despacho en el archivo: ${sinNinguno.join(", ")}`);
}
console.log("");

const pct = (x) => ((x / banco.length) * 100).toFixed(2);
console.log(`  declaraciones sin un solo error:  ${sinError.toLocaleString("es-AR")} / ${banco.length.toLocaleString("es-AR")}  (${pct(sinError)}%)`);
console.log(`  ida y vuelta idéntica:            ${idaYVuelta.toLocaleString("es-AR")}  (${pct(idaYVuelta)}%)`);
if (rotos) console.log(`  rompieron el armador:             ${rotos}`);
console.log("\n  Descontado aparte, porque no son fallas del pre-SIM:");
console.log(`    despachos anteriores a la historia de STA: ${fueraDeHistoria.toLocaleString("es-AR")}`);
console.log(`      (el Kit no guarda vigencias infinitas: EC01 arranca el 01/07/2010)`);
console.log(`    códigos que no son subregímenes de destinación: ${subregDesconocido.toLocaleString("es-AR")}`);
if (noDestinacion.size) console.log(`      licencias y trámites: ${[...noDestinacion].sort().join(", ")}`);
if (truncados.size) console.log(`      cargados incompletos en Sintia: ${[...truncados].sort().join(", ")}`);

if (porClave.size) {
  console.log("\n  Errores por clave:");
  for (const [k, n] of [...porClave.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`    ${k.padEnd(22)} ${n.toLocaleString("es-AR")}`);
  }
  console.log("\n  Ejemplos:");
  for (const x of ejemplos.slice(0, MAX_ERRORES)) {
    console.log(`    ${x.interno.padEnd(12)} ${String(x.sub).padEnd(5)} ${x.anio}  ${x.e.detalle}`);
  }
}

console.log(`\n  ${((Date.now() - t0) / 1000).toFixed(0)}s, sin costo de IA.`);
process.exit(sinError === banco.length ? 0 : 1);
