import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo, alcanceDe } from "@/lib/roles";
import { getDocumentsByOperation, getOperationById } from "@/lib/data";
import { leerDocumento } from "@/lib/archivos-cliente";
import {
  analizarApertura,
  iaDocsDisponible,
  type ArchivoIA,
  type DatosCliente,
} from "@/lib/ia-documentos";
import {
  DOC_LABELS,
  DOCS_IA_POR_ETAPA,
  docsRelevantesIA,
  documentosConValorLegal,
  type DocType,
} from "@/lib/docs";
import { antidumpingPorNcmPais } from "@/lib/vuce";
import { FORMAS_PAGO_OPCIONES } from "@/lib/cotizador";
import { leerYAplicarCostosForwarder } from "@/lib/costos-forwarder-extract";

const MAX_ARCHIVOS = 20;

/** Orden de envío a la IA: tipos del paso primero; el resto al final. */
function prioridadDoc(t: DocType): number {
  const i = DOCS_IA_POR_ETAPA.apertura.indexOf(t);
  return i < 0 ? DOCS_IA_POR_ETAPA.apertura.length : i;
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !esEquipo(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  if (!iaDocsDisponible()) {
    return NextResponse.json(
      { error: "La IA no está configurada (falta ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;
  const op = await getOperationById(id, alcanceDe(user));
  if (!op) {
    return NextResponse.json(
      { error: "Operación no encontrada." },
      { status: 404 },
    );
  }

  const docs = await getDocumentsByOperation(op.id, op.user_id);
  if (docs.length === 0) {
    return NextResponse.json(
      {
        error:
          "Subí la proforma o el pedido de compra para estimar la cotización. (Si ya tenés la factura comercial definitiva, pasá directo al Paso 2.)",
      },
      { status: 400 },
    );
  }

  // Solo analizamos los documentos que pertenecen a ESTA etapa (apertura): no
  // le mandamos a la IA documentos de pasos posteriores (BL, gastos, etc.).
  const relevantes = docsRelevantesIA("apertura");
  // Regla general: ante dos documentos del mismo rol se usa el que tiene VALOR
  // LEGAL (definitivo); los borradores/drafts se descartan y no se analizan.
  const ordenados = documentosConValorLegal(docs)
    .filter((d) => relevantes.has(d.doc_type))
    .sort((a, b) => prioridadDoc(a.doc_type) - prioridadDoc(b.doc_type));

  const archivos: ArchivoIA[] = [];
  for (const d of ordenados) {
    if (archivos.length >= MAX_ARCHIVOS) break;
    const bytes = await leerDocumento(d.user_id, d.stored_name);
    if (!bytes) continue;
    archivos.push({
      rol: DOC_LABELS[d.doc_type] ?? "Documento",
      nombre: d.file_name,
      mediaType: d.mime_type || "application/octet-stream",
      base64: Buffer.from(bytes).toString("base64"),
    });
  }

  if (archivos.length === 0) {
    return NextResponse.json(
      { error: "No se pudieron leer los documentos subidos." },
      { status: 400 },
    );
  }

  const esExpo = op.tipo.toLowerCase().startsWith("exp");
  const formaPagoLabel =
    FORMAS_PAGO_OPCIONES.find((o) => o.value === op.forma_pago)?.label ??
    op.forma_pago;
  const datosCliente: DatosCliente = {
    via: op.via,
    forma_pago: formaPagoLabel,
    pais: esExpo ? op.pais_destino : op.pais_origen,
    mercaderia: op.mercaderia,
    estado: op.estado_merc,
    incoterm: op.incoterm,
  };

  try {
    const resultado = await analizarApertura(archivos, op.tipo, datosCliente);
    const ncm = resultado.campos.ncm ?? op.ncm;
    const paisOrigen = resultado.campos.pais_origen ?? op.pais_origen;
    const anti = await antidumpingPorNcmPais(ncm, paisOrigen);
    if (anti.medidas.length > 0) {
      const principales = anti.medidas
        .slice(0, 3)
        .map((m) => {
          const medida = [m.tipoMedida, m.medidaAplicada, m.normativa]
            .filter(Boolean)
            .join(" · ");
          return `${m.posicion}${m.producto ? ` (${m.producto})` : ""}${
            medida ? `: ${medida}` : ""
          }`;
        })
        .join("; ");
      resultado.alertas.push({
        nivel: "warn",
        texto:
          `VUCE informa posible antidumping para origen ${anti.pais}: ` +
          principales +
          ". Confirmar antes de avanzar con la operación.",
      });
    }
    // La coherencia del Incoterm con la operación (p. ej. su idoneidad en
    // exportación) la evalúa el motor general (IA experta + MARCO NORMATIVO),
    // no una regla de un caso puntual hardcodeada acá.

    // Mismo botón, un solo análisis: si hay cotizaciones/facturas del forwarder
    // subidas, la IA también las lee y aplica flete / seguro / gastos locales
    // automáticamente (decide qué es cada cosa y dónde va). No bloquea la
    // apertura si falla.
    let costos = null;
    try {
      costos = await leerYAplicarCostosForwarder(op);
    } catch {
      costos = null;
    }
    if (costos) {
      const esExpoCostos = op.tipo.toLowerCase().startsWith("exp");
      const partes: string[] = [];
      if (costos.campos.flete) partes.push(`flete USD ${costos.campos.flete}`);
      if (costos.campos.seguro)
        partes.push(`seguro USD ${costos.campos.seguro}`);
      else if (costos.resultado.seguroNoIncluido)
        partes.push("seguro no incluido (se usa 1%)");
      const gastos = esExpoCostos
        ? costos.campos.gastos_origen
        : costos.campos.gastos_destino;
      if (gastos)
        partes.push(
          `gastos en ${esExpoCostos ? "origen" : "destino"} USD ${gastos}`,
        );
      if (partes.length > 0) {
        resultado.alertas.push({
          nivel: "ok",
          texto: `Cotización del forwarder leída: se cargó ${partes.join(", ")}.`,
        });
      }
    }
    return NextResponse.json({ ok: true, resultado, costos });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "No se pudo analizar con IA.",
      },
      { status: 502 },
    );
  }
}
