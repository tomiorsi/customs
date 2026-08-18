import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo, alcanceDe } from "@/lib/roles";
import {
  getDocumentsByOperation,
  getEventosByOperation,
  getOperationById,
  marcarOperacionVistaEstudio,
} from "@/lib/data";
import { OperacionEditable } from "@/components/operacion-editable";

export const dynamic = "force-dynamic";

export default async function AdminOperacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !esEquipo(user.role)) redirect("/login");

  const { id } = await params;
  const op = await getOperationById(id, alcanceDe(user));
  if (!op) notFound();

  // El equipo abrió la operación: marcamos las novedades como vistas.
  marcarOperacionVistaEstudio(op.id);

  const [docs, eventos] = await Promise.all([
    getDocumentsByOperation(op.id, op.user_id),
    getEventosByOperation(op.user_id, op.id),
  ]);

  return (
    <div className="space-y-6">
      <Link
        href="/admin/operaciones"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a operaciones
      </Link>

      <OperacionEditable
        op={op}
        docs={docs}
        eventos={eventos}
        completo
        showClient
        editableEstado
        volverHref="/admin/operaciones"
      />
    </div>
  );
}
