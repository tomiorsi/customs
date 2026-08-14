import { NextResponse, type NextRequest } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { cryptoId } from "@/lib/db";
import { archivosDir } from "@/lib/parquet-store";
import {
  addDocument,
  addEvento,
  getOperationById,
  SUFIJO_CLIENTE,
} from "@/lib/data";
import {
  DOC_LABELS,
  docLabelDe,
  type DocType,
} from "@/lib/docs";
import { encolarAnalisisDocumentoSubido } from "@/lib/subida-documento";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB por archivo

/**
 * Formatos que se aceptan en una carpeta: facturas, BL, certificados, planillas.
 *
 * La lista blanca importa porque los documentos después se sirven de vuelta
 * desde nuestro propio dominio. Sin ella, alguien podría subir un HTML con
 * scripts y hacer que se ejecute en el contexto del portal.
 */
const TIPO_ARCHIVO_PERMITIDO =
  /^(application\/pdf|image\/(jpeg|png|webp|heic|heif|tiff)|application\/msword|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|application\/vnd\.ms-excel|text\/plain|text\/csv)$/i;
const TIPOS_VALIDOS = new Set<DocType>(
  Object.keys(DOC_LABELS) as DocType[],
);

function nombreSeguro(nombre: string): string {
  const base = nombre.replace(/[^\w.\-]+/g, "_").slice(-120);
  return base || "archivo";
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const op = await getOperationById(id);
  if (!op) {
    return NextResponse.json(
      { error: "Operación no encontrada." },
      { status: 404 },
    );
  }

  if (!esEquipo(user.role) && op.user_id !== user.id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Adjuntá un archivo." },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `El archivo supera el máximo de 15 MB.` },
      { status: 400 },
    );
  }
  if (!TIPO_ARCHIVO_PERMITIDO.test(file.type || "")) {
    return NextResponse.json(
      {
        error:
          "Formato no admitido. Subí PDF, imagen, Word, Excel o texto plano.",
      },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const docTypeRaw = String(form.get("docType") ?? "");
  const tipoManual: DocType | null =
    docTypeRaw !== "auto" && TIPOS_VALIDOS.has(docTypeRaw as DocType)
      ? (docTypeRaw as DocType)
      : null;

  /** Sin clasificar por nombre: queda otro hasta que la IA lea el contenido. */
  const docTypeProvisional: DocType = tipoManual ?? "otro";

  const dir = archivosDir(op.user_id);
  await mkdir(dir, { recursive: true });

  const storedName = `${op.id}__${cryptoId()}__${nombreSeguro(file.name)}`;
  await writeFile(path.join(dir, storedName), buffer);

  const docId = await addDocument({
    operationId: op.id,
    userId: op.user_id,
    docType: docTypeProvisional,
    fileName: file.name,
    storedName,
    mimeType: file.type || null,
    size: file.size,
  });

  const base64 = buffer.toString("base64");
  const mediaType = file.type || "application/octet-stream";
  encolarAnalisisDocumentoSubido(op, {
    operationId: op.id,
    docId,
    userId: op.user_id,
    storedName,
    fileName: file.name,
    fileSize: file.size,
    mediaType,
    base64,
    docTypeProvisional,
    tipoManual,
  });

  if (!esEquipo(user.role)) {
    await addEvento({
      operationId: op.id,
      userId: op.user_id,
      tipo: "documento",
      titulo: `Se cargó ${docLabelDe(docTypeProvisional, op.via)}`,
      detalle: file.name,
      interno: true,
      autor: `${
        user.contact_name ??
        user.company_name ??
        user.username ??
        user.email ??
        "Cliente"
      }${SUFIJO_CLIENTE}`,
    });
  }

  return NextResponse.json({ ok: true });
}
