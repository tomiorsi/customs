"use client";

import { useEffect } from "react";

/**
 * El hero del portal.
 *
 * Escrito **a propósito con clases de base de Tailwind** —`text-6xl`,
 * `max-w-xl`, `min-h-screen`— y no con valores arbitrarios entre corchetes.
 * La versión anterior usaba `text-[clamp(...)]`, `min-h-[100svh]` y
 * `lg:pr-[46%]`, y bastaba que la hoja de estilos quedara vieja en el
 * navegador para que el hero perdiera la altura, el título se achicara y la
 * pista de scroll terminara arriba de todo. Una escala de tipografía normal se
 * ve igual de bien y no se cae.
 *
 * La composición: el texto en la mitad izquierda, la ola 3D abajo a la
 * derecha. En diagonal, sin pisarse. La ola es lo único que quedó de la
 * landing anterior y es la identidad del sitio.
 *
 * Arriba de todo va la línea de fecha con la edición de hoy: es lo que hace
 * que esto sea la portada de un día y no una página de venta.
 */
export function HeroPortal({ fecha }: { fecha: string | null }) {
  useEffect(() => {
    if (document.getElementById("wave-importmap")) return;

    // El importmap tiene que estar en el documento ANTES que el módulo que lo
    // usa, así que los dos se inyectan acá y en este orden.
    const mapa = document.createElement("script");
    mapa.type = "importmap";
    mapa.id = "wave-importmap";
    mapa.textContent = JSON.stringify({
      imports: {
        three: "/landing/vendor/three/three.module.js",
        "three/addons/": "/landing/vendor/three/addons/",
      },
    });
    document.head.appendChild(mapa);

    const modulo = document.createElement("script");
    modulo.type = "module";
    modulo.src = "/landing/wave-ribbon.js?v=14";
    document.body.appendChild(modulo);
  }, []);

  return (
    <section className="relative isolate flex min-h-screen flex-col justify-between overflow-hidden pt-24">
      <canvas
        id="wave-canvas"
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
        aria-hidden
      />

      <div className="mx-auto w-full max-w-7xl px-6 lg:px-10">
        <div className="max-w-2xl">
          <p
            className={`flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted ${
              fecha ? "" : "invisible"
            }`}
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            {/* Solo la fecha. El número de edición y cuántas notas hay están
                un scroll más abajo, en la tapa del Boletín, que es donde
                significan algo; acá arriba eran dos datos sueltos que hacían
                partir el renglón en celular. */}
            <span className="first-letter:uppercase">{fecha}</span>
          </p>

          {/* En el celeste de la marca, no en el color de texto.
              Va con `var(--accent)` —el de relleno— y no con la clase
              `text-accent`, que apunta al acento de TEXTO, un tono más oscuro
              para que se lean los rótulos de diez píxeles. Acá el título mide
              treinta y seis o más y en negrita: a ese tamaño el celeste puro
              se lee bien, y es el color de la ola que tiene al lado. */}
          <h1
            className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
            style={{ color: "var(--accent)" }}
          >
            Portal para importadores y despachantes
          </h1>

          <p className="mt-6 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
            {/* Las tres cosas en una sola enumeración. Antes iban en dos
                oraciones con «leídos y ordenados» en el medio, y la bajada
                ocupaba cuatro renglones para decir tres sustantivos. */}
            Las noticias del sector, el Boletín Oficial del día y el
            nomenclador entero para buscar.
          </p>

          {/* Los dos en una línea también en celular: apilados se comían el
              alto y la ola les pasaba por encima. Entran achicando el cuerpo y
              el relleno, no recortando las etiquetas. */}
          <div className="mt-10 flex flex-nowrap items-center gap-2 sm:gap-3">
            <a
              href="#dia"
              className="whitespace-nowrap rounded-lg bg-accent px-4 py-2.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 sm:px-6 sm:py-3 sm:text-sm"
            >
              Qué salió hoy
            </a>
            <a
              href="#nomenclador"
              className="whitespace-nowrap rounded-lg border border-border bg-surface px-4 py-2.5 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent sm:px-6 sm:py-3 sm:text-sm"
            >
              Buscar en el nomenclador
            </a>
          </div>
        </div>
      </div>

      {/* La pista de scroll es el último hijo del flex, no un elemento
          posicionado. Así queda abajo por el flujo mismo: si algún estilo
          faltara, cae al final de la sección y no arriba de todo, que es lo
          que pasaba cuando dependía de `absolute bottom-6`. */}
      <a
        href="#dia"
        aria-label="Bajar al contenido"
        className="mx-auto mb-8 mt-16 flex w-fit items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted transition-colors hover:text-accent"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 5v14" />
          <path d="m6 13 6 6 6-6" />
        </svg>
        Seguir
      </a>
    </section>
  );
}
