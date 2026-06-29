import { NextResponse, type NextRequest } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { cryptoId } from "@/lib/db";
import { archivosDir } from "@/lib/parquet-store";
import {
  addDocument,
  addEvento,
  getOperationById,
  getParticipanteByToken,
  SUFIJO_PARTICIPANTE,
} from "@/lib/data";
import { DOC_LABELS, docLabelDe, type DocType } from "@/lib/docs";
import { encolarAnalisisDocumentoSubido } from "@/lib/subida-documento";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB por archivo
const TIPOS_VALIDOS = new Set<DocType>(Object.keys(DOC_LABELS) as DocType[]);

function nombreSeguro(nombre: string): string {
  const base = nombre.replace(/[^\w.\-]+/g, "_").slice(-120);
  return base || "archivo";
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const participante = getParticipanteByToken(token);
  if (!participante) {
    return NextResponse.json(
      { error: "This link is invalid or has been revoked." },
      { status: 404 },
    );
  }

  const op = await getOperationById(participante.operation_id);
  if (!op) {
    return NextResponse.json(
      { error: "This shipment no longer exists." },
      { status: 404 },
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const docTypeRaw = String(form.get("docType") ?? "");
  const tipoManual: DocType | null =
    docTypeRaw !== "auto" && TIPOS_VALIDOS.has(docTypeRaw as DocType)
      ? (docTypeRaw as DocType)
      : null;
  const docType: DocType = tipoManual ?? "otro";

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Attach a file." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "The file exceeds the 15 MB limit." },
      { status: 400 },
    );
  }

  const dir = archivosDir(participante.owner_id);
  await mkdir(dir, { recursive: true });

  const storedName = `${op.id}__${cryptoId()}__${nombreSeguro(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, storedName), buffer);

  const docId = await addDocument({
    operationId: op.id,
    userId: participante.owner_id,
    docType,
    fileName: file.name,
    storedName,
    mimeType: file.type || null,
    size: file.size,
  });

  encolarAnalisisDocumentoSubido(op, {
    operationId: op.id,
    docId,
    userId: participante.owner_id,
    storedName,
    fileName: file.name,
    fileSize: file.size,
    mediaType: file.type || "application/octet-stream",
    base64: buffer.toString("base64"),
    docTypeProvisional: docType,
    tipoManual,
  });

  await addEvento({
    operationId: op.id,
    userId: participante.owner_id,
    tipo: "documento",
    titulo: `Se cargó ${docLabelDe(docType, op.via)}`,
    detalle: file.name,
    interno: true,
    autor: `${participante.nombre}${SUFIJO_PARTICIPANTE}`,
  });

  return NextResponse.json({ ok: true });
}
