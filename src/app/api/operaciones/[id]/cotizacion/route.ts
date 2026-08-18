import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo, alcanceDe } from "@/lib/roles";
import {
  addEvento,
  getOperationById,
  updateOperationEtapa,
} from "@/lib/data";
import { limpiarProvisionalPaso1 } from "@/lib/valores-comercial";
import { calcularLiquidacion } from "@/lib/liquidacion";
import { PREFIJO_ARCHIVO_RESUMEN_FONDOS } from "@/lib/cotizacion-labels";
import {
  formatUsd,
  generarCotizacionPDF,
  type VistaCotizacionPdf,
} from "@/lib/cotizacion-pdf";
import { requisitosOperacion } from "@/lib/requisitos";
import {
  emailDisponible,
  enviarCotizacionCliente,
  esEmailValido,
} from "@/lib/email";
import { estadoDescripcion, estadoLabel } from "@/lib/estados";
import {
  ETAPA_IDS,
  esExportacion,
  estadoClienteDeEtapa,
  etapaIndex,
} from "@/lib/workflow";
import type { Destino } from "@/lib/cotizador";

function destinoDe(raw: string | null): Destino {
  return raw === "uso_propio" ? "uso_propio" : "reventa";
}

function vistaPdfDe(raw: string | null): VistaCotizacionPdf {
  return raw === "liquidacion" ? "liquidacion" : "cotizacion";
}

/**
 * GET: descarga/previsualiza el PDF de la cotización preliminar (para que el
 * operador lo revise antes de enviarlo).
 */
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
    return NextResponse.json(
      { error: "Operación no encontrada." },
      { status: 404 },
    );
  }

  try {
    const vista = vistaPdfDe(req.nextUrl.searchParams.get("vista"));
    const [liq, { requisitos }] = await Promise.all([
      calcularLiquidacion(
        op,
        destinoDe(req.nextUrl.searchParams.get("destino")),
      ),
      requisitosOperacion(op),
    ]);
    const pdf = await generarCotizacionPDF(op, liq, requisitos, { vista, user });
    // dl=1 fuerza la descarga; si no, se muestra embebido en el navegador.
    const descargar = req.nextUrl.searchParams.get("dl") === "1";
    const disposition = descargar ? "attachment" : "inline";
    const nombreBase =
      vista === "liquidacion" ? PREFIJO_ARCHIVO_RESUMEN_FONDOS : "Cotizacion";
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${nombreBase}-${op.ref}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "No se pudo generar la cotización.",
      },
      { status: 500 },
    );
  }
}

/**
 * POST: genera el PDF de la cotización preliminar y lo envía al mail del cliente.
 */
export async function POST(
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
    return NextResponse.json(
      { error: "Operación no encontrada." },
      { status: 404 },
    );
  }

  if (!emailDisponible()) {
    return NextResponse.json(
      {
        error:
          "El envío de emails no está configurado (faltan RESEND_API_KEY y RESEND_FROM).",
      },
      { status: 503 },
    );
  }

  const destino = destinoDe(req.nextUrl.searchParams.get("destino"));

  // El destinatario por defecto es el mail del cliente; se puede sobreescribir.
  let to = op.client_email ?? "";
  try {
    const body = (await req.json().catch(() => ({}))) as { email?: string };
    if (body?.email) to = body.email;
  } catch {
    /* sin body: usamos el mail del cliente */
  }

  if (!to || !esEmailValido(to)) {
    return NextResponse.json(
      { error: "El cliente no tiene un email válido cargado." },
      { status: 400 },
    );
  }

  try {
    const [liq, { requisitos }] = await Promise.all([
      calcularLiquidacion(op, destino),
      requisitosOperacion(op),
    ]);
    const pdf = await generarCotizacionPDF(op, liq, requisitos, { user });
    const content = Buffer.from(pdf).toString("base64");

    await enviarCotizacionCliente({
      to,
      empresa: op.company_name,
      ref: op.ref,
      mercaderia: op.mercaderia,
      costoEstimado: formatUsd(liq.costoTotal),
      adelanto: formatUsd(liq.adelanto),
      pdf: { filename: `Cotizacion-${op.ref}.pdf`, content },
    });

    await addEvento({
      operationId: op.id,
      userId: op.user_id,
      tipo: "nota",
      titulo: "Cotización preliminar enviada al cliente",
      detalle: `PDF enviado a ${to}.`,
      autor: user.username ?? user.email ?? "Operador",
      interno: false,
    });

    // Enviar la cotización cierra el Paso 1 (apertura) y pasa al Paso 2
    // (documentación): el cliente recibe el aviso de que esperamos su
    // confirmación (que nos mande la factura / packing) para seguir, o que
    // elimine la operación si no quiere avanzar. Sólo avanzamos si todavía
    // estaba en la apertura (no retrocedemos ni saltamos si ya está más adelante).
    let avanzo = false;
    if (etapaIndex(op.etapa) === 0) {
      const etapaDestino = ETAPA_IDS[1]; // "documentacion"
      await limpiarProvisionalPaso1(op.user_id, op.id);
      await updateOperationEtapa(op.user_id, op.id, etapaDestino);
      const estadoNuevo = estadoClienteDeEtapa(etapaDestino);
      await addEvento({
        operationId: op.id,
        userId: op.user_id,
        tipo: "estado",
        titulo: `Pasó a "${estadoLabel(estadoNuevo)}"`,
        detalle: estadoDescripcion(estadoNuevo, esExportacion(op.tipo)),
        autor: user.username ?? user.email ?? "Operador",
        interno: false,
      });
      avanzo = true;
    }

    return NextResponse.json({ ok: true, to, avanzo });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "No se pudo enviar la cotización.",
      },
      { status: 500 },
    );
  }
}
