import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { leerCatalogoParaClasificar } from "@/lib/nomenclador-desde-documento";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const TIPOS = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/** Solo lectura del PDF/imagen — la NCM se pide en `/api/clasificar`. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Adjuntá un PDF o imagen del catálogo." },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "El archivo supera el máximo de 15 MB." },
      { status: 400 },
    );
  }

  const mediaType = file.type || "application/octet-stream";
  if (!TIPOS.has(mediaType)) {
    return NextResponse.json(
      { error: "Formato no soportado. Usá PDF, JPG, PNG, GIF o WebP." },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { texto, resumen } = await leerCatalogoParaClasificar({
      rol: "catálogo / ficha técnica",
      nombre: file.name,
      mediaType,
      base64: buffer.toString("base64"),
    });

    return NextResponse.json({
      ok: true,
      texto,
      resumen,
      archivo: file.name,
    });
  } catch (e) {
    console.error("clasificar/catalogo:", e);
    const msg =
      e instanceof Error ? e.message : "No se pudo leer el catálogo.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
