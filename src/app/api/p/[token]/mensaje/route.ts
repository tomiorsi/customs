import { NextResponse, type NextRequest } from "next/server";
import {
  addMensajeParticipante,
  getParticipanteByToken,
} from "@/lib/data";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const participante = getParticipanteByToken(token);
  if (!participante) {
    return NextResponse.json(
      { error: "This link is invalid or has been revoked." },
      { status: 404 },
    );
  }

  const body = (await req.json().catch(() => null)) as { texto?: string } | null;
  const texto = String(body?.texto ?? "").trim();
  if (!texto) {
    return NextResponse.json({ error: "Write a message." }, { status: 400 });
  }

  // El chat vive en su propio hilo: no se vuelca al seguimiento (timeline).
  // El estudio se entera por la notificación / badge de no leídos.
  const mensaje = addMensajeParticipante({
    participantId: participante.id,
    operationId: participante.operation_id,
    ownerId: participante.owner_id,
    origen: "participante",
    autor: participante.nombre,
    texto: texto.slice(0, 4000),
  });

  return NextResponse.json({ mensaje });
}
