"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * La cabecera del portal.
 *
 * Solo dos destinos, que son las dos cosas que el sitio ofrece sin cuenta. El
 * contacto se fue al pie: arriba competía con lo único que importa —qué salió
 * hoy— y quien quiere escribirnos lo busca al final, no al entrar.
 *
 * Arranca transparente sobre el hero y recién se apoya en un fondo con línea
 * cuando la página se movió. Así la ola se ve entera al abrir, y la cabecera
 * aparece cuando empieza a haber texto atrás que necesite separarse.
 */
export function CabeceraPortal() {
  const [apoyada, setApoyada] = useState(false);

  useEffect(() => {
    const alScrollear = () => setApoyada(window.scrollY > 24);
    alScrollear();
    window.addEventListener("scroll", alScrollear, { passive: true });
    return () => window.removeEventListener("scroll", alScrollear);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        apoyada
          ? "border-b border-border bg-[var(--portal-bg)]/85 backdrop-blur-md"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Wabe, inicio">
          {/* El logo de siempre, el mismo archivo que usaba la landing. No se
              redibuja: es la marca. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/landing/wabe-logo.svg"
            alt=""
            width={26}
            height={18}
            className="h-[18px] w-[26px]"
          />
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Wabe
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <Destino href="#dia">Noticias</Destino>
          <Destino href="#nomenclador">Nomenclador</Destino>
        </nav>
      </div>
    </header>
  );
}

/**
 * Un destino de la cabecera.
 *
 * Son anclas de esta misma página, no páginas aparte: el clic baja hasta la
 * sección. Van con la misma tipografía mono en versalitas que usan los
 * rótulos del Boletín y de las notas, para que la cabecera pertenezca al
 * mismo registro documental que el contenido y no parezca pegada encima.
 */
function Destino({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="rounded-md px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted transition-colors hover:bg-surface-2 hover:text-accent"
    >
      {children}
    </a>
  );
}
