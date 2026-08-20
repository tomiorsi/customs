import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ultimasNoticias } from "@/lib/noticias";

/**
 * Una nota, con su propia URL.
 *
 * Existe para que se pueda compartir una sola —«mirá esto»— y para que Google
 * tenga algo que indexar por tema, en vez de una portada que cambia sola cada
 * hora.
 *
 * **No se reproduce la nota.** Lo que se muestra es el título, el resumen que
 * el propio medio publica en su feed para que lo sindiquen, y de dónde salió.
 * El texto completo es del medio: quien quiera leerlo va allá, y el enlace
 * está a la vista y no escondido al final.
 */

export const dynamic = "force-dynamic";
export const revalidate = 1800;

async function buscar(id: string) {
  const prensa = await ultimasNoticias();
  return prensa.noticias.find((n) => n.id === decodeURIComponent(id)) ?? null;
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const n = await buscar(id);
  if (!n) return { title: "Nota no encontrada | Wabe" };
  return {
    title: `${n.titulo} | Wabe`,
    description: n.resumen || `${n.medioNombre} — comercio exterior argentino.`,
    alternates: { canonical: `/noticias/${encodeURIComponent(n.id)}` },
    openGraph: {
      title: n.titulo,
      description: n.resumen || n.medioNombre,
      images: n.imagen ? [n.imagen] : undefined,
      type: "article",
    },
  };
}

export default async function NotaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = await buscar(id);
  // Las notas salen de la lista viva: una de hace tres días ya no está. Es un
  // 404 honesto, no un error — por eso la página de todas queda a un clic.
  if (!n) notFound();

  return (
    <article>
      <Link
        href="/noticias"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-accent"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Todas las noticias
      </Link>

      <p className="mt-6 text-[11px] font-medium uppercase tracking-wide text-muted">
        {n.medioNombre} · {n.cuando}
      </p>
      <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-foreground">
        {n.titulo}
      </h1>

      {n.imagen && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={n.imagen}
          alt=""
          className="mt-6 w-full rounded-xl border border-border object-cover"
        />
      )}

      {n.resumen && (
        <p className="mt-6 text-[15px] leading-relaxed text-foreground">{n.resumen}</p>
      )}

      <a
        href={n.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-7 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
      >
        Leer la nota completa en {n.medioNombre}
        <ExternalLink className="h-3.5 w-3.5" />
      </a>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        La nota es de {n.medioNombre} y se publica allá. Acá va el título y el
        resumen que el propio medio difunde.
      </p>
    </article>
  );
}
