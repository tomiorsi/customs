import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo, alcanceDe } from "@/lib/roles";
import { getOperationById } from "@/lib/data";
import { iaEstado } from "@/lib/ia-estado";

export const dynamic = "force-dynamic";

/** Estado del análisis de IA en curso de una operación (para que la UI muestre
 * "analizando…" y cuándo terminó). Liviano: lee un registro en memoria. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const op = await getOperationById(id, alcanceDe(user));
  if (!op) {
    return NextResponse.json({ error: "No encontrada." }, { status: 404 });
  }
  if (!esEquipo(user.role) && op.user_id !== user.id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  return NextResponse.json(iaEstado(op.id));
}
