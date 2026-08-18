import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-server";
import { alcanceDe } from "@/lib/roles";
import {
  getDocumentsByOperation,
  getEventosByOperation,
  getOperationById,
} from "@/lib/data";
import { OperacionEditable } from "@/components/operacion-editable";

export const dynamic = "force-dynamic";

export default async function OperacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const opBase = await getOperationById(id, alcanceDe(user));
  if (!opBase || opBase.user_id !== user.id) notFound();
  // El cliente ve su propio alias del nombre si lo cambió; si no, el oficial.
  const op = { ...opBase, titulo: opBase.titulo_cliente || opBase.titulo };

  const [docs, eventosTodos] = await Promise.all([
    getDocumentsByOperation(op.id, op.user_id),
    getEventosByOperation(op.user_id, op.id),
  ]);
  // El cliente no ve las notas internas del equipo.
  const eventos = eventosTodos.filter((e) => !e.interno);

  return (
    <div className="space-y-6">
      <Link
        href="/inicio/operaciones"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a mis operaciones
      </Link>

      <OperacionEditable op={op} docs={docs} eventos={eventos} soloNombre />
    </div>
  );
}
