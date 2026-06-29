import { redirect } from "next/navigation";
import { Ship } from "lucide-react";
import {
  esNovedadEstudio,
  getAllOperations,
  getDocumentsByOperation,
  getEventosByOperation,
  noLeidosEstudioTodas,
  vistasEstudioTodas,
} from "@/lib/data";
import { getCurrentUser } from "@/lib/auth-server";
import {
  OperacionesLista,
  type OperacionItem,
} from "@/components/operaciones-lista";

export const dynamic = "force-dynamic";

export default async function AdminOperacionesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const ops = await getAllOperations();
  const vistas = vistasEstudioTodas();
  const noLeidos = noLeidosEstudioTodas();
  const items: OperacionItem[] = await Promise.all(
    ops.map(async (op) => {
      const [docs, eventos] = await Promise.all([
        getDocumentsByOperation(op.id, op.user_id),
        getEventosByOperation(op.user_id, op.id),
      ]);
      const visto = vistas[op.id] ?? "";
      // Novedades sin ver generadas por el cliente o un tercero (no el equipo):
      // cargas de documentos, alta de participante, etc., posteriores a la última
      // visita del estudio + los mensajes de chat del tercero sin leer.
      const eventosNuevos = eventos.filter(
        (e) => esNovedadEstudio(e) && e.created_at > visto,
      ).length;
      const novedades = eventosNuevos + (noLeidos[op.id] ?? 0);
      return { op, docs, novedades };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Operaciones
        </h1>
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
            Cuando un cliente abra una nueva importación o exportación desde su
            portal, va a aparecer acá con la documentación que haya adjuntado.
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
