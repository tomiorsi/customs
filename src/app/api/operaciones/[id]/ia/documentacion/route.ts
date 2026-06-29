import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { getOperationById } from "@/lib/data";
import {
  etapaDocumentalDe,
  validarEtapaDocumental,
} from "@/lib/validacion-doc";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !esEquipo(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  // Etapa a validar: "documentacion" (clasificación) o "embarque" (transporte).
  // Solo se invoca manualmente desde «Validar documentación» en la mesa.
  const body = (await req.json().catch(() => null)) as { etapa?: string } | null;

  const { id } = await ctx.params;
  const op = await getOperationById(id);
  if (!op) {
    return NextResponse.json(
      { error: "Operación no encontrada." },
      { status: 404 },
    );
  }

  const etapa =
    body?.etapa === "embarque" || body?.etapa === "documentacion"
      ? body.etapa
      : etapaDocumentalDe(op.etapa);

  try {
    const res = await validarEtapaDocumental(op, etapa);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: res.status });
    }
    // NO dejamos evento en el timeline interno por cada análisis de IA: el
    // resultado se ve en la mesa de trabajo. El timeline solo registra los
    // cambios de paso (avance de etapa).
    return NextResponse.json({
      ok: true,
      resultado: res.resultado,
      avanzo: res.avanzo ?? false,
      etapa: res.etapa,
      resultadoEmbarque: res.resultadoEmbarque,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo analizar con IA." },
      { status: 502 },
    );
  }
}
