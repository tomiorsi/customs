import type { Metadata } from "next";
import Link from "next/link";
import { boletinDelDia } from "@/lib/boletin";
import { ultimasNoticias } from "@/lib/noticias";
import { BoletinInicio } from "@/components/boletin-inicio";
import { ScanSearch } from "lucide-react";
import { NomencladorManual } from "@/components/nomenclador-manual";
import { HeroPortal } from "@/components/hero-portal";
import { CabeceraPortal } from "@/components/cabecera-portal";

/**
 * La portada.
 *
 * Hasta el 20/8/2026 acá se servía un HTML estático: la landing de agencia,
 * con servicios y proyectos. Ahora la portada es una página de la aplicación,
 * y el motivo es concreto: muestra **lo mismo que ve el equipo adentro** —el
 * Boletín del día leído y anotado, las notas del sector, el nomenclador
 * entero— y eso son componentes que ya existen. Rehacerlos en CSS suelto para
 * un archivo estático garantizaba que se despeguen con el primer retoque.
 *
 * Lo único que sobrevive de la landing es la ola 3D del hero, que es la
 * identidad del sitio. Ver `HeroPortal`.
 *
 * Nada de esto pide cuenta. Lo que sí la pide es clasificar con IA, cargar
 * carpetas y liquidar: eso es el producto y vive en /login, que sigue
 * existiendo aunque no haya un botón que lo anuncie.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portal para importadores y despachantes | Wabe",
  description:
    "Las noticias del comercio exterior argentino y el Boletín Oficial del día, leídos y ordenados. Buscá en el nomenclador entero, gratis y sin cuenta.",
  alternates: { canonical: "/" },
};

export default async function PortadaPage() {
  // Las dos fuentes son externas e independientes: se piden juntas para que la
  // página espere una sola vez y no una atrás de la otra.
  const [boletin, prensa] = await Promise.all([boletinDelDia(), ultimasNoticias()]);

  return (
    /* El fondo del portal es el de wabe.dev —#fafbfd, un blanco apenas azulado—
       y no el gris neutro del panel. Es la diferencia entre la parte pública y
       la de adentro, y se nota: el gris del panel al lado de la ola se ve
       sucio. Va como variable para que la cabecera fija y el pie lo hereden. */
    <div
      className="min-h-screen bg-[var(--portal-bg)] [--portal-bg:#fafbfd] dark:[--portal-bg:#0e2440]"
    >
      <CabeceraPortal />

      <HeroPortal fecha={boletin.fechaTexto} />

      <main className="mx-auto max-w-6xl space-y-14 px-5 py-12 sm:py-16">
        <section id="dia" className="scroll-mt-20">
          <BoletinInicio boletin={boletin} prensa={prensa} hrefNoticias="/noticias" />
        </section>

        <section id="nomenclador" className="scroll-mt-20">
          {/* Misma tarjeta que adentro: borde, fondo de superficie, el ícono en
              su cuadrado de acento y el título al lado. No es parecido — es el
              mismo tratamiento, para que el que entra sin cuenta y el que entra
              con cuenta vean la misma herramienta. */}
          <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
                <ScanSearch className="h-5 w-5 text-accent" />
              </span>
              <div className="min-w-0">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  Buscar posición NCM
                </h2>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                  Gratis · sin cuenta · nomenclador completo
                </p>
              </div>
            </div>

            <p className="mb-6 max-w-2xl text-sm leading-relaxed text-foreground">
              Partidas, subpartidas y posiciones con su texto legal y el derecho
              que pagan. Está escrito en lenguaje legal y no en el de todos los
              días: «notebook» no figura, «máquinas automáticas para tratamiento
              de datos» sí.
            </p>

            <NomencladorManual esExport={false} />
          </div>
        </section>

      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-xs text-muted">
          <span>© {new Date().getFullYear()} Wabe — estudio de Tomás Orsi</span>
          <nav className="flex flex-wrap items-center gap-4">
            <Link href="/noticias" className="transition-colors hover:text-accent">
              Noticias
            </Link>
            <a
              href="https://wa.me/5491123703680"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-accent"
            >
              +54 9 11 2370-3680
            </a>
            <a
              href="mailto:info@wabe.dev"
              className="transition-colors hover:text-accent"
            >
              info@wabe.dev
            </a>
            <a
              href="https://www.instagram.com/wabe.dev/"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-accent"
            >
              Instagram
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
