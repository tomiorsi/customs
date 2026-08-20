import Link from "next/link";
import type { ReactNode } from "react";

/**
 * El marco de las noticias abiertas.
 *
 * Es una sección pública, no parte del panel: no lleva la barra del estudio ni
 * pide sesión. Lo único que comparte con el resto del sitio es volver a la
 * portada, porque el que llega desde Google a una nota suelta tiene que poder
 * descubrir qué es esto.
 */
export default function NoticiasLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
            Wabe
          </Link>
          <nav className="flex items-center gap-4 text-xs font-medium text-muted">
            <Link href="/noticias" className="transition-colors hover:text-accent">
              Noticias
            </Link>
            <Link href="/#nomenclador" className="transition-colors hover:text-accent">
              Nomenclador
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-8">{children}</main>
      <footer className="mx-auto max-w-3xl px-5 pb-10 pt-4 text-[11px] text-muted">
        Las notas son de sus medios y se enlazan a la fuente. Wabe solo las reúne.
      </footer>
    </div>
  );
}
