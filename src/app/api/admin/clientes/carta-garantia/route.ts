import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo, estudioDe } from "@/lib/roles";
import { setCartaGarantia } from "@/lib/data";
import { vencimientoAnual } from "@/lib/carta-garantia";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !esEquipo(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    userId?: string;
    tipo?: string;
  } | null;
  const userId = String(body?.userId ?? "").trim();
  const tipo = String(body?.tipo ?? "").trim();

  if (!userId || (tipo !== "anual" && tipo !== "puntual" && tipo !== "no")) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  // La anual queda válida hasta el 31/12 del año actual; se renueva volviendo a
  // marcarla anual el año siguiente.
  const vence = tipo === "anual" ? vencimientoAnual() : null;
  setCartaGarantia(userId, tipo, vence, estudioDe(user));

  return NextResponse.json({ ok: true, tipo, vence });
}
