import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { getDocumentsByOperation, getOperationById } from "@/lib/data";
import { dentroDeClientes, rutaArchivo } from "@/lib/parquet-store";
import {
  confirmarPosicionNcm,
  iaDocsDisponible,
  type ArchivoIA,
} from "@/lib/ia-documentos";
import { DOC_LABELS, type DocType } from "@/lib/docs";
import { arancelPorNcm, descripcionPartida, ncmEsPosicionEspecifica } from "@/lib/clasificador/motor";

// Documentos útiles para confirmar la posición de un producto conocido.
const RELEVANTES: DocType[] = ["catalogo", "proforma", "factura_comercial"];
const MAX_ARCHIVOS = 3;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !esEquipo(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  if (!iaDocsDisponible()) {
    return NextResponse.json(
      { error: "La IA no está configurada (falta ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;
  const op = await getOperationById(id);
  if (!op) {
    return NextResponse.json(
      { error: "Operación no encontrada." },
      { status: 404 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { ncm?: string };
  const ncm = (body.ncm ?? "").trim();
  const digitos = ncm.replace(/\D/g, "");
  if (digitos.length < 8) {
    return NextResponse.json(
      {
        error:
          "Ingresá una NCM específica (al menos 8 dígitos). Una subpartida de 6 dígitos es demasiado general.",
      },
      { status: 400 },
    );
  }

  const especifica = await ncmEsPosicionEspecifica(digitos);
  if (!especifica.ok) {
    return NextResponse.json(
      { error: especifica.motivo ?? "NCM demasiado general." },
      { status: 400 },
    );
  }

  // Anclamos la posición contra el nomenclador oficial: si no existe, avisamos.
  const arancel = await arancelPorNcm(digitos);
  if (!arancel) {
    return NextResponse.json(
      {
        error:
          "Esa NCM no figura en el nomenclador. Revisá el código antes de confirmar.",
      },
      { status: 400 },
    );
  }
  const partidaDesc = await descripcionPartida(digitos.slice(0, 4));

  // Adjuntamos ficha técnica / proforma si están, por orden de prioridad.
  const docs = await getDocumentsByOperation(op.id, op.user_id);
  const ordenados = [...docs]
    .filter((d) => RELEVANTES.includes(d.doc_type))
    .sort(
      (a, b) => RELEVANTES.indexOf(a.doc_type) - RELEVANTES.indexOf(b.doc_type),
    );

  const archivos: ArchivoIA[] = [];
  for (const d of ordenados) {
    if (archivos.length >= MAX_ARCHIVOS) break;
    const fullPath = rutaArchivo(d.user_id, d.stored_name);
    if (!dentroDeClientes(fullPath)) continue;
    const bytes = await readFile(fullPath).catch(() => null);
    if (!bytes) continue;
    archivos.push({
      rol: DOC_LABELS[d.doc_type] ?? "Documento",
      nombre: d.file_name,
      mediaType: d.mime_type || "application/octet-stream",
      base64: Buffer.from(bytes).toString("base64"),
    });
  }

  try {
    const confirmacion = await confirmarPosicionNcm({
      ncm: digitos,
      producto: op.mercaderia ?? op.titulo ?? "",
      posicionOficial: partidaDesc || null,
      diOficial: arancel.di,
      archivos,
    });
    return NextResponse.json({
      ok: true,
      confirmacion,
      ncm8: arancel.ncm8,
      di: arancel.di,
      posicion: partidaDesc || null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo confirmar con IA." },
      { status: 502 },
    );
  }
}
