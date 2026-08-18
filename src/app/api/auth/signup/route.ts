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

/**
 * Alta de cuenta de despachante: es el único registro público.
 *
 * El importador no se registra solo — entra invitado por su despachante desde
 * Accesos. Es la única forma de que nazca dentro de una cartera; auto-registrado
 * quedaría sin estudio, sin bandeja y sin nadie con quien chatear.
 *
 * La cuenta nueva es dueña de su estudio (`despachante_id` en NULL): panel
 * completo, cartera propia vacía y sus propias subcuentas. Por eso el alta es
 * directa y no necesita aprobación: no da acceso a los datos de nadie.
 *
 * No se le pide nada más que nombre, email y contraseña: entra a probar y recién
 * al vencerse los días de prueba tiene que elegir un plan.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const companyName = String(body.companyName ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const cuit = String(body.cuit ?? "").trim();
  const contactName = String(body.contactName ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const address = String(body.address ?? "").trim();

  if (!companyName || !email || !password) {
    return NextResponse.json(
      { error: "Nombre o estudio, email y contraseña son obligatorios." },
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
       (id, username, email, password_hash, role, company_name,
        cuit, contact_name, phone, address, trial_hasta)
     VALUES (?, NULL, ?, ?, 'operador', ?, ?, ?, ?, ?, datetime('now', '+5 days'))`,
  ).run(
    id,
    email,
    hashPassword(password),
    companyName,
    cuit || null,
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
