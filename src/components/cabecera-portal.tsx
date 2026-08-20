"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * La cabecera del portal: la marca y cómo encontrarnos.
 *
 * Sin línea abajo a propósito: el hero es una sola imagen —el título, la ola y
 * el aire entre los dos— y una regla horizontal cruzándolo lo parte en dos.
 * Cuando la página se movió aparece un fondo con desenfoque para que el texto
 * de atrás no se mezcle con el de acá, pero sigue sin borde.
 *
 * Los dos destinos —noticias y nomenclador— no están acá: son las dos cosas
 * que ofrece el hero con sus botones, a dos dedos, y repetirlas arriba no
 * agregaba un camino sino ruido. Lo que sí sirve arriba es el contacto: quien
 * quiere escribirnos no debería tener que buscar dónde.
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
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        apoyada ? "bg-[var(--portal-bg)]/85 backdrop-blur-md" : ""
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-6 lg:px-10">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Wabe, inicio">
          {/* El logo de siempre, el mismo archivo que usaba la landing. */}
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

        {/* En celular no entran los dos: el teléfono parte en dos renglones y
            se sube arriba del logo. Queda el teléfono, que es el que se toca,
            y el mail aparece recién cuando hay ancho. */}
        <nav className="flex items-center gap-5" aria-label="Contacto">
          <a
            href="https://wa.me/5491123703680"
            target="_blank"
            rel="noopener noreferrer"
            className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.16em] text-muted transition-colors hover:text-accent"
          >
            +54 9 11 2370-3680
          </a>
          <a
            href="mailto:info@wabe.dev"
            className="hidden whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.16em] text-muted transition-colors hover:text-accent sm:inline"
          >
            info@wabe.dev
          </a>
        </nav>
      </div>
    </header>
  );
}
