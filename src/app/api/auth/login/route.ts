import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { verifyPassword } from "@/lib/hash";
import {
  SESSION_COOKIE,
  createSession,
  toSafeUser,
  type DBUser,
} from "@/lib/auth-server";

export async function POST(req: Request) {
  const { identifier, password } = await req.json().catch(() => ({}));

  if (!identifier || !password) {
    return NextResponse.json(
      { error: "Completá usuario/email y contraseña." },
      { status: 400 },
    );
  }

  const db = getDb();
  const user = db
    .prepare("SELECT * FROM users WHERE username = ? OR email = ?")
    .get(String(identifier).trim(), String(identifier).trim().toLowerCase()) as
    | DBUser
    | undefined;

  if (!user || !verifyPassword(String(password), user.password_hash)) {
    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos." },
      { status: 401 },
    );
  }

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
