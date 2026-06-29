/**
 * Datos auxiliares del clasificador (IVA estimado por posición).
 */

/**
 * IVA estimado por posición (Argentina). El IVA real depende del producto y la
 * etapa; esto es orientativo y editable por el cliente.
 * - 0% exento: libros/diarios (partidas 4901-4904).
 * - 10,5% reducido: alimentos básicos / agro (capítulos abajo).
 * - 21% general: resto.
 */
const IVA_EXENTO_PARTIDAS = new Set(["4901", "4902", "4903", "4904"]);
const IVA_REDUCIDO_CAPITULOS = new Set([
  "01", "02", "03", "04", "07", "08", "10", "11", "12",
]);

export function ivaEstimado(codigoNum: string): number {
  const p4 = codigoNum.slice(0, 4);
  const cap = codigoNum.slice(0, 2);
  if (IVA_EXENTO_PARTIDAS.has(p4)) return 0;
  if (IVA_REDUCIDO_CAPITULOS.has(cap)) return 10.5;
  return 21;
}
