import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo, alcanceDe } from "@/lib/roles";
import { getOperationById } from "@/lib/data";
import { calcularLiquidacion } from "@/lib/liquidacion";
import type { Destino } from "@/lib/cotizador";

export async function GET(
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

  const destinoRaw = req.nextUrl.searchParams.get("destino");
  const destino: Destino = destinoRaw === "uso_propio" ? "uso_propio" : "reventa";

  try {
    const resultado = await calcularLiquidacion(op, destino);
    return NextResponse.json({ ok: true, resultado });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "No se pudo calcular la liquidación.",
      },
      { status: 500 },
    );
  }
}
