/** Tope de costo por corrida de clasificación (USD). Incluye reintentos Fase 2↔3. */
export const COSTO_MAX_USD = 0.2;

/** Tarifas aproximadas claude-haiku-4-5 (USD por millón de tokens). */
const USD_POR_MILLON_INPUT = 1;
const USD_POR_MILLON_OUTPUT = 5;

let costoSesionUsd = 0;

export class CostoClasificacionExcedidoError extends Error {
  readonly usd: number;

  constructor(usd: number) {
    super(
      `La clasificación superó el tope de $${COSTO_MAX_USD.toFixed(2)} (estimado ~$${usd.toFixed(3)}).`,
    );
    this.usd = usd;
    this.name = "CostoClasificacionExcedidoError";
  }
}

export function reiniciarCostoClasificacion(): void {
  costoSesionUsd = 0;
}

export function costoClasificacionUsd(): number {
  return costoSesionUsd;
}

export function registrarUsoTokens(input: number, output: number): void {
  costoSesionUsd +=
    (input / 1_000_000) * USD_POR_MILLON_INPUT +
    (output / 1_000_000) * USD_POR_MILLON_OUTPUT;
  if (costoSesionUsd > COSTO_MAX_USD) {
    throw new CostoClasificacionExcedidoError(costoSesionUsd);
  }
}
