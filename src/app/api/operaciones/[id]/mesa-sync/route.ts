import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo, alcanceDe } from "@/lib/roles";
import { getDocumentsByOperation, getOperationById } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Snapshot liviano para refrescar la mesa tras subir/analizar documentos. */
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

  const docs = await getDocumentsByOperation(op.id, op.user_id);

  return NextResponse.json({
    ok: true,
    checklist: op.checklist,
    hallazgosIA: op.hallazgos_ia,
    validacionIA: op.validacion_ia,
    docs: docs.length,
    etapa: op.etapa,
    estado: op.estado,
    ncm: op.ncm,
  });
}
