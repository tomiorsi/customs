import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/hash";
import { SESSION_COOKIE, getUserByToken } from "@/lib/auth-server";

/** Cambia la contraseña del usuario logueado, verificando la actual. */
export async function POST(req: Request) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const user = getUserByToken(token);
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const actual = String(body.actual ?? "");
  const nueva = String(body.nueva ?? "");

  if (nueva.length < 6) {
    return NextResponse.json(
      { error: "La nueva contraseña debe tener al menos 6 caracteres." },
      { status: 400 },
    );
  }
  if (!verifyPassword(actual, user.password_hash)) {
    return NextResponse.json(
      { error: "La contraseña actual no es correcta." },
      { status: 400 },
    );
  }

  getDb()
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(hashPassword(nueva), user.id);

  return NextResponse.json({ ok: true });
}
