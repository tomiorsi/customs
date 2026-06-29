import { redirect } from "next/navigation";
import {
  FileWarning,
  Inbox,
  Package,
  Plane,
  Receipt,
  Ship,
  Truck,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth-server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

type OpRow = {
  id: string;
  ref: string;
  tipo: string;
  via: string | null;
  contraparte: string | null;
  estado: string;
};

const viaIcon: Record<string, typeof Ship> = {
  maritima: Ship,
  aerea: Plane,
  terrestre: Truck,
};

export default async function InicioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = getDb();
  const operaciones = db
    .prepare(
      "SELECT id, ref, tipo, via, contraparte, estado FROM operations WHERE user_id = ? ORDER BY created_at DESC",
    )
    .all(user.id) as OpRow[];

  const activas = operaciones.filter(
    (o) => !["Cerrado", "Facturado"].includes(o.estado),
  ).length;

  const kpis = [
    { label: "Operaciones activas", value: String(activas), icon: Ship },
    { label: "Documentos pendientes", value: "0", icon: FileWarning },
    { label: "Cotizaciones", value: "0", icon: Receipt },
    { label: "Por facturar", value: "0", icon: Package },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl border border-border bg-surface p-5"
          >
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
            Mis operaciones
          </h2>
        </div>

        {operaciones.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-accent">
              <Inbox className="h-7 w-7" />
            </span>
            <p className="mt-4 text-sm font-medium text-foreground">
              Todavía no tenés operaciones
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted">
              Cuando el estudio cargue una operación para tu empresa, va a
              aparecer acá con su estado y documentación.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {operaciones.map((op) => {
              const Via = (op.via && viaIcon[op.via]) || Package;
              return (
                <li
                  key={op.id}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                    <Via className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {op.contraparte ?? op.ref}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {op.ref} · {op.tipo}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-foreground">
                    {op.estado}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
