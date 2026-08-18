import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import {
  addMensajeSoporte,
  getMensajesSoporte,
  marcarLeidoSoporte,
} from "@/lib/soporte";

/**
 * Respuestas del equipo de soporte. Solo el admin de la plataforma: soporte lo
 * da el dueño del producto, no cada estudio.
 */
async function admin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function GET(req: Request) {
  const user = await admin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const cuentaId = new URL(req.url).searchParams.get("cuenta")?.trim();
  if (!cuentaId) return NextResponse.json({ error: "Falta la cuenta." }, { status: 400 });

  const mensajes = getMensajesSoporte(cuentaId);
  marcarLeidoSoporte(cuentaId, "soporte");
  return NextResponse.json({ mensajes });
}

export async function POST(req: Request) {
  const user = await admin();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const cuentaId = String(body.cuentaId ?? "").trim();
  if (!cuentaId) return NextResponse.json({ error: "Falta la cuenta." }, { status: 400 });

  const res = addMensajeSoporte({
    cuentaId,
    origen: "soporte",
    autor: user.company_name || user.contact_name || "Soporte",
    texto: String(body.texto ?? ""),
  });
  if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });

  return NextResponse.json({ mensajes: getMensajesSoporte(cuentaId) });
}
