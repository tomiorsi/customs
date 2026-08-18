import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth-server";
import { esDuenoDeEstudio, esEquipo, estudioDe } from "@/lib/roles";
import {
  borrarLogo,
  guardarLogo,
  logoDeEstudio,
  rutaLogo,
} from "@/lib/logo-estudio";

/**
 * Logo del estudio.
 *
 * GET lo sirve para previsualizarlo; POST y DELETE lo cambian y solo los puede
 * usar el dueño del estudio. Un empleado lo VE —le sale en los PDF que
 * descarga— pero no lo cambia: es la marca del estudio, no la suya.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const archivo = logoDeEstudio(user);
  if (!archivo) return new NextResponse(null, { status: 404 });

  try {
    const bytes = await readFile(rutaLogo(estudioDe(user), archivo));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": archivo.toLowerCase().endsWith(".png")
          ? "image/png"
          : "image/jpeg",
        // El nombre cambia en cada subida, así que el archivo es inmutable.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !esEquipo(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!esDuenoDeEstudio(user)) {
    return NextResponse.json(
      { error: "Solo el dueño del estudio puede cambiar el logo." },
      { status: 403 },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Elegí un archivo." }, { status: 400 });
  }

  const res = await guardarLogo(user, file);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user || !esEquipo(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!esDuenoDeEstudio(user)) {
    return NextResponse.json(
      { error: "Solo el dueño del estudio puede cambiar el logo." },
      { status: 403 },
    );
  }
  await borrarLogo(user);
  return NextResponse.json({ ok: true });
}
