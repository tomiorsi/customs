import type { Metadata } from "next";
import Link from "next/link";
import { ultimasNoticias } from "@/lib/noticias";

/**
 * Todas las noticias, abiertas.
 *
 * Se renderiza en el servidor —a diferencia de la sección de la portada, que
 * es un archivo estático que las pide por JavaScript— porque esta es la que
 * tiene que poder indexar Google. Es la puerta por la que entra alguien que
 * todavía no sabe que existimos.
 */

export const dynamic = "force-dynamic";
/** Se rearma cada media hora: las notas cambian, el HTML no puede quedar fijo. */
export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Noticias de comercio exterior | Wabe",
  description:
    "Las últimas del comercio exterior argentino, reunidas de los medios del sector. Aduana, importación, exportación y normativa.",
  alternates: { canonical: "/noticias" },
};

export default async function NoticiasPublicasPage() {
  const prensa = await ultimasNoticias();

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Noticias de comercio exterior
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        De los medios del sector, actualizado solo. Cada nota lleva a su fuente.
      </p>

      {prensa.noticias.length === 0 ? (
        <p className="mt-8 rounded-xl border border-border bg-card p-5 text-sm text-muted">
          Ahora mismo no hay notas para mostrar. Suele ser pasajero: los medios
          publican durante el día y esto se refresca cada hora.
        </p>
      ) : (
        <ul className="mt-7 divide-y divide-border border-y border-border">
          {prensa.noticias.map((n) => (
            <li key={n.id}>
              <Link
                href={`/noticias/${encodeURIComponent(n.id)}`}
                className="group flex gap-4 py-4 transition-colors hover:bg-surface-2"
              >
                {n.imagen && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={n.imagen}
                    alt=""
                    loading="lazy"
                    className="h-20 w-28 shrink-0 rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0">
                  <h2 className="text-sm font-medium leading-snug text-foreground group-hover:text-accent">
                    {n.titulo}
                  </h2>
                  {n.resumen && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                      {n.resumen}
                    </p>
                  )}
                  <p className="mt-1.5 text-[11px] text-muted">
                    {n.medioNombre} · {n.cuando}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {prensa.fallaron.length > 0 && (
        // Se dice cuál medio no contestó en vez de mostrar la lista corta como
        // si estuviera completa: el que busca algo puntual tiene que saber que
        // puede estar faltando de ahí.
        <p className="mt-5 text-[11px] text-muted">
          No respondieron: {prensa.fallaron.map((f) => f.nombre).join(", ")}.
        </p>
      )}
    </div>
  );
}
