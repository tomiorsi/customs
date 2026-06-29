import { NextResponse, type NextRequest } from "next/server";
import { readFile, unlink } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { dentroDeClientes, rutaArchivo } from "@/lib/parquet-store";
import {
  getDocumentById,
  removeDocument,
  updateDocumentTipo,
} from "@/lib/data";
import { DOC_LABELS, type DocType } from "@/lib/docs";
import { procesarEliminacionDocumento } from "@/lib/validacion-doc";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const doc = await getDocumentById(id);
  if (!doc) {
    return NextResponse.json(
      { error: "Documento no encontrado." },
      { status: 404 },
    );
  }

  // El equipo del estudio puede ver todo; el cliente sólo sus documentos.
  if (!esEquipo(user.role) && doc.user_id !== user.id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  // Evitamos path traversal: resolvemos y verificamos que quede dentro de data/clientes.
  const fullPath = rutaArchivo(doc.user_id, doc.stored_name);
  if (!dentroDeClientes(fullPath)) {
    return NextResponse.json({ error: "Ruta inválida." }, { status: 400 });
  }

  const data = await readFile(fullPath).catch(() => null);
  if (!data) {
    return NextResponse.json(
      { error: "El archivo ya no está disponible." },
      { status: 404 },
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", doc.mime_type || "application/octet-stream");
  headers.set(
    "Content-Disposition",
    `inline; filename="${encodeURIComponent(doc.file_name)}"`,
  );
  return new NextResponse(new Uint8Array(data), { headers });
}

/** Reclasifica un documento (cambia su tipo/categoría). Sólo el equipo. */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !esEquipo(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const doc = await getDocumentById(id);
  if (!doc) {
    return NextResponse.json(
      { error: "Documento no encontrado." },
      { status: 404 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    docType?: string;
  } | null;
  const docType = body?.docType as DocType | undefined;
  if (!docType || !(docType in DOC_LABELS)) {
    return NextResponse.json(
      { error: "Tipo de documento inválido." },
      { status: 400 },
    );
  }

  const actualizado = await updateDocumentTipo(doc.user_id, id, docType);
  if (!actualizado) {
    return NextResponse.json(
      { error: "No se pudo actualizar el documento." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, doc: actualizado });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const doc = await getDocumentById(id);
  if (!doc) {
    return NextResponse.json(
      { error: "Documento no encontrado." },
      { status: 404 },
    );
  }

  // El dueño del documento o el equipo del estudio pueden eliminarlo.
  if (!esEquipo(user.role) && doc.user_id !== user.id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { operation_id, doc_type, user_id, file_name } = doc;

  // Borramos el archivo físico (si la ruta es válida) y luego la metadata.
  const fullPath = rutaArchivo(doc.user_id, doc.stored_name);
  if (dentroDeClientes(fullPath)) {
    await unlink(fullPath).catch(() => {});
  }
  await removeDocument(doc.user_id, id);

  if (operation_id) {
    try {
      await procesarEliminacionDocumento({
        ownerId: user_id,
        operationId: operation_id,
        docType: doc_type as DocType,
        fileName: file_name,
      });
    } catch {
      /* best-effort: el archivo ya no está */
    }
  }

  // No registramos evento al eliminar un documento: el manejo de archivos del
  // estudio no debe ensuciar el seguimiento de la operación.

  return NextResponse.json({ ok: true });
}
