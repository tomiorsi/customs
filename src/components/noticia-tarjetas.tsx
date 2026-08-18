"use client";

import { faviconDeMedio } from "@/lib/noticias/tipos";
import type { Noticia } from "@/lib/noticias/tipos";

/**
 * Tarjetas de nota, compartidas entre la portada y «Ver todas».
 *
 * Viven acá y no en cada pantalla porque son lo mismo: la portada muestra tres
 * y el listado completo las muestra todas, pero una nota se ve igual en los dos
 * lados. Duplicarlas garantizaba que se despeguen con el primer retoque.
 */

/**
 * Cada portal con su color. Es lo que identifica la fuente de un vistazo, y lo
 * que sostiene las notas que se quedan sin portada.
 */
const MEDIO_ESTILO: Record<string, { texto: string; barra: string }> = {
  "aduana-news": { texto: "text-accent", barra: "bg-accent" },
  "trade-news": { texto: "text-indigo-500", barra: "bg-indigo-500" },
  argenports: { texto: "text-sky-500", barra: "bg-sky-500" },
  globalports: { texto: "text-emerald-500", barra: "bg-emerald-500" },
};

/** Cuántos portales se leen. Sale de la lista real, no de un número a mano. */
export const PORTALES = Object.keys(MEDIO_ESTILO).length;

function estiloMedio(id: string) {
  return MEDIO_ESTILO[id] ?? { texto: "text-muted", barra: "bg-muted" };
}


/** Sello del medio: ícono del portal, nombre, cuándo salió y de qué trata. */
function Firma({ n }: { n: Noticia }) {
  const e = estiloMedio(n.medioId);
  const icono = faviconDeMedio(n.medioId);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.14em]">
      {icono && (
        // Ícono del propio medio: si el portal lo mueve de lugar, se oculta.
        // Va con <img> y no con next/image: son 14px de un dominio ajeno, y
        // optimizarlos costaría más que servirlos tal cual.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={icono}
          alt=""
          width={14}
          height={14}
          loading="lazy"
          className="h-3.5 w-3.5 shrink-0 rounded-[3px] object-contain"
          onError={(ev) => {
            ev.currentTarget.style.display = "none";
          }}
        />
      )}
      <span className={`font-semibold ${e.texto}`}>{n.medioNombre}</span>
      {n.cuando && <span className="text-muted">· {n.cuando}</span>}
      {n.categoria && <span className="text-muted">· {n.categoria}</span>}
    </p>
  );
}


/** Las demás notas del día, en columnas. */
export function NotaBreve({ n }: { n: Noticia }) {
  const e = estiloMedio(n.medioId);
  return (
    <a href={n.url} target="_blank" rel="noreferrer noopener" className="group block">
      <span
        aria-hidden
        className={`mb-2 block h-0.5 w-8 rounded-full transition-all group-hover:w-14 ${e.barra}`}
      />
      <Firma n={n} />
      <h3 className="mt-1.5 text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-accent">
        {n.titulo}
      </h3>
      {n.resumen && (
        <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted">
          {n.resumen}
        </p>
      )}
      {n.autor && <p className="mt-1.5 text-[11px] text-muted">Por {n.autor}</p>}
    </a>
  );
}


/**
 * Nota destacada: la portada primero.
 *
 * La imagen sale del og:image del medio, servida desde su propio dominio. No
 * la copiamos: es la misma que el portal usa cuando comparten la nota, y el
 * enlace lleva ahí. Con `<img>` y no `next/image` a propósito — optimizar
 * exigiría declarar de antemano los dominios de cada medio, y esa lista se
 * rompe el día que un portal cambia de CDN.
 */
export function NotaDestacada({ n }: { n: Noticia }) {
  const e = estiloMedio(n.medioId);
  return (
    <a
      href={n.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface transition-all hover:border-accent/40 hover:shadow-lg"
    >
      {n.imagen ? (
        <div className="relative aspect-video overflow-hidden bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={n.imagen}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            /* Si la imagen del medio muere, la tarjeta sigue viéndose: se
               esconde el hueco roto en vez de mostrar el ícono de error. */
            onError={(ev) => {
              ev.currentTarget.parentElement?.classList.add("hidden");
            }}
          />
        </div>
      ) : (
        <span aria-hidden className={`block h-1 w-full ${e.barra}`} />
      )}

      <div className="flex flex-1 flex-col p-3.5">
        <Firma n={n} />
        <h3 className="mt-1.5 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-accent">
          {n.titulo}
        </h3>
        {n.resumen && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">
            {n.resumen}
          </p>
        )}
      </div>
    </a>
  );
}
