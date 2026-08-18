import "server-only";

/**
 * Aviso al equipo cuando el bot deriva una consulta.
 *
 * El envío por Resend está detrás de dos variables de entorno. Sin ellas la
 * derivación no se pierde: queda registrada en el hilo y marcada `derivado`,
 * visible en la bandeja de soporte. El mail es una notificación, no el registro.
 */

export type Derivacion = {
  cuenta: string;
  email: string | null;
  resumen: string;
  motivo: string;
};

function cuerpo(d: Derivacion): string {
  return [
    `Cuenta: ${d.cuenta}`,
    `Email: ${d.email ?? "sin email"}`,
    "",
    `Motivo: ${d.motivo}`,
    "",
    "Resumen del problema:",
    d.resumen,
    "",
    "Respondé desde la bandeja de soporte del panel.",
  ].join("\n");
}

export async function avisarDerivacion(d: Derivacion): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const destino = process.env.SOPORTE_EMAIL_DESTINO;
  const remitente = process.env.SOPORTE_EMAIL_REMITENTE;

  if (!apiKey || !destino || !remitente) {
    // Sin Resend configurado: queda el registro en el hilo. Se avisa por consola
    // para que en desarrollo se vea que la derivación ocurrió.
    console.warn(
      `[soporte] Derivación sin enviar (falta RESEND_API_KEY / SOPORTE_EMAIL_DESTINO / SOPORTE_EMAIL_REMITENTE): ${d.cuenta} — ${d.motivo}`,
    );
    return;
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: remitente,
        to: [destino],
        // El mail del usuario va en reply_to: se responde desde el cliente de
        // correo sin tener que copiar la dirección a mano.
        ...(d.email ? { reply_to: d.email } : {}),
        subject: `Soporte · ${d.cuenta}`,
        text: cuerpo(d),
      }),
    });
    if (!resp.ok) {
      console.error(`[soporte] Resend ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    }
  } catch (e) {
    // Un fallo de correo no puede romper la respuesta del chat: el usuario ya
    // recibió el aviso de que lo derivamos.
    console.error("[soporte] No se pudo enviar el aviso de derivación", e);
  }
}
