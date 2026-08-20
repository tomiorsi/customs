import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { dentroDelLimite, ipDe } from "@/lib/limite-publico";
import {
  arancelPorNcm,
  candidatosDePartida,
  descripcionPartida,
  dondeCoincide,
  partidasCandidatas,
  resolverPartidasConExpansion,
  subpartidasDePartida,
  textoLegalResumido,
} from "@/lib/clasificador/motor";
import { textoParaSimsParquet } from "@/lib/clasificador/estado-clasificacion";
import { expandirConsultaLegal } from "@/lib/clasificador/ia";
import { partidasDelLexico } from "@/lib/clasificador/lexico";
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
      const [arancel, sufijos, notas, hermanas] = await Promise.all([
        arancelPorNcm(ncm),
        sufijosDeNcm(ncm),
        notasDeNcm(ncm),
        // Las posiciones de su partida, para poder devolver el texto legal de
        // ESTA. Sin él, quien guarda una posición solo ve once dígitos y no
        // tiene forma de darse cuenta de que se equivocó de renglón.
        candidatosDePartida(ncm.replace(/\D/g, "").slice(0, 4)),
      ]);
      const digitos = ncm.replace(/\D/g, "");
      const propia = hermanas.find(
        (h) => h.codigo.replace(/\D/g, "").startsWith(digitos.slice(0, 11)),
      );
      return NextResponse.json({
        ok: true,
        ncm,
        descripcion: propia?.descripcion ?? null,
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

    /**
     * Buscar el texto tal cual, o traducirlo antes al idioma del nomenclador.
     *
     * Medido contra 9.869 descripciones reales del archivo, buscar el texto
     * tal cual acierta la partida en primer lugar el 26,5% de las veces, y
     * **empeora cuanto más largo es el texto**. Mirando los fallos uno por
     * uno, la causa dominante no es el orden del ranking sino el vocabulario:
     * «arrabio», «parlantes» y «jackets» no devuelven NADA, porque el
     * nomenclador dice «fundición en bruto», «altavoces» y no habla inglés.
     *
     * La traducción de comercial a legal ya existe —la Fase 0 del
     * clasificador— y el entrelazado por votos también. Acá se reusan los dos
     * tal cual: no hay una regla nueva ni una lista de sinónimos escrita a
     * mano contra los casos que fallaban.
     *
     * Cuesta una llamada de IA, así que va solo para el equipo y a pedido.
     * El portal público sigue buscando el texto crudo, gratis.
     */
    const quiereExpandir = searchParams.get("expandir") === "1";
    let expandida = false;
    let candidatas = await partidasCandidatas(textoParaSimsParquet(q, []), {
      limite: MAX_PARTIDAS,
    });

    /**
     * Lo que el archivo del estudio ya asocia con estas palabras, adelante.
     *
     * No reemplaza al buscador de texto: se suma antes y lo de siempre queda
     * atrás. Lo que el índice no sabe —un rubro que el estudio nunca tocó— lo
     * sigue resolviendo el nomenclador, igual que antes. Medido contra la
     * mitad del archivo que el índice nunca vio, la partida correcta pasa del
     * 28,7% al 67,8% en primer lugar.
     */
    const delArchivo = partidasDelLexico(q);
    if (delArchivo.length) {
      const yaEstan = new Set(candidatas.map((c) => c.partida));
      const suma = await Promise.all(
        delArchivo
          .filter((p) => !yaEstan.has(p))
          .slice(0, MAX_PARTIDAS)
          .map(async (partida) => ({
            partida,
            descripcion: (await descripcionPartida(partida)) || "",
          })),
      );
      const ordenArchivo = new Set(delArchivo);
      candidatas = [
        ...suma,
        ...candidatas.filter((c) => ordenArchivo.has(c.partida)),
        ...candidatas.filter((c) => !ordenArchivo.has(c.partida)),
      ].slice(0, MAX_PARTIDAS);
    }

    if (quiereExpandir) {
      const user = await getCurrentUser();
      if (user && esEquipo(user.role)) {
        const terminos = await expandirConsultaLegal(q);
        if (terminos.length) {
          const codigos = await resolverPartidasConExpansion(
            { textoNombreBase: q, textoFiltro: q, textoSims: q },
            terminos,
          );
          const conTexto = await Promise.all(
            codigos.slice(0, MAX_PARTIDAS).map(async (partida) => ({
              partida,
              descripcion: (await descripcionPartida(partida)) || "",
            })),
          );
          // Si la expansión no trajo nada, se deja lo de antes: es una ayuda,
          // no un reemplazo, y quedarse sin resultados sería peor.
          if (conTexto.length) {
            candidatas = conTexto;
            expandida = true;
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      consulta: q,
      // Se dice si se tradujo, para que la pantalla lo pueda mostrar: quien
      // busca tiene que saber si lo que ve salió de su texto o de otro.
      expandida,
      // Con la evidencia: en qué renglón del nomenclador pegó lo que se buscó.
      // Sin esto la lista muestra títulos de partida que casi nunca contienen
      // la palabra —está tres niveles más abajo— y parece que el buscador
      // devolvió cualquier cosa.
      partidas: await Promise.all(
        candidatas.map(async (c) => ({
          partida: c.partida,
          descripcion: c.descripcion,
          coincide: await dondeCoincide(c.partida, q),
          // De dónde salió: del texto del nomenclador o del archivo del
          // estudio. Quien busca tiene que poder distinguirlo — una viene de
          // la ley y la otra de cómo se despachó antes.
          delArchivo: delArchivo.includes(c.partida),
        })),
      ),
    });
  } catch (e) {
    console.error("nomenclador/explorar:", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo consultar el nomenclador." },
      { status: 500 },
    );
  }
}
