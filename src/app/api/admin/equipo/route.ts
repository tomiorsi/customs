import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import {
  createOperador,
  getOperadores,
  removeOperador,
  updateOperador,
} from "@/lib/data";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return NextResponse.json({ operadores: getOperadores() });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    nombre?: string;
    username?: string;
    email?: string;
    password?: string;
  } | null;

  const nombre = String(body?.nombre ?? "").trim();
  const username = String(body?.username ?? "").trim();
  const email = String(body?.email ?? "").trim();
  const password = String(body?.password ?? "");

  if (!nombre || !username || password.length < 4) {
    return NextResponse.json(
      {
        error:
          "Completá nombre, usuario y una contraseña de al menos 4 caracteres.",
      },
      { status: 400 },
    );
  }

  try {
    const { id } = createOperador({
      nombre,
      username,
      email: email || null,
      password,
    });
    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json(
      { error: "Ese usuario o email ya está en uso." },
      { status: 409 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    nombre?: string;
    username?: string;
    email?: string;
    password?: string;
  } | null;

  const id = String(body?.id ?? "").trim();
  const nombre = String(body?.nombre ?? "").trim();
  const username = String(body?.username ?? "").trim();
  const email = String(body?.email ?? "").trim();
  const password = String(body?.password ?? "");

  if (!id) {
    return NextResponse.json({ error: "Falta el id." }, { status: 400 });
  }
  if (!nombre || !username) {
    return NextResponse.json(
      { error: "Completá nombre y usuario." },
      { status: 400 },
    );
  }
  if (password && password.length < 4) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 4 caracteres." },
      { status: 400 },
    );
  }

  try {
    updateOperador({
      id,
      nombre,
      username,
      email: email || null,
      password: password || null,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Ese usuario o email ya está en uso." },
      { status: 409 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  const id = String(body?.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Falta el id." }, { status: 400 });
  }
  removeOperador(id);
  return NextResponse.json({ ok: true });
}
