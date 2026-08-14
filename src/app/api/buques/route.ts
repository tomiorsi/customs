import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { listarBuques } from "@/lib/buques";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!esEquipo(user.role)) {
    return NextResponse.json({ error: "Solo para el equipo." }, { status: 403 });
  }

  const forzar = new URL(req.url).searchParams.get("refresh") === "1";
  const listado = await listarBuques(forzar);
  return NextResponse.json({ ok: true, ...listado });
}
