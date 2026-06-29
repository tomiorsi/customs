import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { addEvento, getOperationById } from "@/lib/data";
import { emailDisponible, enviarMensajeCliente, esEmailValido } from "@/lib/email";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  // Sólo el estudio (admin u operador) puede sumar notas al seguimiento.
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

  const body = (await req.json().catch(() => null)) as {
    texto?: string;
    interno?: boolean;
  } | null;
  const texto = String(body?.texto ?? "").trim();
  if (!texto) {
    return NextResponse.json(
      { error: "Escribí una nota." },
      { status: 400 },
    );
  }

  const interno = Boolean(body?.interno);
  const autor =
    user.contact_name ??
    user.company_name ??
    user.username ??
    user.email ??
    null;

  const evento = await addEvento({
    operationId: op.id,
    userId: op.user_id,
    tipo: "nota",
    titulo: texto.slice(0, 2000),
    interno,
    autor,
  });

  // Mensaje al cliente (no interno): además de aparecer en su seguimiento, se
  // lo avisamos por mail. Best-effort: si el envío falla, no rompemos la nota.
  let emailEnviado = false;
  if (
    !interno &&
    emailDisponible() &&
    op.client_email &&
    esEmailValido(op.client_email)
  ) {
    try {
      await enviarMensajeCliente({
        to: op.client_email,
        empresa: op.company_name,
        ref: op.ref,
        mensaje: texto,
        autor,
        link: `${req.nextUrl.origin}/inicio/operaciones/${op.id}`,
      });
      emailEnviado = true;
    } catch {
      emailEnviado = false;
    }
  }

  return NextResponse.json({ ok: true, evento, emailEnviado });
}
