import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import {
  addMensajeParticipante,
  getMensajesByParticipante,
  getParticipanteById,
  marcarHiloLeidoEstudio,
} from "@/lib/data";
import { emailDisponible, enviarMensajeParticipante } from "@/lib/email";

function nombreDe(user: {
  contact_name?: string | null;
  company_name?: string | null;
  username?: string | null;
  email?: string | null;
}): string | null {
  return (
    user.contact_name ?? user.company_name ?? user.username ?? user.email ?? null
  );
}

async function autorizar(participanteId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "No autorizado.", status: 401 as const };

  const participante = getParticipanteById(participanteId);
  if (!participante) {
    return { error: "Participante no encontrado.", status: 404 as const };
  }
  // Pueden chatear el estudio (equipo) o el dueño de la operación (cliente).
  if (!esEquipo(user.role) && participante.owner_id !== user.id) {
    return { error: "No autorizado.", status: 403 as const };
  }
  return { user, participante };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await autorizar(id);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const mensajes = getMensajesByParticipante(id);
  // Al abrir el hilo, lo marcamos como leído del lado del estudio.
  marcarHiloLeidoEstudio(id);

  return NextResponse.json({ mensajes });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await autorizar(id);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { user, participante } = auth;

  const body = (await req.json().catch(() => null)) as { texto?: string } | null;
  const texto = String(body?.texto ?? "").trim();
  if (!texto) {
    return NextResponse.json({ error: "Escribí un mensaje." }, { status: 400 });
  }

  const autor = nombreDe(user);
  const mensaje = addMensajeParticipante({
    participantId: participante.id,
    operationId: participante.operation_id,
    ownerId: participante.owner_id,
    origen: "estudio",
    autor,
    texto: texto.slice(0, 4000),
  });

  // Aviso por email al tercero (si tiene email configurado y el envío está activo).
  let emailEnviado = false;
  let emailError: string | null = null;
  if (participante.email && emailDisponible()) {
    const origin =
      process.env.APP_URL?.replace(/\/$/, "") || req.nextUrl.origin;
    const link = `${origin}/p/${participante.token}`;
    try {
      await enviarMensajeParticipante({
        to: participante.email,
        nombre: participante.nombre,
        link,
        mensaje: texto,
        autor,
      });
      emailEnviado = true;
    } catch (e) {
      emailError = e instanceof Error ? e.message : "No se pudo enviar el email.";
    }
  }

  // El chat no se vuelca al seguimiento: queda solo en el hilo del participante.
  return NextResponse.json({ mensaje, emailEnviado, emailError });
}
