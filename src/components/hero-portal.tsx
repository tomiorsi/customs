"use client";

import { useEffect } from "react";

/**
 * El hero, con la ola 3D.
 *
 * La ola es lo único que se rescató de la landing de agencia: es la identidad
 * visual del sitio y no había motivo para rehacerla. Vive en
 * `/landing/wave-ribbon.js`, que dibuja sobre `#wave-canvas` con three.js.
 *
 * Se carga acá y no con `<Script>` de Next porque necesita un `importmap`, y
 * un importmap tiene que estar en el documento **antes** que el módulo que lo
 * usa. Inyectar los dos en orden desde el efecto es la forma de garantizarlo
 * sin tocar el layout de toda la aplicación.
 *
 * Si el navegador no soporta WebGL o el módulo no carga, no pasa nada: el
 * canvas queda vacío y el título —que es lo que importa— ya está escrito.
 */
export function HeroPortal() {
  useEffect(() => {
    if (document.getElementById("wave-importmap")) return;

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
    modulo.src = "/landing/wave-ribbon.js?v=3";
    document.body.appendChild(modulo);
  }, []);

  return (
    <header className="relative isolate flex min-h-[78vh] items-center justify-center overflow-hidden px-5">
      {/* La ola pinta su propio fondo blanco: el pase de bloom de three.js no
          respeta transparencia. Por eso el hero fuerza fondo claro y el texto
          va oscuro, en los dos temas. */}
      <div className="absolute inset-0 -z-10 bg-white" aria-hidden />
      <canvas id="wave-canvas" className="absolute inset-0 -z-10 h-full w-full" aria-hidden />

      <div className="relative mx-auto max-w-3xl text-center">
        <h1 className="text-balance text-[clamp(2rem,6vw,3.6rem)] font-semibold leading-[1.08] tracking-tight text-[#0b1220]">
          Portal para importadores y despachantes
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-[clamp(0.95rem,2vw,1.1rem)] leading-relaxed text-[#47505e]">
          Las noticias del sector y el Boletín Oficial del día, leídos y
          ordenados. Y el nomenclador entero para buscar, gratis y sin cuenta.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#dia"
            className="rounded-lg bg-[#1a5080] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Ver el día
          </a>
          <a
            href="#nomenclador"
            className="rounded-lg border border-[#0b122026] px-5 py-2.5 text-sm font-medium text-[#0b1220] transition-colors hover:border-[#1a5080] hover:text-[#1a5080]"
          >
            Buscar en el nomenclador
          </a>
        </div>
      </div>
    </header>
  );
}
