import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import {
  createCliente,
  darAccesoCliente,
  setPortalHabilitadoCliente,
  updateCliente,
} from "@/lib/data";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  // Crear el registro del cliente: admin y operador (subadmin) por igual.
  if (!esEquipo(user?.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const res = createCliente({
    companyName: String(body.companyName ?? "").trim(),
    email: String(body.email ?? "").trim() || null,
    cuit: String(body.cuit ?? "").trim() || null,
    ivaCondition: String(body.ivaCondition ?? "").trim() || null,
    contactName: String(body.contactName ?? "").trim() || null,
    phone: String(body.phone ?? "").trim() || null,
    personType: String(body.personType ?? "").trim() || null,
  });

  if (res.error) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ id: res.id });
}

/** Edita los datos de un cliente existente: admin y operador (subadmin). */
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!esEquipo(user?.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Falta el cliente." }, { status: 400 });
  }
  // Actualización parcial: sólo mandamos a la capa de datos las claves presentes,
  // así se puede editar una sola celda sin pisar el resto de los campos.
  const input: Partial<Parameters<typeof updateCliente>[1]> = {};
  if ("companyName" in body) input.companyName = String(body.companyName ?? "").trim();
  if ("email" in body) input.email = String(body.email ?? "").trim() || null;
  if ("cuit" in body) input.cuit = String(body.cuit ?? "").trim() || null;
  if ("ivaCondition" in body)
    input.ivaCondition = String(body.ivaCondition ?? "").trim() || null;
  if ("contactName" in body)
    input.contactName = String(body.contactName ?? "").trim() || null;
  if ("phone" in body) input.phone = String(body.phone ?? "").trim() || null;
  if ("personType" in body)
    input.personType = String(body.personType ?? "").trim() || null;
  const res = updateCliente(id, input);
  if (res.error) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

/** Genera/actualiza el acceso (login) de un cliente existente. Solo admin. */
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const res = darAccesoCliente(
    String(body.clienteId ?? "").trim(),
    String(body.email ?? ""),
    String(body.password ?? ""),
  );
  if (res.error) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

/** Revoca el acceso (portal) de un cliente, sin borrar su registro. Solo admin. */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.clienteId ?? body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Falta el cliente." }, { status: 400 });
  }
  setPortalHabilitadoCliente(id, false);
  return NextResponse.json({ ok: true });
}
