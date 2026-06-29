import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import {
  addEvento,
  getParticipanteById,
  removeParticipante,
} from "@/lib/data";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const participante = getParticipanteById(id);
  if (!participante) {
    return NextResponse.json(
      { error: "Participante no encontrado." },
      { status: 404 },
    );
  }
  // Pueden darlo de baja el estudio (equipo) o el dueño de la operación (cliente).
  if (!esEquipo(user.role) && participante.owner_id !== user.id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  removeParticipante(id);

  await addEvento({
    operationId: participante.operation_id,
    userId: participante.owner_id,
    tipo: "nota",
    titulo: `Se quitó a ${participante.nombre} como participante`,
    autor:
      user.contact_name ??
      user.company_name ??
      user.username ??
      user.email ??
      null,
  });

  return NextResponse.json({ ok: true });
}
