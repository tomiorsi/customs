import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import {
  aprobarCliente,
  rechazarCliente,
  revocarCliente,
} from "@/lib/onboarding";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    userId?: string;
    action?: string;
    motivo?: string;
  } | null;
  const userId = String(body?.userId ?? "").trim();
  const action = String(body?.action ?? "").trim();
  if (
    !userId ||
    (action !== "approve" && action !== "reject" && action !== "revoke")
  ) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (action === "approve") {
    aprobarCliente(userId);
    return NextResponse.json({ ok: true, status: "approved" });
  }

  if (action === "revoke") {
    revocarCliente(userId);
    return NextResponse.json({ ok: true, status: "none" });
  }

  const motivo =
    String(body?.motivo ?? "").trim() ||
    "Tras revisar tu solicitud, por ahora no podemos avanzar con tu operación.";
  rechazarCliente(userId, motivo);
  return NextResponse.json({ ok: true, status: "rejected" });
}
