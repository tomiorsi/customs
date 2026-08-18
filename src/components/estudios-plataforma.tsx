import { Building2, Users, UserCog } from "lucide-react";
import type { EstudioRow } from "@/lib/data";
import { estadoSuscripcion, planPorClave } from "@/lib/suscripcion";

/**
 * Estudios dados de alta en la plataforma. Vista de dueño del producto: la ve
 * solo el admin, y muestra quién está usando el sistema, no la cartera de nadie.
 */
export function EstudiosPlataforma({ estudios }: { estudios: EstudioRow[] }) {
  const estado = (e: EstudioRow) => estadoSuscripcion(e);
  const activas = estudios.filter((e) => estado(e).estado === "activa").length;
  const enPrueba = estudios.filter((e) => estado(e).estado === "trial").length;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Building2 className="h-4 w-4 text-accent" />
          Estudios en la plataforma
        </h2>
        <p className="mt-1 text-sm text-muted">
          Cuentas de despachante dadas de alta. Cada una gestiona su propia
          cartera; desde acá solo se ve cuántos clientes y cuentas tiene.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tarjeta valor={activas} label="Suscripciones activas" />
        <Tarjeta valor={enPrueba} label="En prueba gratis" />
        <Tarjeta valor={estudios.length} label="Estudios registrados" />
      </div>

      {estudios.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
          Todavía no se registró ningún estudio.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="bg-surface-2/50 text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Estudio</th>
                <th className="px-3 py-2 font-medium">Suscripción</th>
                <th className="px-3 py-2 text-right font-medium">Clientes</th>
                <th className="px-3 py-2 text-right font-medium">Cuentas</th>
                <th className="px-3 py-2 font-medium">Alta</th>
              </tr>
            </thead>
            <tbody>
              {estudios.map((e) => (
                <tr key={e.id} className="border-t border-border bg-surface">
                  <td className="px-3 py-2.5">
                    <span className="block font-medium text-foreground">
                      {e.nombre}
                    </span>
                    {e.email && (
                      <span className="block text-xs text-muted">{e.email}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <EstadoSuscripcion estudio={e} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-muted" />
                      {e.clientes}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <UserCog className="h-3.5 w-3.5 text-muted" />
                      {e.subcuentas + 1}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    {formatoFecha(e.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Estado y plan del estudio, derivados de sus fechas. */
function EstadoSuscripcion({ estudio }: { estudio: EstudioRow }) {
  const s = estadoSuscripcion(estudio);
  const plan = planPorClave(estudio.plan);
  const estilos = {
    activa: "bg-accent-soft text-accent",
    trial: "bg-surface-2 text-muted",
    vencida: "bg-surface-2 text-muted line-through",
  } as const;
  const etiqueta = {
    activa: plan ? plan.nombre : "Activa",
    trial: `Prueba · ${s.diasRestantes}d`,
    vencida: "Vencida",
  } as const;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${estilos[s.estado]}`}
    >
      {etiqueta[s.estado]}
    </span>
  );
}

function Tarjeta({ valor, label }: { valor: number; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-3">
      <p className="text-2xl font-semibold tabular-nums text-foreground">
        {valor}
      </p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
    </div>
  );
}

function formatoFecha(iso: string): string {
  // SQLite guarda 'YYYY-MM-DD HH:MM:SS' en UTC, sin zona explícita.
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
