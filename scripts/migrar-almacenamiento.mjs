/**
 * Cifra los archivos que quedaron guardados en claro y cierra los permisos de
 * todo el árbol de datos.
 *
 * Es idempotente: lo ya cifrado se saltea, así que se puede correr las veces
 * que haga falta. Cada archivo se reescribe con rename atómico — si el proceso
 * se corta, el original queda intacto y nada se pierde a medias.
 *
 * Uso:
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/migrar-almacenamiento.mjs
 *   ... --seco    → informa qué haría, sin escribir nada
 */
import { chmod, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { cifrar, estaCifrado } from "../src/lib/almacenamiento-seguro.ts";

const SECO = process.argv.includes("--seco");
const RAIZ = path.join(process.cwd(), "data", "clientes");

const n = (b) => (b / 1024).toFixed(1) + " KB";

let yaCifrados = 0;
let migrados = 0;
let bytesAntes = 0;
let bytesDespues = 0;
let permisos = 0;
const fallos = [];

/** Los archivos de un cliente viven en <raiz>/<userId>/archivos/<storedName>. */
async function migrarCliente(userId) {
  const dir = path.join(RAIZ, userId, "archivos");
  let nombres;
  try {
    nombres = await readdir(dir);
  } catch {
    return; // el cliente no tiene archivos subidos
  }

  for (const storedName of nombres) {
    const ruta = path.join(dir, storedName);
    const info = await stat(ruta).catch(() => null);
    if (!info?.isFile()) continue;

    const contenido = await readFile(ruta);
    if (estaCifrado(contenido)) {
      yaCifrados++;
      continue;
    }

    bytesAntes += contenido.length;
    if (SECO) {
      migrados++;
      console.log(`  cifraría  ${storedName} (${n(contenido.length)})`);
      continue;
    }

    try {
      // El AAD ata el archivo a este cliente y a este nombre: tienen que ser
      // exactamente los mismos con los que después se va a leer.
      const cifrado = cifrar(contenido, userId, storedName);
      const tmp = `${ruta}.migrando`;
      await writeFile(tmp, cifrado, { mode: 0o600 });
      await rename(tmp, ruta);
      bytesDespues += cifrado.length;
      migrados++;
      console.log(
        `  ✓ ${storedName} · ${n(contenido.length)} → ${n(cifrado.length)}`,
      );
    } catch (e) {
      fallos.push(`${userId}/${storedName}: ${e.message}`);
      await unlink(`${ruta}.migrando`).catch(() => {});
    }
  }
}

/** Cierra permisos de todo lo que cuelga del árbol de datos. */
async function cerrarPermisos(dir) {
  let entradas;
  try {
    entradas = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  if (!SECO) await chmod(dir, 0o700).catch(() => {});
  permisos++;
  for (const e of entradas) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await cerrarPermisos(full);
    } else if (e.isFile()) {
      if (!SECO) await chmod(full, 0o600).catch(() => {});
      permisos++;
    }
  }
}

console.log(SECO ? "SIMULACIÓN (no se escribe nada)\n" : "Migrando…\n");

let clientes;
try {
  clientes = await readdir(RAIZ);
} catch {
  console.log("No hay data/clientes todavía: nada que migrar.");
  process.exit(0);
}

for (const userId of clientes) {
  const info = await stat(path.join(RAIZ, userId)).catch(() => null);
  if (info?.isDirectory()) await migrarCliente(userId);
}

await cerrarPermisos(RAIZ);

console.log("\n" + "─".repeat(56));
console.log(`Cifrados ahora     : ${migrados}`);
console.log(`Ya estaban cifrados: ${yaCifrados}`);
if (migrados && !SECO) {
  const dif = bytesDespues - bytesAntes;
  const pct = bytesAntes ? ((dif / bytesAntes) * 100).toFixed(1) : "0";
  console.log(
    `Peso               : ${n(bytesAntes)} → ${n(bytesDespues)} (${dif >= 0 ? "+" : ""}${pct}%)`,
  );
}
console.log(`Permisos ajustados : ${permisos} archivos y carpetas`);
if (fallos.length) {
  console.log(`\n⚠ Fallaron ${fallos.length}:`);
  for (const f of fallos) console.log("  - " + f);
  process.exit(1);
}
