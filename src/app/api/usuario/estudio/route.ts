import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esDuenoDeEstudio, estudioDe } from "@/lib/roles";
import { getDb } from "@/lib/db";
import { CONDICIONES_IVA, cuitValido, type CondicionIva } from "@/lib/suscripcion";

/**
 * Datos del estudio para la factura de la suscripción.
 *
 * Solo el dueño los edita: son los datos fiscales con los que se factura al
 * estudio, no del empleado que esté usando el panel. Se aceptan incompletos
 * —se pueden ir cargando de a poco—, pero lo que venga cargado tiene que ser
 * válido, para no guardar un CUIT que después haga rechazar el comprobante.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !esDuenoDeEstudio(user)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const nombre = String(body.nombre ?? "").trim();
  const cuit = String(body.cuit ?? "").replace(/\D/g, "");
  const condicionIva = String(body.condicionIva ?? "").trim();
  const domicilio = String(body.domicilio ?? "").trim();

  if (!nombre) {
    return NextResponse.json(
      { error: "El nombre o estudio no puede quedar vacío." },
      { status: 400 },
    );
  }
  if (cuit && !cuitValido(cuit)) {
    return NextResponse.json(
      { error: "El CUIT tiene que tener 11 dígitos." },
      { status: 400 },
    );
  }
  if (condicionIva && !CONDICIONES_IVA.includes(condicionIva as CondicionIva)) {
    return NextResponse.json(
      { error: "Condición frente al IVA inválida." },
      { status: 400 },
    );
  }

  getDb()
    .prepare(
      `UPDATE users SET company_name = ?, cuit = ?, iva_condition = ?, address = ?
       WHERE id = ? AND despachante_id IS NULL`,
    )
    .run(nombre, cuit || null, condicionIva || null, domicilio || null, estudioDe(user));

  return NextResponse.json({ ok: true });
}
