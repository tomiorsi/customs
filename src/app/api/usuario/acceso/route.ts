import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { verifyPassword } from "@/lib/hash";
import { SESSION_COOKIE, getUserByToken } from "@/lib/auth-server";

/**
 * Cambia el nombre de usuario con el que se entra al portal.
 *
 * Pide la contraseña actual: cambiar el identificador de acceso es tan
 * sensible como cambiar la clave, y si alguien deja la sesión abierta no
 * queremos que pueda quedarse con la cuenta.
 */

const FORMATO = /^[a-z0-9._-]{3,32}$/i;

export async function POST(req: Request) {
  const store = await cookies();
  const user = getUserByToken(store.get(SESSION_COOKIE)?.value);
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const usuario = String(body.usuario ?? "").trim();
  const actual = String(body.actual ?? "");

  if (!FORMATO.test(usuario)) {
    return NextResponse.json(
      {
        error:
          "El usuario debe tener entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo.",
      },
      { status: 400 },
    );
  }
  if (!verifyPassword(actual, user.password_hash)) {
    return NextResponse.json(
      { error: "La contraseña actual no es correcta." },
      { status: 400 },
    );
  }

  const db = getDb();
  const tomado = db
    .prepare("SELECT id FROM users WHERE lower(username) = lower(?) AND id <> ?")
    .get(usuario, user.id);
  if (tomado) {
    return NextResponse.json(
      { error: "Ese usuario ya está en uso." },
      { status: 409 },
    );
  }

  db.prepare("UPDATE users SET username = ? WHERE id = ?").run(usuario, user.id);
  return NextResponse.json({ ok: true, usuario });
}
