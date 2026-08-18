import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Ship } from "lucide-react";
import {
  esNovedadEstudio,
  getAllOperations,
  getDocumentsByOperation,
  getEventosByOperation,
  vistasEstudioTodas,
} from "@/lib/data";
import { getCurrentUser } from "@/lib/auth-server";
import { estudioDe } from "@/lib/roles";
import {
  OperacionesLista,
  type OperacionItem,
} from "@/components/operaciones-lista";

export const dynamic = "force-dynamic";

export default async function AdminOperacionesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const ops = await getAllOperations(estudioDe(user));
  const vistas = vistasEstudioTodas();
  const items: OperacionItem[] = await Promise.all(
    ops.map(async (op) => {
      const [docs, eventos] = await Promise.all([
        getDocumentsByOperation(op.id, op.user_id),
        getEventosByOperation(op.user_id, op.id),
      ]);
      const visto = vistas[op.id] ?? "";
      // Novedades sin ver generadas por el cliente (no el equipo): cargas de
      // documentos posteriores a la última visita del estudio.
      const novedades = eventos.filter(
        (e) => esNovedadEstudio(e) && e.created_at > visto,
      ).length;
      return { op, docs, novedades };
    }),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Operaciones
        </h1>
        <Link
          href="/admin/operaciones/nueva"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Nueva operación
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-accent">
            <Ship className="h-7 w-7" />
          </span>
          <p className="mt-4 text-sm font-medium text-foreground">
            Todavía no hay operaciones
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted">
            Creá la primera con «Nueva operación» a nombre de un cliente, o esperá a que
            llegue documentación para cargarla.
          </p>
        </div>
      ) : (
        <OperacionesLista
          items={items}
          showClient
          interno
          basePath="/admin/operaciones"
        />
      )}
    </div>
  );
}
