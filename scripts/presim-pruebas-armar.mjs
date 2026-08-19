/**
 * Prueba el armador contra las declaraciones reales.
 *
 * La prueba es de ida y vuelta: se lee una declaración que la aduana aceptó, se
 * extrae de ella la operación que la habría generado, se la vuelve a armar y se
 * compara bloque por bloque con el original.
 *
 * Los valores salen del archivo **en tiempo de ejecución**: el script no tiene
 * adentro ningún CUIT, importe ni proveedor, así que puede vivir en el repo. Los
 * archivos viven en data/, que git ignora.
 *
 * Uso: npx tsx --require ./scripts/register-server-only-stub.cjs \
 *        scripts/presim-pruebas-armar.mjs
 */
import fs from "node:fs";
import path from "node:path";

import { armarDeclaracion } from "../src/lib/presim/armar.ts";
import { escribirDeclaracion, leerDeclaracion, nartDe, valor } from "../src/lib/presim/archivo.ts";
import { parsearSufijos } from "../src/lib/presim/sufijos.ts";

const DIR = path.join(process.cwd(), "data/Normas/SIM/declaraciones");

if (!fs.existsSync(DIR)) {
  console.log(`No hay declaraciones en ${DIR}. Nada que probar.`);
  process.exit(0);
}

const archivos = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".txt"));
if (!archivos.length) {
  console.log("No hay .txt de declaraciones. Nada que probar.");
  process.exit(0);
}

/* ── de la declaración a la operación que la generó ── */

const numero = (v) => (v === null || v === undefined || v === "" ? undefined : Number(v));

function operacionDesde(d) {
  const ddt = d.bloques.find((b) => b.seccion === "DDT");
  const v = (k) => valor(ddt, k) ?? undefined;

  const deItem = (nart, seccion) =>
    d.bloques.filter((b) => b.seccion === seccion && nartDe(b) === nart);

  const items = d.bloques
    .filter((b) => b.seccion === "ART")
    .map((art) => {
      const nart = valor(art, "NARTEXT") ?? nartDe(art);
      const a = (k) => valor(art, k) ?? undefined;
      return {
        ncm: a("IESPNCE"),
        unidad: a("CARTUNTDCL"),
        cantidadDeclarada: numero(a("QARTUNTDCL")),
        cantidadEstadistica: numero(a("QARTUNTEST")),
        pesoNetoKg: numero(a("QARTKGRNET")),
        fob: numero(a("MARTFOB")),
        flete: numero(a("MARTFLE")),
        seguro: numero(a("MARTASS")),
        coeficiente: numero(a("MARTCOEFIC")),
        uso: a("CARTUSO"),
        paisOrigen: a("CARTPAYORI"),
        paisProcedencia: a("CARTPAYPRC"),
        complementarios: deItem(nart, "CPL").map((c) => ({
          codigo: valor(c, "CCPL"),
          valor: valor(c, "MCPL"),
          tipo: valor(c, "ICPLDIF"),
        })),
        regimenes: deItem(nart, "SRG").map((s) => valor(s, "CSRG")),
        subitems: deItem(nart, "SBT").map((s) => ({
          sufijos: parsearSufijos(valor(s, "CSBTSVL")),
          referencia: valor(s, "IEXT") ?? undefined,
          fob: numero(valor(s, "MSBTFOB")),
          valorUnitario: numero(valor(s, "MSBTUNITAR")),
          cantidadDeclarada: numero(valor(s, "QSBTUNTDCL")),
          qsbtDe: numero(valor(s, "QSBTDE")),
          cantidadEstadistica: numero(valor(s, "QSBTUNTEST")),
        })),
      };
    });

  const bul = d.bloques.find((b) => b.seccion === "BUL");
  const cib = d.bloques.find((b) => b.seccion === "CIB");

  return {
    subregimen: v("ISTA"),
    cuitOperador: v("NDDTIMMIOE"),
    cuitDespachante: v("CDDTAGR"),
    aduana: v("CDDTBUR"),
    referencia: v("IEXT"),
    incoterm: v("CDDTINCOTE"),
    divisa: v("CDDTDEVFOB"),
    fob: numero(v("MDDTFOB")),
    flete: numero(v("MDDTFLE")),
    seguro: numero(v("MDDTASS")),
    nombreExterior: v("LDDTNOMFOD"),
    aduanaSalida: v("CDDTBURDST"),
    paisDestino: v("CDDTPAIDST"),
    deposito: v("CDDTDEP"),
    arriboTransporte: v("DDDTARVTRN"),
    motivo: v("CDDTMOT"),
    convenio: v("NDDTNUMCVT"),
    plazoDias: numero(v("QDDTREGSUS")),
    responsableIva: v("CDDTIVA") !== "N",
    transporte: v("CDDTMDETRN")
      ? {
          cuitTransportista: v("CDDTTRANSP"),
          nombre: v("NDDTIMMTRN"),
          marcas: v("CDDTMRQNUM"),
          medio: v("CDDTMDETRN"),
          pais: v("CDDTPAYTRN"),
          vencimientoEmbarque: v("DDDTVENEMB"),
        }
      : undefined,
    items,
    complementarios: d.bloques
      .filter((b) => b.seccion === "CPL" && nartDe(b) === "0000")
      .map((c) => ({ codigo: valor(c, "CCPL"), valor: valor(c, "MCPL"), tipo: valor(c, "ICPLDIF") })),
    documentos: d.bloques
      .filter((b) => b.seccion === "DVD")
      .map((x) => ({
        codigo: valor(x, "CDVDDOC"),
        referencia: valor(x, "LDVDREFDOC"),
        item: nartDe(x) === "0000" ? undefined : Number(nartDe(x)),
      })),
    bultos: bul
      ? {
          embalaje: valor(bul, "CBULNATEMB"),
          cantidad: numero(valor(bul, "QBULDECLAR")),
          pesoBrutoKg: numero(valor(bul, "QBULUMMBRT")),
          cantidadDescarga: numero(valor(bul, "QBULDSO")),
          enContenedor: valor(bul, "CBULEXT") === "S",
          numerados: valor(bul, "LBULNUMCLS") !== "N",
        }
      : undefined,
    iibb: cib
      ? {
          condicion: valor(cib, "CCIBEXENTO"),
          inscripto: valor(cib, "CCIBINSCON") === "S",
          numero: valor(cib, "CCIBNUMINS") ?? undefined,
        }
      : undefined,
  };
}

