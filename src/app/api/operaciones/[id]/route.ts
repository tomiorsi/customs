import { NextResponse, type NextRequest } from "next/server";
import { unlink } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth-server";
import {
  OP_CAMPOS,
  addEvento,
  getOperationById,
  removeOperation,
  updateOperationCampos,
  updateOperationEstado,
  type OpCampo,
} from "@/lib/data";
import { dentroDeClientes, rutaArchivo } from "@/lib/parquet-store";
import { esEstadoValido, estadoDescripcion, estadoLabel } from "@/lib/estados";
import { esEquipo } from "@/lib/roles";
import { CAMPOS_LABEL } from "@/lib/ia-documentos";
import { refrescarPendientesOperacion, camposDisparanPendientes } from "@/lib/validacion-doc";
import { ETAPA_INICIAL } from "@/lib/workflow";

const VIAS_VALIDAS = new Set(["maritima", "aerea", "terrestre"]);

function nombreAutor(u: {
  contact_name: string | null;
  company_name: string | null;
  username: string | null;
  email: string | null;
}): string | null {
  return u.contact_name ?? u.company_name ?? u.username ?? u.email ?? null;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !esEquipo(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    estado?: string;
    nota?: string;
  } | null;
  const estado = String(body?.estado ?? "").trim();
  const nota = String(body?.nota ?? "").trim();
  if (!esEstadoValido(estado)) {
    return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  }

  const op = await getOperationById(id);
  if (!op) {
    return NextResponse.json(
      { error: "Operación no encontrada." },
      { status: 404 },
    );
  }

  await updateOperationEstado(op.user_id, id, estado);
  // Si el admin no escribió una nota, usamos la descripción estándar de la etapa
  // para que el cliente igual vea un detalle claro de qué está pasando.
  const esExpo = op.tipo.toLowerCase().startsWith("exp");
  const detalle = nota
    ? nota.slice(0, 2000)
    : estadoDescripcion(estado, esExpo);
  await addEvento({
    operationId: id,
    userId: op.user_id,
    tipo: "estado",
    titulo: `Pasó a "${estadoLabel(estado)}"`,
    detalle: detalle || null,
    autor: nombreAutor(user),
  });
  return NextResponse.json({ ok: true, estado });
}

export async function PUT(
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

  // El dueño de la operación o el equipo del estudio pueden editarla.
  if (!esEquipo(user.role) && op.user_id !== user.id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  // El CLIENTE dueño sólo puede ponerle su propio alias al nombre (sólo lo ve
  // él). El título "oficial" y el resto de los datos los maneja el equipo.
  if (!esEquipo(user.role)) {
    const alias =
      "titulo" in body
        ? body.titulo == null
          ? null
          : String(body.titulo).trim() || null
        : undefined;
    if (alias === undefined) {
      return NextResponse.json({ ok: true });
    }
    await updateOperationCampos(op.user_id, id, { titulo_cliente: alias });
    return NextResponse.json({ ok: true });
  }

  const campos: Partial<Record<OpCampo, string | null>> = {};
  for (const c of OP_CAMPOS) {
    if (c in body) {
      const v = body[c];
      campos[c] = v == null ? null : String(v).trim() || null;
    }
  }

  if ("titulo" in campos && !campos.titulo) {
    return NextResponse.json(
      { error: "Ponele un nombre a la operación para identificarla." },
      { status: 400 },
    );
  }
  // La vía sólo se acepta si es un valor conocido.
  if ("via" in campos && campos.via && !VIAS_VALIDAS.has(campos.via)) {
    campos.via = null;
  }

  if ("ncm" in campos && campos.ncm && op.etapa !== ETAPA_INICIAL) {
    const { ncmEsPosicionEspecifica } = await import("@/lib/clasificador/motor");
    const ncmOk = await ncmEsPosicionEspecifica(campos.ncm);
    if (!ncmOk.ok) {
      return NextResponse.json(
        { error: ncmOk.motivo ?? "La NCM debe ser una posición específica (8 dígitos)." },
        { status: 400 },
      );
    }
  }

  await updateOperationCampos(op.user_id, id, campos);
  const claves = Object.keys(campos) as OpCampo[];

  if (camposDisparanPendientes(campos)) {
    const fresh = await getOperationById(id);
    if (fresh) {
      await refrescarPendientesOperacion(fresh).catch(() => {});
    }
  }

  const origenIa = body._origen === "ia_apertura";
  // En el Paso 1 (apertura) los datos de la IA son PROVISORIOS: el operador los
  // ajusta varias veces hasta cerrar la cotización. No dejamos rastro en el
  // timeline hasta avanzar a la fase 2 (ese cambio de etapa deja su propio evento),
  // así no se le adelanta nada al cliente ni se llena de notas intermedias.
  const silenciar = origenIa && op.etapa === ETAPA_INICIAL;
  if (claves.length > 0 && !silenciar) {
    // Las ediciones manuales mantienen el evento público simple.
    const labels = CAMPOS_LABEL as Record<string, string>;
    await addEvento({
      operationId: id,
      userId: op.user_id,
      tipo: origenIa ? "ia" : "edicion",
      titulo: origenIa
        ? "Paso 1 · Datos cargados desde la documentación (IA)"
        : "Se actualizaron los datos de la operación",
      detalle: origenIa
        ? claves
            .map((c) => `${labels[c] ?? c}: ${campos[c] ?? "—"}`)
            .join("\n")
        : null,
      interno: origenIa,
      autor: nombreAutor(user),
    });
  }
  return NextResponse.json({ ok: true });
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
  const op = await getOperationById(id);
  if (!op) {
    return NextResponse.json(
      { error: "Operación no encontrada." },
      { status: 404 },
    );
  }

  // El dueño de la operación o el equipo del estudio pueden eliminarla.
  if (!esEquipo(user.role) && op.user_id !== user.id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const docs = await removeOperation(op.user_id, id);

  // Borramos también los archivos físicos de cada documento.
  await Promise.all(
    docs.map((d) => {
      const fullPath = rutaArchivo(d.user_id, d.stored_name);
      if (!dentroDeClientes(fullPath)) return Promise.resolve();
      return unlink(fullPath).catch(() => {});
    }),
  );

  return NextResponse.json({ ok: true });
}
