import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import {
  generarEstimacionPDF,
  type EstimacionPdfInput,
} from "@/lib/estimacion-pdf";

/**
 * PDF de la estimación de la calculadora.
 *
 * Recibe los números que la calculadora ya mostró en pantalla y los dibuja: el
 * PDF tiene que decir exactamente lo mismo que el usuario acaba de ver. No se
 * recalcula del lado del servidor porque el resultado depende de una decena de
 * ajustes finos que el operador puede haber tocado a mano (flete, seguro,
 * gastos, exenciones); recalcular con menos contexto daría OTRO número, que es
 * justo el problema que un PDF de respaldo no puede tener.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as EstimacionPdfInput | null;
  if (!body || typeof body !== "object" || !body.cifra) {
    return NextResponse.json({ error: "Datos incompletos." }, { status: 400 });
  }

  try {
    const pdf = await generarEstimacionPDF(body, user);
    const fecha = new Date().toISOString().slice(0, 10);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Estimacion-${fecha}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo generar el PDF." },
      { status: 500 },
    );
  }
}
