import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo, alcanceDe } from "@/lib/roles";
import { getDocumentsByOperation, getOperationById } from "@/lib/data";
import { mensajeDocumentacionCliente } from "@/lib/docs";

/**
 * Devuelve un BORRADOR del aviso al cliente para el Paso 2 (qué recibimos y qué
 * falta). No envía nada: el operador lo revisa, edita y recién ahí lo manda.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !esEquipo(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const op = await getOperationById(id, alcanceDe(user));
  if (!op) {
    return NextResponse.json(
      { error: "Operación no encontrada." },
      { status: 404 },
    );
  }

  const docs = await getDocumentsByOperation(op.id, op.user_id);
  const borrador = mensajeDocumentacionCliente({
    tipo: op.tipo,
    via: op.via,
    tiposPresentes: docs.map((d) => d.doc_type),
    paisOrigen: op.pais_origen,
  });

  return NextResponse.json({ borrador });
}
