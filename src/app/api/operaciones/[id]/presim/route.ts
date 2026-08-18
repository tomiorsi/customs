import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo, alcanceDe } from "@/lib/roles";
import { getOperationById } from "@/lib/data";
import { armarDeclaracion } from "@/lib/presim/armar";
import { escribirDeclaracion } from "@/lib/presim/archivo";
import { operacionSimDesde } from "@/lib/presim/desde-operacion";
import { resumirHallazgos, validarDeclaracion } from "@/lib/presim/validar";

/**
 * El archivo del pre-SIM de una operación.
 *
 * Devuelve las tres cosas juntas, porque las tres se miran a la vez antes de
 * emitir: qué falta cargar, qué va a objetar el SIM, y el texto del archivo.
 *
 * Solo para el equipo: el archivo lleva el CUIT del importador y los valores de
 * la operación, y el cliente no tiene por qué verlo.
 */

const ESTUDIO_CUIT = process.env.ESTUDIO_CUIT?.trim() || null;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !esEquipo(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const op = await getOperationById(id, alcanceDe(user));
  if (!op) {
    return NextResponse.json({ error: "Operación no encontrada." }, { status: 404 });
  }

  if (!ESTUDIO_CUIT) {
    return NextResponse.json(
      {
        error:
          "Falta el CUIT del despachante. Se configura en la variable de entorno ESTUDIO_CUIT.",
      },
      { status: 400 },
    );
  }

  try {
    const { operacion, faltantes } = operacionSimDesde(op, {
      cuitDespachante: ESTUDIO_CUIT,
    });

    if (!operacion) {
      return NextResponse.json({ ok: true, faltantes, hallazgos: [], archivo: null });
    }

    const declaracion = armarDeclaracion(operacion);
    const hallazgos = validarDeclaracion(declaracion);

    return NextResponse.json({
      ok: true,
      faltantes,
      hallazgos,
      resumen: resumirHallazgos(hallazgos),
      subregimen: operacion.subregimen,
      // El nombre lo usa el despachante para encontrarlo en el Kit.
      nombre: `${op.ref || op.id}.txt`,
      archivo: escribirDeclaracion(declaracion),
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "No se pudo armar el archivo del pre-SIM.",
      },
      { status: 500 },
    );
  }
}
