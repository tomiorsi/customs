/**
 * Verifica el pre-SIM contra declaraciones REALES generadas por Sintia.
 *
 * Dos pruebas por archivo:
 *   1. Ida y vuelta: leer → escribir tiene que devolver lo mismo. Si el
 *      lector pierde un dato o el escritor cambia el formato, salta acá.
 *   2. Validación: los hallazgos contra GEN y las tablas del SIM.
 *
 * Uso: npx tsx --require ./scripts/register-server-only-stub.cjs \
 *        scripts/presim-verificar.mjs <archivo.txt> [...]
 *
 * Los archivos de muestra NO están en el repo: traen CUIT y valores reales.
 */
import fs from "node:fs";
import path from "node:path";
import { leerDeclaracion, escribirDeclaracion, ordenarDeclaracion, subregimenDe, bloques }
  from "../src/lib/presim/archivo.ts";
import { validarDeclaracion, resumirHallazgos } from "../src/lib/presim/validar.ts";
import { leerFilas } from "../src/lib/parquet-store.ts";

const archivos = process.argv.slice(2).filter((a) => a.endsWith(".txt"));
if (!archivos.length) {
  console.error("Pasar al menos un .txt de declaración.");
  process.exit(1);
}

// El nomenclador, para validar las posiciones.
const ncmFilas = await leerFilas(
  path.join(process.cwd(), "data/Nomenclatura/ncm.parquet"),
  ["codigo"],
);
const NCM = new Set(ncmFilas.map((r) => String(r.codigo ?? "").trim()));
console.log(`Nomenclador: ${NCM.size} posiciones\n`);

/** Compara ignorando saltos y espacios de más: lo que importa es el contenido. */
const normalizar = (t) =>
  t.replace(/\r\n/g, "\n").split("\n").map((l) => l.trimEnd()).filter((l) => l !== "").join("\n");

let fallas = 0;

for (const a of archivos) {
  const original = fs.readFileSync(a, "latin1");
  const d = leerDeclaracion(original);
  const sub = subregimenDe(d);
  const nItems = bloques(d, "ART").length;
  console.log(`━━━ ${path.basename(a)}  ·  ${sub}  ·  ${nItems} ítem(s)  ·  ${d.bloques.length} bloques`);

  // 1) ida y vuelta
  const vuelta = escribirDeclaracion(d);
  const igual = normalizar(original) === normalizar(vuelta);
  console.log(`   ida y vuelta: ${igual ? "IGUAL ✓" : "DIFIERE ✗"}`);
  if (!igual) {
    fallas++;
    const a1 = normalizar(original).split("\n");
    const a2 = normalizar(vuelta).split("\n");
    for (let i = 0; i < Math.max(a1.length, a2.length); i++) {
      if (a1[i] !== a2[i]) {
        console.log(`      línea ${i + 1}:`);
        console.log(`        original: ${JSON.stringify(a1[i])}`);
        console.log(`        nuestro : ${JSON.stringify(a2[i])}`);
        break;
      }
    }
  }

  // 2) el ordenador no debe alterar un archivo que ya viene bien ordenado
  const ord = escribirDeclaracion(ordenarDeclaracion(d));
  console.log(`   orden de secciones: ${normalizar(ord) === normalizar(vuelta) ? "respetado ✓" : "CAMBIA ✗"}`);
  if (normalizar(ord) !== normalizar(vuelta)) fallas++;

  // 3) validación
  const h = validarDeclaracion(d, { ncmValido: (n) => NCM.has(n) });
  const r = resumirHallazgos(h);
  console.log(`   validación: ${r.errores} error(es), ${r.avisos} aviso(s) → ${r.emitible ? "EMITIBLE" : "NO EMITIBLE"}`);
  for (const x of h.slice(0, 8)) {
    console.log(`      [${x.nivel}] ${x.seccion}/${x.nart} ${x.clave}: ${x.detalle}`);
  }
  if (h.length > 8) console.log(`      … y ${h.length - 8} más`);
  console.log();
}

console.log(fallas === 0 ? "TODO OK" : `${fallas} prueba(s) fallaron`);
process.exit(fallas === 0 ? 0 : 1);
