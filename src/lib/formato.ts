/**
 * Formato de números y montos en estándar argentino: punto para los miles y
 * coma para los decimales (ej. 257400.00 → "257.400,00"). Compartido entre
 * servidor y cliente para que toda la app muestre los valores igual.
 */

/**
 * Convierte un valor (string o número) a `number`. Tolera montos guardados como
 * "257400.00" (punto decimal), ya formateados "257.400,00" (es-AR) o con
 * símbolos de moneda. Devuelve null si no es un número.
 */
export function aNumero(valor: string | number | null | undefined): number | null {
  if (valor == null) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;

  let s = valor.trim().replace(/[^\d.,-]/g, "");
  if (!s) return null;

  const ultimaComa = s.lastIndexOf(",");
  const ultimoPunto = s.lastIndexOf(".");

  if (ultimaComa > -1 && ultimoPunto > -1) {
    // Hay ambos: el que esté más a la derecha es el separador decimal.
    if (ultimaComa > ultimoPunto) {
      s = s.replace(/\./g, "").replace(",", "."); // es-AR: 257.400,00
    } else {
      s = s.replace(/,/g, ""); // en-US: 257,400.00
    }
  } else if (ultimaComa > -1) {
    // Solo comas: decimal si hay una sola con ≤2 dígitos detrás; si no, miles.
    const partes = s.split(",");
    s =
      partes.length === 2 && partes[1].length <= 2
        ? s.replace(",", ".")
        : s.replace(/,/g, "");
  } else if (ultimoPunto > -1) {
    // Solo puntos: varios ⇒ miles; uno solo ⇒ decimal (lo maneja parseFloat).
    if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, "");
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Formatea un número en es-AR (puntos para miles, coma para decimales). */
export function formatNumero(
  n: number,
  opts?: { minDecimales?: number; maxDecimales?: number },
): string {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: opts?.minDecimales ?? 0,
    maximumFractionDigits: opts?.maxDecimales ?? 2,
  });
}

/**
 * Formatea un monto con su moneda (ej. "USD 257.400,00"). Si el valor no es
 * numérico, lo devuelve tal cual con el prefijo de moneda; si está vacío,
 * devuelve null.
 */
export function formatMoneda(
  moneda: string | null | undefined,
  valor: string | number | null | undefined,
): string | null {
  const prefijo = moneda ? `${moneda} ` : "";
  const n = aNumero(valor);
  if (n == null) {
    const crudo = valor == null ? "" : String(valor).trim();
    return crudo ? `${prefijo}${crudo}` : null;
  }
  return `${prefijo}${formatNumero(n, { minDecimales: 2, maxDecimales: 2 })}`;
}

/** Solo dígitos de una posición arancelaria (NCM/SIM). */
export function digitosNcm(ncm: string | null | undefined): string {
  return (ncm ?? "").replace(/\D/g, "");
}

/** Subpartida de 6 dígitos o menos: demasiado general para despachar. */
export function ncmPareceGeneral(ncm: string | null | undefined): boolean {
  return digitosNcm(ncm).length < 8;
}
