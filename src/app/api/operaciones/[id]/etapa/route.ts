import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { addEvento, getOperationById, updateOperationEtapa } from "@/lib/data";
import { limpiarProvisionalLogistica, limpiarProvisionalPaso1 } from "@/lib/valores-comercial";
import { estadoDescripcion, estadoLabel } from "@/lib/estados";
import {
  esEtapaValida,
  esExportacion,
  estadoClienteDeEtapa,
  etapaDef,
  etapaIndex,
} from "@/lib/workflow";
import { ncmEsPosicionEspecifica } from "@/lib/clasificador/motor";
import { ncmPareceGeneral } from "@/lib/formato";

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

  const body = (await req.json().catch(() => null)) as {
    etapa?: string;
    nota?: string;
  } | null;
  const etapa = String(body?.etapa ?? "").trim();
  const nota = String(body?.nota ?? "").trim();
  if (!esEtapaValida(etapa)) {
    return NextResponse.json({ error: "Etapa inválida." }, { status: 400 });
  }
  if (etapa === op.etapa) {
    return NextResponse.json({ ok: true, etapa });
  }

  const idxDestino = etapaIndex(etapa);
  if (
    idxDestino > etapaIndex("documentacion") &&
    (ncmPareceGeneral(op.ncm) || !(await ncmEsPosicionEspecifica(op.ncm)).ok)
  ) {
    return NextResponse.json(
      {
        error:
          "Definí una NCM específica (8 dígitos) con el nomenclador antes de avanzar más allá del Paso 2.",
      },
      { status: 400 },
    );
  }

  const autor = user.contact_name ?? user.username ?? user.email ?? "Equipo";
  const estadoAnterior = op.estado;
  const estadoNuevo = estadoClienteDeEtapa(etapa);

  // Al pasar del Paso 1 (cotización) al Paso 2, muere TODO lo provisional:
  // incoterm, valores, logística, transporte, hallazgos IA, etc. Solo queda la NCM.
  if (etapa === "documentacion" && etapaIndex(op.etapa) === 0) {
    await limpiarProvisionalPaso1(op.user_id, id);
  }

  // Al pasar al Paso 3 (embarque), los gastos de logística arrancan en cero
  // (overrides y agregados). Los valores comerciales del Paso 2 se conservan.
  if (etapa === "embarque" && etapaIndex(op.etapa) < etapaIndex("embarque")) {
    if (etapaIndex(op.etapa) === 0) {
      await limpiarProvisionalPaso1(op.user_id, id);
    } else {
      await limpiarProvisionalLogistica(op.user_id, id);
    }
  }

  await updateOperationEtapa(op.user_id, id, etapa);

  if (estadoNuevo !== estadoAnterior) {
    // Cambió lo que ve el cliente: registramos un evento visible para él.
    // El pedido detallado de documentos (qué recibimos / qué falta) NO sale
    // automático: el operador lo arma como borrador y lo manda cuando confirma.
    const esExpo = esExportacion(op.tipo);
    await addEvento({
      operationId: id,
      userId: op.user_id,
      tipo: "estado",
      titulo: `Pasó a "${estadoLabel(estadoNuevo)}"`,
      detalle: nota ? nota.slice(0, 2000) : estadoDescripcion(estadoNuevo, esExpo),
      autor,
    });
  } else {
    // Avance interno que el cliente no necesita ver: nota interna del equipo.
    const def = etapaDef(etapa, op.tipo);
    await addEvento({
      operationId: id,
      userId: op.user_id,
      tipo: "nota",
      titulo: `Avanzó a la etapa: ${def.label}`,
      detalle: nota ? nota.slice(0, 2000) : null,
      autor,
      interno: true,
    });
  }

  return NextResponse.json({ ok: true, etapa, estado: estadoNuevo });
}
