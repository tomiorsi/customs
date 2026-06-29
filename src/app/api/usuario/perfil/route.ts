import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser, toSafeUser, type DBUser } from "@/lib/auth-server";

/**
 * Actualiza los datos de perfil del usuario logueado (razón social, datos
 * fiscales y contacto). No toca email, contraseña ni la carta de garantía (esta
 * última la gestiona el estudio desde el panel de Clientes).
 */
export async function POST(req: Request) {
  const current = await getCurrentUser();
  if (!current) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const companyName = String(body.companyName ?? "").trim();
  if (!companyName) {
    return NextResponse.json(
      { error: "La razón social / nombre es obligatoria." },
      { status: 400 },
    );
  }

  const personType =
    String(body.personType ?? "").trim() === "fisica" ? "fisica" : "juridica";
  const cuit = String(body.cuit ?? "").trim();
  const ivaCondition = String(body.ivaCondition ?? "").trim();
  const certExencion =
    String(body.certExencion ?? "").trim() === "si" ? "si" : "no";
  const contactName = String(body.contactName ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const address = String(body.address ?? "").trim();

  const db = getDb();
  db.prepare(
    `UPDATE users SET
       company_name = ?, person_type = ?, cuit = ?, iva_condition = ?,
       cert_exencion = ?,
       contact_name = ?, phone = ?, address = ?
     WHERE id = ?`,
  ).run(
    companyName,
    personType,
    cuit || null,
    ivaCondition || null,
    certExencion,
    contactName || null,
    phone || null,
    address || null,
    current.id,
  );

  const user = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(current.id) as DBUser;

  return NextResponse.json({ user: toSafeUser(user) });
}
