import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Ship,
  Users,
} from "lucide-react";
import { getClients } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth-server";
import { contarSolicitudesPendientes } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") redirect("/admin/operaciones");

  const clientes = await getClients();
  const pendientes = contarSolicitudesPendientes();
  const totalOps = clientes.reduce((acc, c) => acc + c.ops, 0);
  const opsActivas = clientes.reduce((acc, c) => acc + c.opsActivas, 0);
  const opsCerradas = clientes.reduce((acc, c) => acc + c.opsCerradas, 0);

  const kpis = [
    { label: "Clientes", value: String(clientes.length), icon: Users },
    { label: "Operaciones", value: String(totalOps), icon: Ship },
    { label: "Activas", value: String(opsActivas), icon: ClipboardList },
    { label: "Cerradas", value: String(opsCerradas), icon: CheckCircle2 },
  ];

  const recientes = clientes.slice(0, 6);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Panel de administración
        </h1>
        <p className="mt-1 text-sm text-muted">
          Vista general de todos los clientes del estudio.
        </p>
      </div>

      {pendientes > 0 && (
        <Link
          href="/admin/equipo"
          className="flex items-center justify-between gap-4 rounded-xl border border-accent/40 bg-accent-soft px-5 py-4 transition-colors hover:bg-accent-soft/80"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <ClipboardList className="h-[18px] w-[18px]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {pendientes} solicitud{pendientes === 1 ? "" : "es"} para revisar
              </p>
              <p className="text-xs text-muted">
                Clientes que pasaron el filtro y esperan tu aprobación.
              </p>
            </div>
          </div>
          <ArrowUpRight className="h-4 w-4 text-accent" />
        </Link>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted">{label}</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2 text-accent">
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              {value}
            </p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">
            Clientes recientes
          </h2>
          <Link
            href="/admin/clientes"
            className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            Ver todos <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {recientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-accent">
              <Users className="h-7 w-7" />
            </span>
            <p className="mt-4 text-sm font-medium text-foreground">
              Todavía no hay clientes registrados
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted">
              Cuando una empresa cree su cuenta desde el registro, va a aparecer
              acá automáticamente.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {recientes.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                  <Building2 className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {c.company_name ?? "—"}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {c.email} {c.cuit ? `· ${c.cuit}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted">
                  {c.ops} op.
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
