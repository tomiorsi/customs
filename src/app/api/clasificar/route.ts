import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { clasificarProducto } from "@/lib/clasificador";
import { mensajeErrorIa } from "@/lib/clasificador/ia";
import type { ContextoClasificacion, Respuesta } from "@/lib/clasificador/tipos";
import {
  candidatosDePartida,
  descripcionPartida,
  paquetePartidasParaIa,
  partidasCandidatas,
} from "@/lib/clasificador/motor";
import {
  nombreBaseProducto,
  textoParaFiltroParquet,
  textoParaSimsParquet,
} from "@/lib/clasificador/estado-clasificacion";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    producto?: string;
    respuestas?: Respuesta[];
    ncmMaquina?: string;
    equipoReferencia?: string;
    debug?: boolean;
    /** Partida 4 dígitos opcional en modo debug (si no, top candidata del texto). */
    partida?: string;
    maxSim?: number;
  } | null;

  const producto = String(body?.producto ?? "").trim();

  if (body?.debug) {
    if (producto.length < 2) {
      return NextResponse.json(
        { error: "Describí el producto con al menos 2 caracteres." },
        { status: 400 },
      );
    }
    const partidaExplicita = String(body.partida ?? "")
      .replace(/\D/g, "")
      .slice(0, 4);
    let p4 = partidaExplicita;
    if (!p4) {
      const candidatas = await partidasCandidatas(producto, { limite: 1 });
      p4 = candidatas[0]?.partida ?? "";
    }
    if (!p4) {
      return NextResponse.json(
        { ok: false, error: "Sin partida candidata para el texto provisto." },
        { status: 404 },
      );
    }
    const partidaDesc = (await descripcionPartida(p4)) || "";
    const maxSim = body.maxSim && body.maxSim > 0 ? body.maxSim : 10;
    const bloques = await paquetePartidasParaIa({
      textoNombreBase: nombreBaseProducto(producto),
      textoFiltro: textoParaFiltroParquet(producto, []),
      textoSims: textoParaSimsParquet(producto, []),
    });
    const bloque = bloques.find((b) => b.partida === p4);
    const sims = bloque?.sims ?? (await candidatosDePartida(p4));
    const filtered = sims.slice(0, maxSim);
    return NextResponse.json({ ok: true, partida: p4, partidaDesc, filtered });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  if (producto.length < 2) {
    return NextResponse.json(
      { error: "Describí el producto con al menos 2 caracteres." },
      { status: 400 },
    );
  }

  const respuestas = Array.isArray(body?.respuestas)
    ? body.respuestas
        .filter((r) => r && typeof r.pregunta === "string" && typeof r.opcion === "string")
        .map((r) => ({
          pregunta: r.pregunta,
          opcion: r.opcion,
          consecuencia:
            typeof r.consecuencia === "string" && r.consecuencia.trim()
              ? r.consecuencia.trim()
              : undefined,
        }))
    : undefined;

  try {
    const contexto: ContextoClasificacion | undefined =
      body?.ncmMaquina || body?.equipoReferencia
        ? {
            ncmMaquina: body.ncmMaquina?.trim() || undefined,
            equipoReferencia: body.equipoReferencia?.trim() || undefined,
          }
        : undefined;
    const resultado = await clasificarProducto(producto, respuestas, contexto);
    return NextResponse.json({ ok: true, resultado });
  } catch (e) {
    console.error("clasificar:", e);
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
