import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { fichaPosicion } from "@/lib/vuce";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const ncm = new URL(req.url).searchParams.get("ncm");
  if (!ncm) {
    return NextResponse.json({ error: "Falta ncm." }, { status: 400 });
  }

  const ficha = await fichaPosicion(ncm);
  return NextResponse.json({ ok: true, ficha });
}
