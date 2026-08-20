import { NextResponse, type NextRequest } from "next/server";
import { dentroDelLimite, ipDe } from "@/lib/limite-publico";
import {
  arancelPorNcm,
  candidatosDePartida,
  descripcionPartida,
  partidasCandidatas,
  subpartidasDePartida,
  textoLegalResumido,
} from "@/lib/clasificador/motor";
import { textoParaSimsParquet } from "@/lib/clasificador/estado-clasificacion";
import { etiquetaUnidad, notasDeNcm, sufijosDeNcm } from "@/lib/clasificador/referencias";

const MAX_PARTIDAS = 20;
const MAX_POSICIONES = 60;

/** Contenido de una partida: su encabezado, sus subpartidas y sus posiciones. */
async function respuestaPartida(partida: string) {
  const [descripcion, subpartidas, lineas, notas] = await Promise.all([
    descripcionPartida(partida),
    subpartidasDePartida(partida),
    candidatosDePartida(partida),
    notasDeNcm(partida),
  ]);
  if (!lineas.length && !descripcion) {
    return NextResponse.json(
      { ok: false, error: `La partida ${partida} no existe en el nomenclador.` },
      { status: 404 },
    );
  }
  return NextResponse.json({
    ok: true,
    partida,
    descripcion: descripcion || "",
    subpartidas,
    notas,
    posiciones: lineas.slice(0, MAX_POSICIONES).map((l) => ({
      codigo: l.codigo,
      descripcion: textoLegalResumido(l),
      di: l.di,
    })),
    truncado: lineas.length > MAX_POSICIONES,
    total: lineas.length,
  });
}

/**
 * Exploración manual del nomenclador, sin IA: buscar partidas por texto, abrir
 * una partida en sus subpartidas y listar sus posiciones. Es la alternativa
 * para quien ya sabe dónde buscar y no quiere pasar por el clasificador.
 *
 *   ?q=martillo          → partidas que coinciden con el texto
 *   ?partida=8205        → subpartidas y posiciones de esa partida
 *   ?ncm=8205.20.00.100J → arancel de una posición puntual
 */
/**
 * Explorar el nomenclador. **Abierto, sin cuenta** desde el 20/8/2026.
 *
 * El nomenclador es una tabla pública: las posiciones, sus textos legales, sus
 * notas y sus aranceles los publica el Estado y no hay nada de nadie acá
 * adentro. Pedir cuenta para leerlo no protegía ningún dato, solo tapaba lo
 * único que le sirve al que todavía no nos conoce.
 *
 * Lo que **no** está abierto es clasificar con IA, que es otra ruta y cuesta
 * plata por consulta. Buscar sale de datos locales.
 *
 * El tope por minuto no es por privacidad sino por trabajo: cada consulta abre
 * parquet y cruza tablas, y sin freno un bucle deja al servidor ocupado.
 */
export async function GET(req: NextRequest) {
  if (!dentroDelLimite(ipDe(req), "nomenclador", 40)) {
    return NextResponse.json(
      { ok: false, error: "Demasiadas consultas seguidas. Probá en un minuto." },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const partida = (searchParams.get("partida") ?? "").replace(/\D/g, "").slice(0, 4);
  const ncm = (searchParams.get("ncm") ?? "").trim();

  try {
    if (ncm) {
      const [arancel, sufijos, notas] = await Promise.all([
        arancelPorNcm(ncm),
        sufijosDeNcm(ncm),
        notasDeNcm(ncm),
      ]);
      return NextResponse.json({
        ok: true,
        ncm,
        arancel,
        unidad: etiquetaUnidad(arancel?.unidad),
        sufijos,
        notas,
      });
    }

    if (partida) return respuestaPartida(partida);

    if (q.length < 2) {
      return NextResponse.json(
        { error: "Escribí al menos 2 caracteres, o un número de partida." },
        { status: 400 },
      );
    }

    // Un número de 4 dígitos se trata como partida directa, no como texto.
    const comoNumero = q.replace(/\D/g, "");
    if (comoNumero.length === 4 && !/[a-zA-Z]/.test(q)) {
      return respuestaPartida(comoNumero);
    }

    const candidatas = await partidasCandidatas(textoParaSimsParquet(q, []), {
      limite: MAX_PARTIDAS,
    });
    return NextResponse.json({
      ok: true,
      consulta: q,
      partidas: candidatas.map((c) => ({
        partida: c.partida,
        descripcion: c.descripcion,
      })),
    });
  } catch (e) {
    console.error("nomenclador/explorar:", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo consultar el nomenclador." },
      { status: 500 },
    );
  }
}
