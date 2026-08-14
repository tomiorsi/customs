import "server-only";

/**
 * Envío de emails transaccionales con Resend (https://resend.com).
 *
 * Configuración (en .env.local, NO se commitea):
 *   RESEND_API_KEY=re_xxxxxxxx        // clave de API de Resend
 *   RESEND_FROM="J&C Comex <no-responder@tudominio.com>"  // remitente verificado
 *   RESEND_REPLY_TO=estudio@tudominio.com   // opcional: a dónde responde el cliente
 *
 * El dominio del remitente debe estar verificado en Resend para que los mails
 * lleguen (si no, caen en spam o son rechazados).
 */

function remitente(): string | null {
  return process.env.RESEND_FROM?.trim() || null;
}

/** ¿Está configurado el envío de emails? */
export function emailDisponible(): boolean {
  return Boolean(process.env.RESEND_API_KEY && remitente());
}

/** Validación simple de formato de email. */
export function esEmailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export type EmailAttachment = {
  filename: string;
  /** Contenido del archivo en base64. */
  content: string;
};

export type EmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

/**
 * Envía un email. Lanza error si el envío no está configurado o si Resend
 * responde con error (el llamador decide cómo manejarlo).
 */
export async function enviarEmail(input: EmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = remitente();
  if (!apiKey || !from) {
    throw new Error(
      "Email no configurado: faltan RESEND_API_KEY y/o RESEND_FROM.",
    );
  }

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      reply_to: input.replyTo ?? process.env.RESEND_REPLY_TO ?? undefined,
    }),
  });

  if (!resp.ok) {
    const detalle = await resp.text().catch(() => "");
    throw new Error(`Resend ${resp.status}: ${detalle.slice(0, 300)}`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Marca del estudio para los emails (configurable). */
const ESTUDIO = process.env.NEXT_PUBLIC_ESTUDIO_NOMBRE || "J&C Comex";

/**
 * Avisa al CLIENTE que el estudio le dejó un mensaje en el seguimiento de su
 * operación, con el texto y el link a su portal. Va en español (el cliente es
 * local). Lanza si el envío no está configurado o falla.
 */
export async function enviarMensajeCliente(args: {
  to: string;
  empresa?: string | null;
  ref: string;
  mensaje: string;
  autor?: string | null;
  link: string;
}): Promise<void> {
  const { to, empresa, ref, mensaje, autor, link } = args;
  const estudioSafe = escapeHtml(ESTUDIO);
  const saludo = empresa ? `Hola ${escapeHtml(empresa)},` : "Hola,";
  const deQuien = autor ? `${escapeHtml(autor)} (${estudioSafe})` : estudioSafe;
  const extracto = mensaje.length > 800 ? `${mensaje.slice(0, 800)}…` : mensaje;

  const subject = `${ESTUDIO} · Novedad de tu operación (${ref})`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#111827">
    <div style="background:linear-gradient(135deg,#f97316,#fb923c);padding:20px 24px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;color:#fff;font-size:18px;font-weight:700">${estudioSafe}</h1>
      <p style="margin:4px 0 0;color:#fff;opacity:.9;font-size:13px">Despachante de aduana</p>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px">
      <p style="font-size:15px;margin:0 0 12px">${saludo}</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 12px">
        ${deQuien} te dejó un mensaje sobre tu operación
        <strong>${escapeHtml(ref)}</strong>:
      </p>
      <blockquote style="margin:0 0 16px;padding:12px 14px;background:#f9fafb;border-left:3px solid #f97316;border-radius:6px;font-size:14px;line-height:1.6;color:#374151;white-space:pre-wrap">${escapeHtml(extracto)}</blockquote>
      <p style="margin:0 0 24px">
        <a href="${link}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px">
          Ver el seguimiento
        </a>
      </p>
      <p style="font-size:13px;line-height:1.6;margin:0 0 16px;color:#6b7280">
        Podés ver el detalle y el avance completo en tu portal.
      </p>
      <p style="font-size:12px;color:#2563eb;word-break:break-all;margin:0 0 16px">${escapeHtml(link)}</p>
      <p style="font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px;margin:0">
        Enviado por ${estudioSafe}.
      </p>
    </div>
  </div>`;

  const text =
    `${empresa ? `Hola ${empresa},` : "Hola,"}\n\n` +
    `${autor ? `${autor} (${ESTUDIO})` : ESTUDIO} te dejó un mensaje sobre tu operación ${ref}:\n\n` +
    `${extracto}\n\n` +
    `Ver el seguimiento completo en tu portal:\n${link}\n\n` +
    `Enviado por ${ESTUDIO}.`;

  await enviarEmail({ to, subject, html, text });
}

/**
 * Envía al CLIENTE (importador) la cotización preliminar en PDF adjunto. Va en
 * español: el cliente es local. Lanza si el envío no está configurado o falla.
 */
export async function enviarCotizacionCliente(args: {
  to: string;
  empresa?: string | null;
  ref: string;
  mercaderia?: string | null;
  costoEstimado: string;
  adelanto: string;
  pdf: EmailAttachment;
}): Promise<void> {
  const { to, empresa, ref, mercaderia, costoEstimado, adelanto, pdf } = args;
  const estudioSafe = escapeHtml(ESTUDIO);
  const saludo = empresa ? `Hola ${escapeHtml(empresa)},` : "Hola,";
  const merc = mercaderia ? escapeHtml(mercaderia) : null;

  const subject = `${ESTUDIO} · Cotización preliminar de tu importación (${ref})`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#111827">
    <div style="background:linear-gradient(135deg,#f97316,#fb923c);padding:20px 24px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;color:#fff;font-size:18px;font-weight:700">${estudioSafe}</h1>
      <p style="margin:4px 0 0;color:#fff;opacity:.9;font-size:13px">Despachante de aduana</p>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px">
      <p style="font-size:15px;margin:0 0 12px">${saludo}</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 14px">
        Te enviamos la <strong>cotización preliminar</strong> de tu operación de
        importación${merc ? ` de <strong>${merc}</strong>` : ""} (referencia
        <strong>${escapeHtml(ref)}</strong>). El detalle completo de costos está
        en el <strong>PDF adjunto</strong>.
      </p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:14px">
        <tr>
          <td style="padding:10px 12px;background:#f9fafb;border-radius:8px 8px 0 0;color:#374151">Costo estimado de la operación</td>
          <td style="padding:10px 12px;background:#f9fafb;border-radius:8px 8px 0 0;text-align:right;font-weight:700;color:#f97316">${escapeHtml(costoEstimado)}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;border-top:1px solid #e5e7eb;color:#374151">Adelanto de logística estimado</td>
          <td style="padding:10px 12px;border-top:1px solid #e5e7eb;text-align:right;font-weight:600">${escapeHtml(adelanto)}</td>
        </tr>
      </table>
      <p style="font-size:13px;line-height:1.6;margin:0 0 14px;color:#374151">
        Es una estimación orientativa: puede ajustarse según la clasificación
        final (NCM), el contenedor real y el flete definitivo. Los tributos los
        abonás por VEP; el adelanto cubre los pagos que hacemos por tu cuenta y
        orden. Los honorarios se acuerdan por separado.
      </p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 16px">
        Si estás de acuerdo, respondé este mail para avanzar con la operación.
      </p>
      <p style="font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px;margin:0">
        Enviado por ${estudioSafe}.
      </p>
    </div>
  </div>`;

  const text =
    `${empresa ? `Hola ${empresa},` : "Hola,"}\n\n` +
    `Te enviamos la cotización preliminar de tu importación${merc ? ` de ${mercaderia}` : ""} (ref. ${ref}). ` +
    `El detalle completo está en el PDF adjunto.\n\n` +
    `Costo estimado de la operación: ${costoEstimado}\n` +
    `Adelanto de logística estimado: ${adelanto}\n\n` +
    `Es una estimación orientativa (puede ajustarse según NCM, contenedor real y flete definitivo). ` +
    `Los tributos los abonás por VEP; los honorarios se acuerdan aparte.\n\n` +
    `Si estás de acuerdo, respondé este mail para avanzar.\n${ESTUDIO}`;

  await enviarEmail({ to, subject, html, text, attachments: [pdf] });
}
