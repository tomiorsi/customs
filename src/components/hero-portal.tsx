"use client";

import { useEffect } from "react";

/**
 * El hero: una cabecera de diario, no una landing de producto.
 *
 * La decisión de diseño es que pertenezca al mismo mundo que lo que viene
 * abajo. El Boletín y las notas ya tienen un registro propio y bastante
 * específico —rótulos en mono, versalitas con tracking abierto, una regla
 * gruesa bajo cada título, números romanos en la tapa del Boletín—: es el de
 * una publicación diaria. Un hero de SaaS con dos botones centrados encima de
 * una imagen no pega con eso, y era lo que había.
 *
 * Por eso el hero arranca con una **línea de fecha real** —la edición de hoy,
 * cuántas notas hay, cuántos portales se leyeron— antes del título. No es
 * decoración: es el dato del día, y es lo que promete que abajo hay algo
 * fresco.
 *
 * La ola 3D queda como línea de horizonte, apoyada abajo. Antes estaba en el
 * centro y el texto le caía encima.
 */
export function HeroPortal({
  fecha,
  edicion,
  notas,
}: {
  fecha: string | null;
  edicion: string | null;
  notas: number;
}) {
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
    modulo.src = "/landing/wave-ribbon.js?v=10";
    document.body.appendChild(modulo);
  }, []);

  // Corta y en una línea: es una fecha de edición, no un resumen. Los portales
  // leídos ya se cuentan en la tapa del Boletín, un scroll más abajo.
  const dateline = [fecha, edicion ? `Boletín ${edicion}` : null, `${notas} notas`]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
      {/* La ola ocupa toda la caja pero se apoya abajo: `wave-ribbon.js` la
          baja con WAVE_Y_RATIO. Sin fondo propio, para que herede el de la
          página y funcione también en oscuro. */}
      <canvas
        id="wave-canvas"
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
        aria-hidden
      />

      {/* El texto vive en la mitad izquierda en pantalla ancha: la ola ocupa
          la derecha y las dos cosas se leen sin pisarse. En angosta usa todo
          el ancho y la ola pasa a ser una banda debajo. */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 pb-[26vh] pt-24 lg:pb-24 lg:pr-[46%]">
        {/* La línea de fecha. Va antes del título porque es lo que hace que
            esto sea la edición de hoy y no una portada cualquiera. */}
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted first-letter:uppercase">
          <span className="mr-2 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-accent align-middle" />
          {dateline}
        </p>

        <h1 className="mt-5 max-w-[14ch] text-balance text-[clamp(2.4rem,6.2vw,4.5rem)] font-semibold leading-[0.98] tracking-[-0.03em] text-foreground">
          Portal para importadores y despachantes
        </h1>

        <p className="mt-6 max-w-[42ch] text-pretty text-[clamp(1rem,1.5vw,1.15rem)] leading-relaxed text-muted">
          Las noticias del sector y el Boletín Oficial del día, leídos y
          ordenados. Y el nomenclador entero para buscar,{" "}
          <span className="text-foreground">gratis y sin cuenta</span>.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <a
            href="#dia"
            className="rounded-lg bg-accent px-5 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Qué salió hoy
          </a>
          <a
            href="#nomenclador"
            className="rounded-lg border border-border px-5 py-3 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
          >
            Buscar en el nomenclador
          </a>
        </div>
      </div>

      {/* Pista de scroll, al ras del borde inferior. */}
      <a
        href="#dia"
        aria-label="Bajar"
        className="absolute inset-x-0 bottom-6 mx-auto flex w-fit items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-muted transition-colors hover:text-accent"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-bounce" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 5v14" />
          <path d="m6 13 6 6 6-6" />
        </svg>
        Seguir
      </a>
    </section>
  );
}
