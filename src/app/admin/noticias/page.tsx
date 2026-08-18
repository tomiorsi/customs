import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { ultimasNoticias } from "@/lib/noticias";
import { NotaBreve, NotaDestacada } from "@/components/noticia-tarjetas";

export const dynamic = "force-dynamic";

/**
 * Todas las notas del día.
 *
 * La portada muestra tres y entra en una pantalla; acá está el resto y sí se
 * scrollea. Son dos lecturas distintas: la portada se mira de reojo a las nueve
 * de la mañana, esto se recorre cuando hay tiempo.
 */
export default async function NoticiasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esEquipo(user.role)) redirect("/inicio");

  const prensa = await ultimasNoticias();
  const conPortada = prensa.noticias.filter((n) => n.imagen);
  const destacadas = conPortada.slice(0, 3);
  const ids = new Set(destacadas.map((n) => n.id));
  const resto = prensa.noticias.filter((n) => !ids.has(n.id));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/inicio"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a la portada
        </Link>
        <div className="mt-3 flex items-baseline justify-between gap-4 border-b-2 border-foreground pb-2">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Todas las noticias
          </h1>
          <p className="hidden text-[11px] uppercase tracking-[0.14em] text-muted sm:block">
            {prensa.noticias.length} notas
          </p>
        </div>
      </div>

      {prensa.noticias.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          Hoy todavía no salió ninguna nota en los portales que seguimos.
        </p>
      ) : (
        <>
          {destacadas.length > 0 && (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {destacadas.map((n) => (
                <li key={n.id}>
                  <NotaDestacada n={n} />
                </li>
              ))}
            </ul>
          )}

          {resto.length > 0 && (
            <ul className="grid gap-x-8 gap-y-6 pt-2 sm:grid-cols-2 xl:grid-cols-3">
              {resto.map((n) => (
                <li key={n.id}>
                  <NotaBreve n={n} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {prensa.fallaron.length > 0 && (
        <p className="text-[11px] text-muted">
          Sin respuesta:{" "}
          {prensa.fallaron.map((f) => `${f.nombre} (${f.error})`).join(" · ")}
        </p>
      )}
    </div>
  );
}
