import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-server";
import {
  getDocumentsByOperation,
  getEventosByOperation,
  getOperationById,
  getParticipantesByOperation,
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
  const op = await getOperationById(id);
  if (!op || op.user_id !== user.id) notFound();

  const [docs, eventosTodos] = await Promise.all([
    getDocumentsByOperation(op.id, op.user_id),
    getEventosByOperation(op.user_id, op.id),
  ]);
  // El cliente no ve las notas internas del equipo.
  const eventos = eventosTodos.filter((e) => !e.interno);
  const participantes = getParticipantesByOperation(op.id);

  return (
    <div className="space-y-6">
      <Link
        href="/inicio/operaciones"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a mis operaciones
      </Link>

      <OperacionEditable
        op={op}
        docs={docs}
        eventos={eventos}
        participantes={participantes}
      />
    </div>
  );
}
