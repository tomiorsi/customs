import { redirect } from "next/navigation";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-server";
import { getHilosSoporte, getMensajesSoporte, marcarLeidoSoporte } from "@/lib/soporte";
import { SoporteRespuesta } from "@/components/soporte-respuesta";

export const dynamic = "force-dynamic";

/** Bandeja de soporte de la plataforma: los hilos de todas las cuentas. */
export default async function BandejaSoportePage({
  searchParams,
}: {
  searchParams: Promise<{ cuenta?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/admin/soporte");

  const hilos = getHilosSoporte();
  const { cuenta } = await searchParams;
  const seleccionado =
    cuenta && hilos.some((h) => h.cuentaId === cuenta)
      ? cuenta
      : (hilos[0]?.cuentaId ?? null);

  const mensajes = seleccionado ? getMensajesSoporte(seleccionado) : [];
  if (seleccionado) marcarLeidoSoporte(seleccionado, "soporte");
  const actual = hilos.find((h) => h.cuentaId === seleccionado);

  return (
    <main className="mx-auto w-full max-w-6xl">
      <header className="mb-6">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          <LifeBuoy className="h-4 w-4" />
          Soporte
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Consultas recibidas
        </h1>
      </header>

      {hilos.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
          Todavía nadie escribió a soporte.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,18rem)_1fr]">
          <nav aria-label="Consultas" className="max-h-[28rem] space-y-1.5 overflow-y-auto lg:max-h-[calc(100vh-16rem)]">
            {hilos.map((h) => {
              const activo = h.cuentaId === seleccionado;
              return (
                <Link
                  key={h.cuentaId}
                  href={`/admin/soporte/bandeja?cuenta=${encodeURIComponent(h.cuentaId)}`}
                  aria-current={activo ? "page" : undefined}
                  className={`block rounded-lg border px-3 py-2.5 transition-colors ${
                    activo ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-accent/50"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{h.nombre}</span>
                    {h.sinLeer > 0 && (
                      <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                        {h.sinLeer}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {h.ultimoTexto ?? "Sin mensajes"}
                  </span>
                </Link>
              );
            })}
          </nav>

          <section className="flex h-[28rem] min-h-0 flex-col lg:h-[calc(100vh-16rem)]">
            {actual && (
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                {actual.nombre}
                {actual.email && <span className="ml-2 font-normal text-muted">{actual.email}</span>}
              </h2>
            )}
            {seleccionado && (
              <SoporteRespuesta key={seleccionado} cuentaId={seleccionado} iniciales={mensajes} />
            )}
          </section>
        </div>
      )}
    </main>
  );
}
