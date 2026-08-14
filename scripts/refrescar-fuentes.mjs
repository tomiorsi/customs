/**
 * Reescribe las fotos de las fuentes externas en data/cache/.
 *
 * Lo corre un timer del sistema a horario fijo. Las páginas nunca salen a
 * internet: leen el archivo que deja este script.
 *
 * Uso:
 *   npx tsx --require ./scripts/register-server-only-stub.cjs scripts/refrescar-fuentes.mjs
 *   ... boletin    → solo el Boletín Oficial
 *   ... noticias   → solo la prensa
 *   ... buques     → solo los lineups portuarios
 *
 * Sin argumentos refresca las tres.
 */
import { refrescarBoletin } from "../src/lib/boletin/index.ts";
import { refrescarNoticias } from "../src/lib/noticias/index.ts";
import { refrescarBuques } from "../src/lib/buques/index.ts";

const sello = () =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date());

const pedidas = process.argv.slice(2);
const quiere = (n) => pedidas.length === 0 || pedidas.includes(n);

let fallos = 0;

async function paso(nombre, fn, resumir) {
  if (!quiere(nombre)) return;
  const desde = Date.now();
  try {
    const dato = await fn();
    console.log(`[${sello()}] ${nombre}: ${resumir(dato)} (${Date.now() - desde} ms)`);
  } catch (e) {
    fallos++;
    console.error(`[${sello()}] ${nombre}: FALLÓ — ${e instanceof Error ? e.message : e}`);
  }
}

await paso("boletin", refrescarBoletin, (b) =>
  b.error
    ? `sin actualizar (${b.error}); queda la foto anterior`
    : `${b.normas.length} normas, ${b.normas.filter((n) => n.relevante).length} de comercio exterior · edición ${b.numero ?? "?"}`,
);

await paso("noticias", refrescarNoticias, (n) =>
  n.noticias.length
    ? `${n.noticias.length} notas${n.fallaron.length ? ` · sin respuesta: ${n.fallaron.map((f) => f.nombre).join(", ")}` : ""}`
    : "sin notas; queda la foto anterior",
);

await paso("buques", refrescarBuques, (b) =>
  b.arribos.length
    ? `${b.arribos.length} arribos de ${b.fuentes.filter((f) => !f.error).length}/${b.fuentes.length} fuentes`
    : "sin arribos; queda la foto anterior",
);

// Salimos con error si algo falló, para que el timer lo registre como fallido.
process.exit(fallos > 0 ? 1 : 0);
