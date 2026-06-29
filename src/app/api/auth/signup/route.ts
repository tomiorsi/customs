import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cryptoId, getDb } from "@/lib/db";
import { hashPassword } from "@/lib/hash";
import {
  SESSION_COOKIE,
  createSession,
  toSafeUser,
  type DBUser,
} from "@/lib/auth-server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const companyName = String(body.companyName ?? "").trim();
  const personTypeRaw = String(body.personType ?? "").trim();
  const personType = personTypeRaw === "fisica" ? "fisica" : "juridica";
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const cuit = String(body.cuit ?? "").trim();
  const ivaCondition = String(body.ivaCondition ?? "").trim();
  const certExencion = String(body.certExencion ?? "").trim() === "si" ? "si" : "no";
  const contactName = String(body.contactName ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const address = String(body.address ?? "").trim();

  if (!companyName || !email || !password) {
    const nombreCampo =
      personType === "fisica" ? "Nombre y apellido" : "Razón social";
    return NextResponse.json(
      { error: `${nombreCampo}, email y contraseña son obligatorios.` },
      { status: 400 },
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 6 caracteres." },
      { status: 400 },
    );
  }

  const db = getDb();
  const existe = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existe) {
    return NextResponse.json(
      { error: "Ya existe una cuenta con ese email." },
      { status: 409 },
    );
  }

  const id = cryptoId();
  db.prepare(
    `INSERT INTO users
       (id, username, email, password_hash, role, company_name, person_type,
        cuit, iva_condition, cert_exencion, contact_name, phone, address)
     VALUES (?, NULL, ?, ?, 'client', ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    email,
    hashPassword(password),
    companyName,
    personType,
    cuit || null,
    ivaCondition || null,
    certExencion,
    contactName || null,
    phone || null,
    address || null,
  );

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as DBUser;

  const { token, expires } = createSession(user.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });

  return NextResponse.json({ user: toSafeUser(user) });
}
