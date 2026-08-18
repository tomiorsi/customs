import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esDuenoDeEstudio, estudioDe } from "@/lib/roles";
import {
  activarPlan,
  datosFacturacionDeEstudio,
  guardarDatosFacturacion,
} from "@/lib/data";
import {
  CONDICIONES_IVA,
  cuitValido,
  faltantesFacturacion,
  planPorClave,
  type CondicionIva,
} from "@/lib/suscripcion";

/**
 * Contratación de un plan.
 *
 * Solo el dueño del estudio contrata: un empleado usa el panel pero no compromete
 * al estudio. Antes de activar se exigen los datos con los que se le va a emitir
 * la factura: sin condición frente al IVA, ARCA rechaza el comprobante
 * (art. 2, RG 5616/2024), así que no tiene sentido cobrar y no poder facturar.
 *
 * Todavía no hay pasarela de pago conectada: esto activa el plan por 30 días
 * sin cobrar nada.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !esDuenoDeEstudio(user)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const plan = planPorClave(typeof body.plan === "string" ? body.plan : null);
  if (!plan) {
    return NextResponse.json({ error: "Plan inválido." }, { status: 400 });
  }

  const estudio = estudioDe(user);

  // Datos de facturación: los del pedido si vienen, si no los ya guardados.
  const cuitCrudo = typeof body.cuit === "string" ? body.cuit : "";
  const condicionIva = typeof body.condicionIva === "string" ? body.condicionIva : "";
  const domicilio = typeof body.domicilio === "string" ? body.domicilio : "";

  if (cuitCrudo || condicionIva || domicilio) {
    const cuit = cuitCrudo.replace(/\D/g, "");
    const faltan = faltantesFacturacion({ cuit, condicionIva, domicilio });
    if (faltan.length) {
      return NextResponse.json(
        { error: `Faltan datos para facturar: ${faltan.join(", ")}.` },
        { status: 400 },
      );
    }
    if (!CONDICIONES_IVA.includes(condicionIva as CondicionIva) || !cuitValido(cuit)) {
      return NextResponse.json({ error: "Datos de facturación inválidos." }, { status: 400 });
    }
    guardarDatosFacturacion(estudio, {
      cuit,
      condicionIva,
      domicilio: domicilio.trim(),
    });
  }

  const guardados = datosFacturacionDeEstudio(estudio);
  const faltan = faltantesFacturacion({
    cuit: guardados?.cuit ?? "",
    condicionIva: guardados?.iva_condition ?? "",
    domicilio: guardados?.address ?? "",
  });
  if (faltan.length) {
    return NextResponse.json(
      { error: `Faltan datos para facturar: ${faltan.join(", ")}.`, faltan },
      { status: 422 },
    );
  }

  activarPlan(estudio, plan.clave);
  return NextResponse.json({ ok: true, plan: plan.clave });
}
