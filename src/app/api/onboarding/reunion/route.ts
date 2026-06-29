import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { reservarReunion } from "@/lib/onboarding";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "client") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (user.op_status !== "submitted") {
    return NextResponse.json(
      { error: "Primero completá el formulario de calificación." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    fecha?: string;
    hora?: number;
  } | null;
  const fecha = String(body?.fecha ?? "").trim();
  const hora = Number(body?.hora);

  if (!fecha || Number.isNaN(hora)) {
    return NextResponse.json(
      { error: "Elegí un día y un horario." },
      { status: 400 },
    );
  }

  if (!reservarReunion(user.id, fecha, hora)) {
    return NextResponse.json(
      {
        error:
          "Ese horario no es válido. Elegí un día de lunes a viernes (a partir de mañana) entre las 10–12 o 15–17 hs.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
