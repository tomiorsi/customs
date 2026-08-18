import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import {
  RESPUESTA_AUTOMATICA,
  addMensajeSoporte,
  getMensajesSoporte,
  marcarLeidoSoporte,
  purgarHiloInactivo,
} from "@/lib/soporte";
import { responderSoporte } from "@/lib/soporte-bot";
import { avisarDerivacion } from "@/lib/soporte-aviso";

/**
 * Hilo de soporte de la cuenta que consulta.
 *
 * El id sale siempre de la sesión, nunca del pedido: cada cuenta ve su propio
 * hilo y nada más. Responder hilos ajenos es tarea del panel de soporte, que
 * es otra ruta con su propio control.
 *
 * Responde un bot con el contexto real de la cuenta. Si no puede resolver,
 * llama a su herramienta de derivación: el mensaje queda marcado `derivado` con
 * el resumen que se le manda por mail al equipo.
 *
 * Si la IA no está disponible o falla, cae al acuse fijo — la consulta igual
 * queda guardada y visible en la bandeja, que es lo que no puede perderse.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  purgarHiloInactivo(user.id);
  const mensajes = getMensajesSoporte(user.id);
  marcarLeidoSoporte(user.id, "usuario");
  return NextResponse.json({ mensajes });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  // Antes de guardar: si la consulta anterior ya venció, este mensaje arranca
  // un hilo nuevo en vez de quedar pegado abajo de un problema ya cerrado.
  purgarHiloInactivo(user.id);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const res = addMensajeSoporte({
    cuentaId: user.id,
    origen: "usuario",
    autor: user.company_name || user.contact_name || user.email,
    texto: String(body.texto ?? ""),
  });
  if (res.error) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }

  const historial = getMensajesSoporte(user.id);
  const respuesta = await responderSoporte(user.id, historial);

  if (respuesta) {
    addMensajeSoporte({
      cuentaId: user.id,
      origen: "bot",
      autor: "Soporte",
      texto: respuesta.texto,
      derivado: respuesta.tipo === "deriva",
    });
    if (respuesta.tipo === "deriva") {
      await avisarDerivacion({
        cuenta: user.company_name || user.contact_name || user.email || user.id,
        email: user.email,
        resumen: respuesta.resumen,
        motivo: respuesta.motivo,
      });
    }
  } else {
    // Sin IA disponible: el acuse fijo, para que el usuario no escriba al vacío.
    const yaHayRespuesta = historial.some((m) => m.origen !== "usuario");
    if (!yaHayRespuesta) {
      addMensajeSoporte({
        cuentaId: user.id,
        origen: "bot",
        autor: "Soporte",
        texto: RESPUESTA_AUTOMATICA,
      });
    }
  }

  return NextResponse.json({ mensajes: getMensajesSoporte(user.id) });
}
