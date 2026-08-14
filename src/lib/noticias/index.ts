import "server-only";

import { hoyIsoArgentina, TZ_AR } from "@/lib/fechas";
import { MEDIOS, type ListadoNoticias, type Medio, type Noticia } from "@/lib/noticias/tipos";

/**
 * Lector de los feeds RSS de la prensa de comercio exterior.
 *
 * Los cuatro medios publican RSS de WordPress, bien formado y sin auth. Se
 * consultan en paralelo y de forma aislada: si uno se cae, los otros igual
 * llegan y el fallo queda visible en pantalla.
 */

const TIMEOUT_MS = 12_000;
/** Los portales publican varias veces por día; media hora es suficiente. */
const TTL_MS = 30 * 60 * 1000;
/** Cuántas notas mostramos en total, ya mezcladas por fecha. */
const TOPE = 14;

let cache: { dato: ListadoNoticias; expira: number } | null = null;
let enVuelo: Promise<ListadoNoticias> | null = null;

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  laquo: "«",
  raquo: "»",
  deg: "°",
};

function decodificar(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTIDADES[e.toLowerCase()] ?? m);
}

/** Contenido de una etiqueta del item, con o sin CDATA. */
function tag(item: string, nombre: string): string {
  const re = new RegExp(`<${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</${nombre}>`, "i");
  const m = item.match(re);
  if (!m) return "";
  const crudo = m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  return decodificar(crudo).trim();
}

function sinHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * WordPress cierra cada extracto con "La entrada <título> apareció primero en
 * <sitio>". Es el pie del CMS, no parte de la nota.
 *
 * A veces el propio WordPress corta el extracto en la mitad de ese pie, así que
 * la frase completa no aparece. Por eso, además del patrón entero, cortamos
 * cuando "La entrada" viene seguida del título de la nota: el pie siempre lo
 * repite, y una oración real que empiece así no lo haría.
 */
function sinPieWordpress(s: string, titulo: string): string {
  const limpio = s
    .replace(/\s*La entrada\b[\s\S]*?(?:aparece|apareció)\s+primero\s+en\b.*$/i, "")
    .replace(/\s*The post\b[\s\S]*?appeared first on\b.*$/i, "")
    .trim();

  const inicioTitulo = titulo.trim().slice(0, 24).toLowerCase();
  if (!inicioTitulo) return limpio;

  for (const marca of ["la entrada ", "the post "]) {
    const i = limpio.toLowerCase().lastIndexOf(marca);
    if (i < 0) continue;
    const despues = limpio.slice(i + marca.length, i + marca.length + 24);
    if (despues.toLowerCase().startsWith(inicioTitulo.slice(0, despues.length))) {
      return limpio.slice(0, i).replace(/[\s.]+$/, "").trim();
    }
  }

  return limpio;
}

/** Recorta en el límite de palabra para no cortar al medio. */
function recortar(s: string, max: number): string {
  if (s.length <= max) return s;
  const corte = s.slice(0, max);
  const espacio = corte.lastIndexOf(" ");
  return `${corte.slice(0, espacio > max * 0.6 ? espacio : max)}…`;
}

