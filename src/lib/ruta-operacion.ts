/** Campos mínimos para armar la ruta en UI (cliente o servidor). */
export type OperacionRuta = {
  puerto_origen?: string | null;
  puerto_destino?: string | null;
  puerto_transbordo?: string | null;
  paso_frontera?: string | null;
  validacion_ia?: string | null;
};

export type DatosRutaOperacion = {
  origen: string | null;
  destino: string | null;
  /** Transbordo marítimo, escala aérea o paso fronterizo terrestre. */
  escala: string | null;
  /** Ruta ya armada por la IA (p. ej. validación embarque). */
  rutaPreformateada: string | null;
};

function logisticaEmbarqueDeValidacion(
  raw: string | null | undefined,
): {
  puerto_transbordo?: string;
  ruta_transbordo?: string;
} | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as {
      embarque?: { resultado?: { logistica?: Record<string, unknown> } };
    };
    const log = o.embarque?.resultado?.logistica;
    if (!log || typeof log !== "object") return null;
    return {
      puerto_transbordo:
        typeof log.puerto_transbordo === "string"
          ? log.puerto_transbordo
          : undefined,
      ruta_transbordo:
        typeof log.ruta_transbordo === "string"
          ? log.ruta_transbordo
          : undefined,
    };
  } catch {
    return null;
  }
}

/** Arma la ruta visible: origen → [escala] → destino. */
export function formatRutaOperacion(datos: DatosRutaOperacion): string | null {
  const pre = datos.rutaPreformateada?.trim();
  if (pre && pre.includes("→")) return pre;

  const origen = datos.origen?.trim() || null;
  const destino = datos.destino?.trim() || null;
  const escala = datos.escala?.trim() || null;

  if (!origen && !destino && !escala) return null;
  if (escala && (origen || destino)) {
    return `${origen ?? "—"} → ${escala} → ${destino ?? "—"}`;
  }
  if (!origen && !destino) return escala;
  return `${origen ?? "—"} → ${destino ?? "—"}`;
}

export function datosRutaDeOperacion(op: OperacionRuta): DatosRutaOperacion {
  const origen = op.puerto_origen ?? null;
  const destino = op.puerto_destino ?? null;
  let escala = op.puerto_transbordo?.trim() || null;
  let rutaPreformateada: string | null = null;

  const log = logisticaEmbarqueDeValidacion(op.validacion_ia);
  if (log) {
    if (!escala) escala = log.puerto_transbordo?.trim() || null;
    rutaPreformateada = log.ruta_transbordo?.trim() || null;
  }

  // Terrestre: paso fronterizo como escala intermedia si no hay transbordo.
  if (!escala) escala = op.paso_frontera?.trim() || null;

  return { origen, destino, escala, rutaPreformateada };
}

export function rutaOperacion(op: OperacionRuta): string | null {
  return formatRutaOperacion(datosRutaDeOperacion(op));
}
