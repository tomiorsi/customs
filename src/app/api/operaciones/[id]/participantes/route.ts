import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import {
  addEvento,
  addParticipante,
  getOperationById,
  getParticipantesByOperation,
  SUFIJO_CLIENTE,
} from "@/lib/data";
import {
  emailDisponible,
  enviarInvitacionParticipante,
  esEmailValido,
} from "@/lib/email";

const MAX_PARTICIPANTES = 3;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const op = await getOperationById(id);
  if (!op) {
    return NextResponse.json(
      { error: "Operación no encontrada." },
      { status: 404 },
    );
  }
  if (!esEquipo(user.role) && op.user_id !== user.id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  return NextResponse.json({ participantes: getParticipantesByOperation(id) });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const op = await getOperationById(id);
  if (!op) {
    return NextResponse.json(
      { error: "Operación no encontrada." },
      { status: 404 },
    );
  }
  // El dueño de la operación (cliente) o el equipo del estudio pueden invitar.
  if (!esEquipo(user.role) && op.user_id !== user.id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  if (getParticipantesByOperation(id).length >= MAX_PARTICIPANTES) {
    return NextResponse.json(
      { error: `Solo se permiten ${MAX_PARTICIPANTES} participantes por operación.` },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    nombre?: string;
    email?: string;
    rol?: string;
  } | null;
  const nombre = String(body?.nombre ?? "").trim();
  const email = String(body?.email ?? "").trim();
  const rol = String(body?.rol ?? "").trim().slice(0, 300) || null;
  if (!nombre) {
    return NextResponse.json(
      { error: "Poné el nombre del participante." },
      { status: 400 },
    );
  }
  // El email es obligatorio: es a donde le enviamos el link de acceso.
  if (!email) {
    return NextResponse.json(
      { error: "El email es obligatorio: ahí le enviamos el link de acceso." },
      { status: 400 },
    );
  }
  if (!esEmailValido(email)) {
    return NextResponse.json(
      { error: "Revisá el email: no parece válido." },
      { status: 400 },
    );
  }

  const participante = addParticipante({
    operationId: id,
    ownerId: op.user_id,
    nombre,
    email,
    rol,
  });

  // Enviamos el link por email. Si el envío no está configurado o falla, NO
  // perdemos el participante (el link igual sirve para copiarlo a mano), pero
  // avisamos al frontend para que muestre la advertencia.
  const origin = process.env.APP_URL?.replace(/\/$/, "") || req.nextUrl.origin;
  const link = `${origin}/p/${participante.token}`;
  let emailEnviado = false;
  let emailError: string | null = null;
  if (emailDisponible()) {
    try {
      await enviarInvitacionParticipante({
        to: email,
        nombre,
        link,
        cliente: op.company_name,
        esExport: op.tipo.toLowerCase().startsWith("exp"),
      });
      emailEnviado = true;
    } catch (e) {
      emailError = e instanceof Error ? e.message : "No se pudo enviar el email.";
    }
  } else {
    emailError = "El envío de emails no está configurado (RESEND_API_KEY).";
  }

  const detallePartes: string[] = [];
  if (rol) detallePartes.push(`Cumple el rol: ${rol}`);
  detallePartes.push(`Email: ${email}`);
  detallePartes.push(
    emailEnviado
      ? "Le enviamos el link de acceso por email."
      : "No se pudo enviar el email; hay que pasarle el link a mano.",
  );

  // Si lo suma el CLIENTE (dueño), marcamos el autor con el sufijo de rol para
  // que aparezca como novedad en Operaciones del estudio. Si lo suma el equipo,
  // queda como nota normal sin generar notificación.
  const autorBase =
    user.contact_name ??
    user.company_name ??
    user.username ??
    user.email ??
    null;
  await addEvento({
    operationId: id,
    userId: op.user_id,
    tipo: "nota",
    titulo: `Se sumó a ${nombre} como participante`,
    detalle: detallePartes.join("\n"),
    autor: esEquipo(user.role)
      ? autorBase
      : `${autorBase ?? "Cliente"}${SUFIJO_CLIENTE}`,
  });

  return NextResponse.json({ participante, emailEnviado, emailError });
}
