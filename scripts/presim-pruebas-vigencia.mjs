/**
 * Prueba la validación POR FECHA.
 *
 * Las tablas del SIM guardan historia: el mismo código puede haber regido
 * entre 2010 y 2017 y no hoy. Una carpeta de 2015 tiene que validar contra lo
 * que regía en 2015, no contra lo de ahora — si no, revisar el archivo viejo
 * del estudio daría errores falsos en masa.
 *
 * Uso: npx tsx --require ./scripts/register-server-only-stub.cjs \
 *        scripts/presim-pruebas-vigencia.mjs
 */
import { buscar, vigentes, tabla } from "../src/lib/presim/tablas.ts";

let fallas = 0;
const chequear = (nombre, real, esperado) => {
  const ok = real === esperado;
  if (!ok) fallas++;
  console.log(`  ${ok ? "✓" : "✗"} ${nombre.padEnd(58)} ${real}${ok ? "" : `  (esperaba ${esperado})`}`);
};

// Un código con vigencia cerrada: sirve para probar las dos puntas.
const t = tabla("BUR");
const cerrado = t.filas.find((f) => f.hasta && f.desde && f.hasta < new Date());
console.log(`Caso real de BUR con vigencia cerrada: ${cerrado.codigo} «${cerrado.descripcion}»`);
console.log(`   rigió ${cerrado.desde.toLocaleDateString("es-AR")} → ${cerrado.hasta.toLocaleDateString("es-AR")}\n`);

const dentro = new Date(cerrado.desde.getTime() + 24 * 3600 * 1000);

console.log("Vigencias:");
chequear("dentro del período encuentra ESA versión", buscar("BUR", cerrado.codigo, dentro) != null, true);
chequear("la versión hallada es la del período", buscar("BUR", cerrado.codigo, dentro)?.hasta?.getTime() === cerrado.hasta.getTime(), true);

// Un código que existió y hoy NO tiene ninguna versión vigente.
const historicos = new Map();
for (const [cod, vers] of t.porCodigo) {
  const hoy = vers.some((v) => !v.hasta || v.hasta > new Date());
  if (!hoy) historicos.set(cod, vers);
}
console.log(`\nCódigos de BUR sin versión vigente hoy: ${historicos.size}`);
if (historicos.size) {
  const [cod, vers] = [...historicos.entries()][0];
  const cuando = new Date(vers[0].desde.getTime() + 24 * 3600 * 1000);
  console.log(`   probando con ${cod} «${vers[0].descripcion}»`);
  chequear("existe en su época", buscar("BUR", cod, cuando) != null, true);
  chequear("NO existe hoy", buscar("BUR", cod) == null, true);
}

console.log("\nCódigos inexistentes y bordes:");
chequear("un código que nunca existió da null", buscar("BUR", "ZZZZ") == null, true);
chequear("string vacío da null", buscar("BUR", "") == null, true);
chequear("null da null", buscar("BUR", null) == null, true);
chequear("espacios alrededor no importan", buscar("BUR", " 000 ") != null, true);

console.log("\nConteos de vigentes:");
for (const [t2, min] of [["BUR", 50], ["PAY", 200], ["UMM", 40], ["STA", 200], ["DOC", 700]]) {
  const n = vigentes(t2).length;
  chequear(`${t2}: ${n} vigentes (esperado > ${min})`, n > min, true);
}

console.log();
console.log(fallas === 0 ? "TODAS OK" : `${fallas} falla(s)`);
process.exit(fallas === 0 ? 0 : 1);
