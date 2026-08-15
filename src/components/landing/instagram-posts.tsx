import { Camera } from "lucide-react";

/**
 * Últimos reels de Instagram.
 *
 * Se usa el iframe de embed directo en vez del blockquote + embed.js de Meta:
 * el script devolvía la ficha completa —acciones, me gusta y descripción— y
 * abajo del video quedaba un bloque de ruido que no aporta. Con el iframe
 * propio controlamos el alto y cortamos donde termina el video.
 *
 * Sin script de terceros: la página no carga nada de Meta hasta que el usuario
 * ve el iframe.
 */

const REELS = ["DZIqUbdpkc8", "DbOPfqZAUlj", "DaVYYaGxphp"];

/**
 * Alto del recorte, medido sobre el embed real: cabecera 56px, video 1,24 veces
 * el ancho —Instagram lo muestra con banda negra arriba y abajo, no a 9:16— y
 * la barra de «Ver más en Instagram», 52px.
 *
 * Debajo de eso el embed sigue con el perfil, las miniaturas de otros posts,
 * los botones de me gusta y los comentarios. Todo eso queda fuera del
 * contenedor, que recorta con overflow.
 */
const ANCHO = 326;
const ALTO = Math.round(56 + ANCHO * 1.24 + 52);

export function InstagramPosts() {
  return (
    <section id="instagram" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <div data-reveal className="landing-reveal text-center">
          <p className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            <Camera className="h-4 w-4" />
            Instagram
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Nos vemos ahí también
          </h2>
        </div>

        <div className="mt-10 flex flex-wrap items-start justify-center gap-6">
          {REELS.map((id, i) => (
            <div
              key={id}
              data-reveal
              style={{ transitionDelay: `${i * 90}ms` }}
              className="landing-reveal w-full max-w-[326px] overflow-hidden rounded-xl border border-border bg-white shadow-sm"
            >
              <iframe
                src={`https://www.instagram.com/reel/${id}/embed/`}
                title={`Reel de Instagram de J&C Comex`}
                loading="lazy"
                scrolling="no"
                allowFullScreen
                style={{ height: ALTO }}
                className="block w-full border-0"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
