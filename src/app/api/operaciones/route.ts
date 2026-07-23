import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth-server";
import { cryptoId } from "@/lib/db";
import { archivosDir } from "@/lib/parquet-store";
import {
  OP_CAMPOS,
  addDocument,
  addEvento,
  createOperation,
  existeCliente,
  type DocType,
  type NewOperationInput,
  type OpCampo,
} from "@/lib/data";
import { docLabelDe } from "@/lib/docs";
import { esEquipo } from "@/lib/roles";

const TIPOS_VALIDOS = new Set(["Importación", "Exportación"]);
const VIAS_VALIDAS = new Set(["maritima", "aerea", "terrestre"]);
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB por archivo

const CAMPOS_DOC: { campo: string; tipo: DocType }[] = [
  { campo: "pedido_compra", tipo: "pedido_compra" },
  { campo: "proforma", tipo: "proforma" },
  { campo: "factura_comercial", tipo: "factura_comercial" },
  { campo: "packing_list", tipo: "packing_list" },
  { campo: "transporte", tipo: "transporte" },
  { campo: "catalogo", tipo: "catalogo" },
];

function nombreSeguro(nombre: string): string {
  const base = nombre.replace(/[^\w.\-]+/g, "_").slice(-120);
  return base || "archivo";
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  // Control interno: solo el equipo (admin/operador) crea operaciones, siempre
  // a nombre de un cliente. Los clientes ya no dan de alta operaciones.
  if (!esEquipo(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const clienteId = String(form.get("cliente_id") ?? "").trim();
  if (!clienteId || !existeCliente(clienteId)) {
    return NextResponse.json(
      { error: "Elegí un cliente válido para la operación." },
      { status: 400 },
    );
  }
  const ownerId = clienteId;

  const tipo = String(form.get("tipo") ?? "").trim();
  if (!TIPOS_VALIDOS.has(tipo)) {
    return NextResponse.json(
      { error: "Elegí si es una importación o exportación." },
      { status: 400 },
    );
  }

  // Tomamos todos los campos de texto de forma genérica (todos opcionales).
  const campos: Partial<Record<OpCampo, string | null>> = {};
  for (const campo of OP_CAMPOS) {
    const valor = String(form.get(campo) ?? "").trim();
    campos[campo] = valor || null;
  }
  if (!campos.titulo) {
    return NextResponse.json(
      { error: "Ponele un nombre a la operación para identificarla." },
      { status: 400 },
    );
  }
  // La vía sólo se acepta si es un valor conocido.
  if (campos.via && !VIAS_VALIDAS.has(campos.via)) {
    campos.via = null;
  }

  const nuevaOperacion: NewOperationInput = { userId: ownerId, tipo, ...campos };

  // Recolectamos los archivos presentes. Todos son opcionales: la operación se
  // puede abrir sin documentos y sumarlos después.
  const archivos: { tipo: DocType; file: File }[] = [];
  for (const { campo, tipo: docType } of CAMPOS_DOC) {
    const f = form.get(campo);
    if (f instanceof File && f.size > 0) {
      archivos.push({ tipo: docType, file: f });
    }
  }
  for (const f of form.getAll("otros")) {
    if (f instanceof File && f.size > 0) {
      archivos.push({ tipo: "otro", file: f });
    }
  }

  for (const { file } of archivos) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `El archivo "${file.name}" supera el máximo de 15 MB.` },
        { status: 400 },
      );
    }
  }

  const operationId = await createOperation(nuevaOperacion);

  // Armamos una nota de recepción con detalle: tipo, qué documentación llegó y
  // el próximo paso. Sirve para el seguimiento y, más adelante, para WhatsApp.
  const tipoLabel = tipo.toLowerCase().startsWith("exp")
    ? "exportación"
    : "importación";
  const labelsDocs: string[] = [];
  for (const { campo, tipo: docType } of CAMPOS_DOC) {
    const f = form.get(campo);
    if (f instanceof File && f.size > 0) {
      labelsDocs.push(docLabelDe(docType, campos.via ?? null));
    }
  }
  const nOtros = archivos.filter((a) => a.tipo === "otro").length;
  if (nOtros > 0) {
    labelsDocs.push(
      `${nOtros} documento${nOtros > 1 ? "s" : ""} adicional${
        nOtros > 1 ? "es" : ""
      }`,
    );
  }

  const autorNombre =
    user.contact_name ?? user.company_name ?? user.username ?? user.email ?? null;

  const detalleCreacion =
    `Operación de ${tipoLabel} «${campos.titulo}» creada por el equipo del estudio` +
    (autorNombre ? ` (${autorNombre})` : "") +
    "." +
    (labelsDocs.length > 0 ? ` Documentación cargada: ${labelsDocs.join(", ")}.` : "");

  await addEvento({
    operationId,
    userId: ownerId,
    tipo: "creacion",
    titulo: "Operación creada por el equipo",
    detalle: detalleCreacion,
    autor: autorNombre,
    interno: true,
  });

  if (archivos.length > 0) {
    const dir = archivosDir(ownerId);
    await mkdir(dir, { recursive: true });

    for (const { tipo: docType, file } of archivos) {
      const storedName = `${operationId}__${cryptoId()}__${nombreSeguro(file.name)}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(dir, storedName), buffer);
      await addDocument({
        operationId,
        userId: ownerId,
        docType,
        fileName: file.name,
        storedName,
        mimeType: file.type || null,
        size: file.size,
      });
    }
  }

  return NextResponse.json({ id: operationId });
}
