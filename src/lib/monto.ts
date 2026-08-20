/**
 * Un monto escrito por una persona → número.
 *
 * Vive solo porque tiene que haber **una** forma de leer un importe en todo el
 * sistema. Había dos: esta, que la interpretación de documentos usa desde
 * siempre, y otra más corta dentro del adaptador del pre-SIM que asumía formato
 * latino y convertía `60192.00` en `6019200` — el FOB cien veces más grande, y
 * con él los derechos, el IVA y todo lo que cuelga. Un archivo así valida
 * perfecto y está mal, que es la peor forma de estar mal.
 *
 * No asume un formato: el **último** separador manda como decimal y el otro es
 * de miles, así que `90,497.76` y `90.497,76` dan lo mismo. Con un solo tipo de
 * separador solo es decimal si lo siguen una o dos cifras, para no romper
 * `90.497` de miles ni convertir `90,50` en 9050.
 */
export function montoDesdeTexto(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[^0-9.,-]/g, "").trim();
  if (!s) return null;
  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");
  if (!s) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalizado: string;
  if (lastComma >= 0 && lastDot >= 0) {
    normalizado =
      lastComma > lastDot
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const dec = (s.match(/,/g) ?? []).length === 1 && s.length - lastComma - 1 <= 2;
    normalizado = dec ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const dec = (s.match(/\./g) ?? []).length === 1 && s.length - lastDot - 1 <= 2;
    normalizado = dec ? s : s.replace(/\./g, "");
  } else {
    normalizado = s;
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}