/* ── comparación ── */

/** Índice sección+nart+orden → pares, para comparar sin depender del orden. */
function indexar(d) {
  const vistos = new Map();
  const salida = new Map();
  for (const b of d.bloques) {
    const base = `${b.seccion}|${nartDe(b)}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    salida.set(`${base}|${n}`, new Map(b.pares));
  }
  return salida;
}

let fallas = 0;

for (const nombre of archivos.sort()) {
  const texto = fs.readFileSync(path.join(DIR, nombre), "latin1");
  const original = leerDeclaracion(texto);
  const rearmada = armarDeclaracion(operacionDesde(original));

  const a = indexar(original);
  const b = indexar(rearmada);

  const faltan = [];
  const sobran = [];
  const distintos = [];

  for (const [clave, pares] of a) {
    const otro = b.get(clave);
    if (!otro) {
      faltan.push(clave);
      continue;
    }
    for (const [k, v] of pares) {
      if (!otro.has(k)) faltan.push(`${clave} ${k}`);
      else if (otro.get(k) !== v) distintos.push(`${clave} ${k}: «${v}» → «${otro.get(k)}»`);
    }
    for (const k of otro.keys()) if (!pares.has(k)) sobran.push(`${clave} ${k}`);
  }
  for (const clave of b.keys()) if (!a.has(clave)) sobran.push(clave);

  const total = [...a.values()].reduce((s, m) => s + m.size, 0);
  const mal = faltan.length + sobran.length + distintos.length;
  const ok = mal === 0;
  if (!ok) fallas++;

  const sub = valor(original.bloques.find((x) => x.seccion === "DDT"), "ISTA");
  console.log(`${ok ? "✓" : "✗"} ${nombre.padEnd(24)} ${sub}  ${total} claves, ${a.size} bloques`);
  for (const f of faltan.slice(0, 6)) console.log(`     falta   ${f}`);
  for (const s of sobran.slice(0, 6)) console.log(`     sobra   ${s}`);
  for (const d2 of distintos.slice(0, 6)) console.log(`     cambia  ${d2}`);
  if (mal > 18) console.log(`     … y ${mal - 18} diferencias más`);

  // El texto también tiene que poder escribirse sin romperse.
  const escrito = escribirDeclaracion(rearmada);
  if (!escrito.endsWith("\n")) {
    console.log("     ✗ el archivo no termina en salto de línea");
    fallas++;
  }
}

console.log(`\n${fallas === 0 ? "Las declaraciones se reconstruyen igual." : `${fallas} archivos con diferencias.`}`);
process.exit(fallas === 0 ? 0 : 1);
