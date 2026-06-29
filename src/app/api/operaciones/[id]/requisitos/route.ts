import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { getOperationById } from "@/lib/data";
import { requisitosOperacion } from "@/lib/requisitos";

/**
 * Documentación y trámites requeridos para la operación (prueba de origen,
 * intervenciones de terceros y antidumping), deducidos del país y el NCM.
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
  const op = await getOperationById(id);
  if (!op) {
    return NextResponse.json(
      { error: "Operación no encontrada." },
      { status: 404 },
    );
  }

  try {
    const resultado = await requisitosOperacion(op);
    return NextResponse.json({ ok: true, resultado });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "No se pudieron calcular los requisitos.",
      },
      { status: 500 },
    );
  }
}
