import { NextResponse, type NextRequest } from "next/server";
import { enviarEmail, emailDisponible, esEmailValido } from "@/lib/email";

/**
 * Formulario público de calificación + pedido de reunión (landing).
 * Junta los datos del lead y se los manda por email al estudio, que después
 * coordina la videollamada. No requiere login: es la puerta de entrada.
 *
 * TODO (pendiente de criterios del estudio): rechazo automático por reglas
 * (ej. sin CUIT, no entrega respaldo, CIF por operación por debajo de un
 * mínimo). Hoy junta todo y lo deja decidir al estudio.
 */

const CAMPOS: { key: string; label: string; requerido?: boolean }[] = [
  { key: "nombre", label: "Nombre y apellido", requerido: true },
  { key: "email", label: "Email", requerido: true },
  { key: "telefono", label: "Teléfono", requerido: true },
  { key: "razonSocial", label: "Razón social / Nombre", requerido: true },
  { key: "cuit", label: "CUIT" },
  { key: "registroImportador", label: "Inscripto en Registro Importadores/Exportadores" },
  { key: "antiguedad", label: "Antigüedad de la empresa" },
  { key: "titularidad", label: "¿La operación es de tu empresa?" },
  { key: "rubro", label: "Qué importa/exporta", requerido: true },
  { key: "pais", label: "País de origen / destino", requerido: true },
  { key: "detalleProducto", label: "Detalle del producto" },
  { key: "proveedor", label: "Proveedor del exterior" },
  { key: "cifOperacion", label: "Valor CIF por operación (USD)" },
  { key: "volumenAnual", label: "Volumen anual estimado (USD)" },
  { key: "financiacion", label: "Financiación" },
  { key: "yaImporto", label: "¿Ya importó antes?" },
  { key: "comoConocio", label: "¿Cómo nos conoció?" },
  { key: "documentacion", label: "¿Entrega documentación de respaldo?" },
  { key: "motivoCambio", label: "Situación actual / motivo de cambio" },
  { key: "web", label: "Web / redes / referencias" },
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<
    string,
    string
  > | null;
  if (!body) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const datos: Record<string, string> = {};
  for (const { key } of CAMPOS) datos[key] = String(body[key] ?? "").trim();

  const faltan = CAMPOS.filter((c) => c.requerido && !datos[c.key]);
  if (faltan.length > 0) {
    return NextResponse.json(
      { error: `Completá: ${faltan.map((c) => c.label).join(", ")}.` },
      { status: 400 },
    );
  }
  if (!esEmailValido(datos.email!)) {
    return NextResponse.json(
      { error: "El email no parece válido." },
      { status: 400 },
    );
  }

  const filas = CAMPOS.filter((c) => datos[c.key])
    .map(
      (c) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${escapeHtml(
          c.label,
        )}</td><td style="padding:4px 0;color:#16181d">${escapeHtml(
          datos[c.key]!,
        )}</td></tr>`,
    )
    .join("");
  const html = `<h2 style="font:600 18px system-ui;color:#16181d">Nuevo pedido de reunión</h2>
    <table style="font:14px system-ui;border-collapse:collapse">${filas}</table>`;
  const text = CAMPOS.filter((c) => datos[c.key])
    .map((c) => `${c.label}: ${datos[c.key]}`)
    .join("\n");

  // Destino: casilla del estudio. Configurable por env; si no está, cae al
  // reply-to de Resend para no perder el lead.
  const destino =
    process.env.ESTUDIO_EMAIL?.trim() ||
    process.env.RESEND_REPLY_TO?.trim() ||
    null;

  if (emailDisponible() && destino) {
    try {
      await enviarEmail({
        to: destino,
        subject: `Reunión — ${datos.razonSocial} (${datos.nombre})`,
        html,
        text,
        replyTo: datos.email,
      });
    } catch (err) {
      // No perdemos el lead: lo dejamos en el log del servidor y seguimos.
      console.error("[reunion] no se pudo enviar el email:", err);
      console.error("[reunion] lead:", text);
    }
  } else {
    console.warn(
      "[reunion] email no configurado (ESTUDIO_EMAIL/RESEND). Lead recibido:",
    );
    console.warn(text);
  }

  return NextResponse.json({ ok: true });
}