const HORA_AR = new Intl.DateTimeFormat("es-AR", {
  timeZone: TZ_AR,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const DIA_AR = new Intl.DateTimeFormat("es-AR", {
  timeZone: TZ_AR,
  day: "2-digit",
  month: "2-digit",
});

/**
 * "hoy 14:59" / "ayer 18:53" / "12/08". Se redacta en el servidor porque el
 * cliente, con otro reloj o zona, hidrataría un texto distinto.
 */
function cuandoSalio(fecha: Date | null, hoy: string): string {
  if (!fecha) return "";
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_AR,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);

  if (iso === hoy) return `hoy ${HORA_AR.format(fecha)}`;

  const ayer = new Date(`${hoy}T12:00:00Z`);
  ayer.setUTCDate(ayer.getUTCDate() - 1);
  const isoAyer = ayer.toISOString().slice(0, 10);
  if (iso === isoAyer) return `ayer ${HORA_AR.format(fecha)}`;

  return DIA_AR.format(fecha);
}

/** Saca los parámetros de campaña que los feeds de WordPress pegan al link. */
function limpiarUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (k.startsWith("utm_")) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** Descarta categorías basura del CMS ("//", "-", vacías). */
function categoriaUtil(raw: string): string | null {
  const c = raw.trim();
  return /\p{L}/u.test(c) ? c : null;
}

async function leerMedio(medio: Medio, hoy: string): Promise<Noticia[]> {
  const res = await fetch(medio.feed, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
    headers: { accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!res.ok) throw new Error(`respondió ${res.status}`);

  const xml = await res.text();
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const out: Noticia[] = [];

  for (const item of items) {
    const titulo = sinHtml(tag(item, "title"));
    const url = tag(item, "link");
    if (!titulo || !url) continue;

    // Algunos medios dejan <description> vacía y ponen el cuerpo en
    // content:encoded; tomamos el primero que tenga texto.
    const resumen = sinPieWordpress(
      sinHtml(tag(item, "description")) || sinHtml(tag(item, "content:encoded")),
      titulo,
    );

    const pub = tag(item, "pubDate");
    const fecha = pub ? new Date(pub) : null;
    const valida = fecha && !Number.isNaN(fecha.getTime()) ? fecha : null;

    // Varios medios firman con el nombre del propio portal: repetirlo al lado
    // del sello del medio no aporta nada.
    const firma = sinHtml(tag(item, "dc:creator"));
    const autor =
      firma && firma.toLowerCase() !== medio.nombre.toLowerCase() ? firma : null;

    out.push({
      id: `${medio.id}-${tag(item, "guid") || url}`,
      titulo,
      url: limpiarUrl(url),
      resumen: recortar(resumen, 190),
      autor,
      categoria: categoriaUtil(sinHtml(tag(item, "category"))),
      publicado: valida ? valida.toISOString() : null,
      cuando: cuandoSalio(valida, hoy),
      medioId: medio.id,
      medioNombre: medio.nombre,
    });
  }

  return out;
}

async function consultarMedios(): Promise<ListadoNoticias> {
  const hoy = hoyIsoArgentina();

  const resultados = await Promise.all(
    MEDIOS.map(async (m) => {
      try {
        return { medio: m, noticias: await leerMedio(m, hoy), error: null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "error desconocido";
        return { medio: m, noticias: [] as Noticia[], error: msg };
      }
    }),
  );

  const noticias = resultados
    .flatMap((r) => r.noticias)
    .sort((a, b) => {
      // Sin fecha no se puede ubicar en la cronología: va al fondo.
      if (!a.publicado) return 1;
      if (!b.publicado) return -1;
      return a.publicado < b.publicado ? 1 : -1;
    })
    .slice(0, TOPE);

  return {
    noticias,
    fallaron: resultados
      .filter((r) => r.error)
      .map((r) => ({ nombre: r.medio.nombre, error: r.error! })),
    consultado: new Date().toISOString(),
  };
}

/** Últimas notas de los medios del rubro, cacheadas. */
export async function ultimasNoticias(forzar = false): Promise<ListadoNoticias> {
  const ahora = Date.now();
  if (!forzar && cache && cache.expira > ahora) return cache.dato;
  if (!forzar && enVuelo) return enVuelo;

  const trabajo = consultarMedios()
    .then((dato) => {
      // Si no llegó ni una nota no vale la pena cachear media hora el vacío.
      if (dato.noticias.length) cache = { dato, expira: Date.now() + TTL_MS };
      return dato;
    })
    .finally(() => {
      enVuelo = null;
    });

  enVuelo = trabajo;
  return trabajo;
}

export type { ListadoNoticias, Noticia };
