import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo, alcanceDe } from "@/lib/roles";
import { getOperationById, setChecklistItem } from "@/lib/data";

export async function POST(
  req: NextRequest,
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

  const body = (await req.json().catch(() => null)) as {
    clave?: string;
    done?: boolean;
  } | null;
  const clave = String(body?.clave ?? "").trim();
  if (!clave || !/^[a-z_]+\.[a-z_]+$/.test(clave)) {
    return NextResponse.json({ error: "Clave inválida." }, { status: 400 });
  }

  const autor = user.contact_name ?? user.username ?? user.email ?? "Equipo";
  await setChecklistItem(op.user_id, id, clave, Boolean(body?.done), autor);

  return NextResponse.json({ ok: true });
}
