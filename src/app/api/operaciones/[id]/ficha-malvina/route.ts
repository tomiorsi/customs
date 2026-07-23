import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { getOperationById } from "@/lib/data";
import { armarFichaMalvina } from "@/lib/ficha-malvina";
import { parseChecklist } from "@/lib/workflow";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !esEquipo(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const op = await getOperationById(id);
  if (!op) {
    return NextResponse.json(
      { error: "Operación no encontrada." },
      { status: 404 },
    );
  }

  const checklist = parseChecklist(op.checklist);

  try {
    const resultado = await armarFichaMalvina(op, { checklist });
    return NextResponse.json({ ok: true, resultado });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "No se pudo armar la ficha para Malvina.",
      },
      { status: 500 },
    );
  }
}
