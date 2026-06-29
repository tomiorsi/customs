import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { getDocumentsByOperation, getOperationById } from "@/lib/data";
import { dentroDeClientes, rutaArchivo } from "@/lib/parquet-store";
import {
  describirProductoDesdeDocs,
  iaDocsDisponible,
  type ArchivoIA,
} from "@/lib/ia-documentos";
import { DOC_LABELS, type DocType } from "@/lib/docs";
import { clasificarProducto } from "@/lib/clasificador";
import { mensajeErrorIa } from "@/lib/clasificador/ia";
import { enriquecerContextoClasificacion } from "@/lib/clasificador/estado-clasificacion";
import type { ContextoClasificacion, Respuesta } from "@/lib/clasificador/tipos";

// Documentos del paso 1 que ayudan a describir/clasificar el producto.
const RELEVANTES: DocType[] = [
  "catalogo",
  "factura_comercial",
  "proforma",
  "pedido_compra",
  "packing_list",
];
const MAX_ARCHIVOS = 4;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !esEquipo(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const op = await getOperationById(id);
  if (!op) {
    return NextResponse.json(
      { error: "Operación no encontrada." },
      { status: 404 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    producto?: string;
    respuestas?: Respuesta[];
    ncmMaquina?: string;
    equipoReferencia?: string;
  };
  const productoEntrada = String(body.producto ?? "").trim();
  const respuestas = Array.isArray(body.respuestas)
    ? body.respuestas
        .filter(
          (r) =>
            r && typeof r.pregunta === "string" && typeof r.opcion === "string",
        )
        .map((r) => ({
          pregunta: r.pregunta,
          opcion: r.opcion,
          consecuencia:
            typeof r.consecuencia === "string" && r.consecuencia.trim()
              ? r.consecuencia.trim()
              : undefined,
        }))
    : undefined;

  // En la PRIMERA clasificación (sin respuestas todavía) consolidamos una
  // descripción técnica leyendo los documentos del paso 1 + lo que cargó el
  // cliente. En las rondas de afinado reusamos el texto ya enriquecido que
  // manda el cliente, para no releer los documentos en cada pregunta.
  let producto = productoEntrada || op.mercaderia || op.titulo || "";
  const yaAfinando = Boolean(respuestas && respuestas.length > 0);

  if (!yaAfinando && iaDocsDisponible()) {
    const docs = await getDocumentsByOperation(op.id, op.user_id);
    const ordenados = [...docs]
      .filter((d) => RELEVANTES.includes(d.doc_type))
      .sort(
        (a, b) =>
          RELEVANTES.indexOf(a.doc_type) - RELEVANTES.indexOf(b.doc_type),
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

    if (archivos.length > 0) {
      producto = await describirProductoDesdeDocs(
        archivos,
        productoEntrada || op.mercaderia || op.titulo || "",
      );
    }
  }

  if (producto.trim().length < 2) {
    return NextResponse.json(
      { error: "Falta una descripción del producto para clasificar." },
      { status: 400 },
    );
  }

  try {
    const baseCtx: ContextoClasificacion = {
      ncmMaquina: body.ncmMaquina?.trim() || undefined,
      equipoReferencia: body.equipoReferencia?.trim() || undefined,
    };
    const contexto = await enriquecerContextoClasificacion(
      producto,
      baseCtx,
      respuestas ?? [],
    );
    const resultado = await clasificarProducto(producto, respuestas, contexto);
    return NextResponse.json({ ok: true, resultado, producto });
  } catch (e) {
    console.error("clasificar (operación):", e);
    const { texto, transitorio } = mensajeErrorIa(e);
    return NextResponse.json(
      {
        ok: false,
        error: texto,
        resultado: {
          producto,
          via: "ia",
          decision: "SIN_RESULTADO",
          justificacion: texto,
        },
      },
      { status: transitorio ? 503 : 500 },
    );
  }
}
