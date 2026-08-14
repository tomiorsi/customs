import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { verifyPassword } from "@/lib/hash";
import {
  ipDeRequest,
  limpiarIntentos,
  puedeIntentar,
  registrarFallo,
} from "@/lib/rate-limit";
import {
  SESSION_COOKIE,
  createSession,
  toSafeUser,
  type DBUser,
} from "@/lib/auth-server";

/** Ocho intentos fallidos por IP; después hay que esperar quince minutos. */
const MAX_FALLOS = 8;
const VENTANA_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  const ip = ipDeRequest(req);
  const limite = puedeIntentar(ip, MAX_FALLOS);
  if (!limite.permitido) {
    const minutos = Math.ceil(limite.esperaSegundos / 60);
    return NextResponse.json(
      {
        error: `Demasiados intentos fallidos. Probá de nuevo en ${minutos} minuto${minutos === 1 ? "" : "s"}.`,
      },
      { status: 429, headers: { "Retry-After": String(limite.esperaSegundos) } },
    );
  }

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
    registrarFallo(ip, VENTANA_MS);
    // Un solo mensaje para usuario inexistente y contraseña incorrecta: decir
    // cuál de las dos falló le confirma a un atacante qué cuentas existen.
    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos." },
      { status: 401 },
    );
  }

  limpiarIntentos(ip);
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
