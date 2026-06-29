import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { antidumpingPorNcmPais } from "@/lib/vuce";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ncm = searchParams.get("ncm");
  const pais = searchParams.get("pais");

  if (!ncm || !pais) {
    return NextResponse.json(
      { error: "Faltan ncm y país de origen." },
      { status: 400 },
    );
  }

  const resultado = await antidumpingPorNcmPais(ncm, pais);
  return NextResponse.json({ ok: true, resultado });
}
