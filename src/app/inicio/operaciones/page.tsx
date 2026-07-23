import { redirect } from "next/navigation";
import { Ship } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-server";
import { getDocumentsByOperation, getOperationsByUser } from "@/lib/data";
import {
  OperacionesLista,
  type OperacionItem,
} from "@/components/operaciones-lista";

export const dynamic = "force-dynamic";

export default async function OperacionesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const ops = await getOperationsByUser(user.id);
  const items: OperacionItem[] = await Promise.all(
    ops.map(async (op) => ({
      op: { ...op, titulo: op.titulo_cliente || op.titulo },
      docs: await getDocumentsByOperation(op.id, user.id),
    })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Mis operaciones
        </h1>
        <p className="mt-1 text-sm text-muted">
          Seguí el estado y la documentación de tus importaciones y exportaciones.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-accent">
            <Ship className="h-7 w-7" />
          </span>
          <p className="mt-4 text-sm font-medium text-foreground">
            Todavía no tenés operaciones
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted">
            El estudio va a cargar acá tus importaciones y exportaciones para que
            puedas seguir el estado y la documentación de cada una.
          </p>
        </div>
      ) : (
        <OperacionesLista items={items} />
      )}
    </div>
  );
}
