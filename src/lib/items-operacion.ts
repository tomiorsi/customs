import type { ItemDocumento } from "@/lib/ia-documentos";

/**
 * Los productos de una carpeta, cada uno con su posición.
 *
 * Una carpeta rara vez tiene una sola mercadería: de los 13.467 despachos del
 * archivo del estudio, **4.526 (33,6%) llevan más de una posición** y el más
 * grande tiene 37. Y no se sabe cuántas son hasta que se clasifican: la
 * proforma casi nunca trae la posición, la encuentra el despachante producto
 * por producto.
 *
 * Por eso esto es una **lista que crece**, no un campo. Se puede empezar
 * vacía, con lo que la interpretación sacó de la factura, o con un producto
 * suelto que el despachante escribió, y se le agregan los demás de a uno.
 *
 * Convive con `op.ncm`, que sigue siendo la posición principal —la primera con
 * posición asignada— para todo lo que hoy la lee: liquidación, ficha para
 * Malvina, intervenciones. Nada de eso cambia de comportamiento mientras haya
 * un solo producto.
 */

export type ItemOperacion = ItemDocumento & {
  /**
   * El texto legal de la posición, tal como lo dice el nomenclador.
   *
   * Se guarda al agregarla y no se vuelve a pedir. Sirve para que la lista
   * muestre QUÉ es cada posición: once dígitos solos no le dicen a nadie si se
   * equivocó de renglón, y el error de clasificación se descubre tarde.
   */
  descripcion_ncm?: string;
  /**
   * De dónde salió el producto.
   *
   * Sirve para no pisar lo que cargó una persona con lo que leyó la IA la
   * próxima vez que se sube un documento: lo `manual` gana siempre.
   */
  fuente?: "documento" | "manual";
};

/** Los productos guardados en la operación. */
export function leerItems(itemsJson: string | null | undefined): ItemOperacion[] {
  const s = (itemsJson ?? "").trim();
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return [];
    // Se filtra lo que no tenga forma de producto: el JSON pudo quedar de una
    // versión anterior, y es preferible mostrar de menos que romper.
    return arr.filter((x): x is ItemOperacion => Boolean(x) && typeof x === "object");
  } catch {
    return [];
  }
}

/** Los productos, listos para guardar. Vacío se guarda como cadena vacía. */
export function escribirItems(items: ItemOperacion[]): string {
  return items.length ? JSON.stringify(renumerar(items)) : "";
}

/** Renumera el orden después de agregar o quitar, para que no queden huecos. */
function renumerar(items: ItemOperacion[]): ItemOperacion[] {
  return items.map((it, i) => ({ ...it, orden: i + 1 }));
}

/**
 * Compara dos descripciones de producto.
 *
 * Sin acentos, sin puntuación y sin dobles espacios, porque el mismo producto
 * viene escrito distinto en la factura y en el packing. No se intenta nada más
 * fino: dos descripciones parecidas pero no iguales son dos productos hasta
 * que alguien diga lo contrario, y unirlos por parecido haría desaparecer un
 * renglón sin que nadie se entere.
 */
function mismaDescripcion(a: string | undefined, b: string | undefined): boolean {
  const n = (s: string | undefined) =>
    (s ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .trim();
  const na = n(a);
  return Boolean(na) && na === n(b);
}

/**
 * Agrega un producto, o le pone la posición al que ya estaba.
 *
 * Si la descripción coincide con una que ya está, se completa ese renglón en
 * vez de duplicarlo. Es el caso normal: la factura trajo «MOPAS» sin posición
 * y el despachante después la clasifica.
 */
export function agregarItem(
  items: ItemOperacion[],
  nuevo: ItemOperacion,
): ItemOperacion[] {
  const i = items.findIndex((x) => mismaDescripcion(x.mercaderia, nuevo.mercaderia));
  if (i >= 0) {
    const salida = items.slice();
    // Lo nuevo completa, no borra: si el renglón ya tenía cantidad y valor de
    // la factura, una clasificación posterior no debería vaciarlos.
    salida[i] = { ...salida[i], ...limpiar(nuevo) };
    return renumerar(salida);
  }
  return renumerar([...items, nuevo]);
}

/** Saca las claves vacías, para que no pisen datos buenos con undefined. */
function limpiar(it: ItemOperacion): ItemOperacion {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(it)) {
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out as ItemOperacion;
}

/** Quita un producto por su posición en la lista (1-based). */
export function quitarItem(items: ItemOperacion[], orden: number): ItemOperacion[] {
  return renumerar(items.filter((_, i) => i + 1 !== orden));
}

/**
 * La posición principal de la carpeta.
 *
 * Es la del primer producto que tenga una. Se usa para mantener `op.ncm` al
 * día sin que nada de lo que hoy lo lee tenga que enterarse de que ahora hay
 * varios productos.
 */
export function ncmPrincipal(items: ItemOperacion[]): string | null {
  return items.find((x) => x.ncm)?.ncm ?? null;
}

/**
 * Qué le falta a un renglón para poder declararse.
 *
 * La declaración necesita de cada ítem su posición, su cantidad con su unidad,
 * su peso neto y su valor. Mientras la carpeta tiene un solo producto esos
 * datos salen de los campos planos de la operación; con varios, cada renglón
 * carga los suyos y hay que ver cuáles están.
 *
 * El peso es el que más falta y el único que no se puede derivar: probado
 * contra las cinco declaraciones multi-ítem del archivo, repartirlo en
 * proporción al valor se cae —un renglón que pesa 7.123 kg daría 1.984—,
 * porque depende de qué es la mercadería y no de cuánto sale.
 */
export function faltaParaDeclarar(it: ItemOperacion): string[] {
  const falta: string[] = [];
  if (!it.ncm?.trim()) falta.push("posición");
  if (!it.cantidad?.trim()) falta.push("cantidad");
  if (!it.unidad?.trim()) falta.push("unidad");
  if (!it.peso_neto?.trim()) falta.push("peso");
  if (!it.valor?.trim()) falta.push("valor");
  return falta;
}

/** Cuántos productos hay y cuántos están clasificados. */
export function resumenItems(items: ItemOperacion[]): {
  total: number;
  clasificados: number;
  posiciones: number;
  /** Renglones a los que todavía les falta algo para declarar. */
  incompletos: number;
} {
  const conNcm = items.filter((x) => x.ncm);
  return {
    total: items.length,
    clasificados: conNcm.length,
    incompletos: items.filter((x) => faltaParaDeclarar(x).length > 0).length,
    // Los productos que comparten posición son un solo ítem del despacho: es
    // lo que pasó con la carpeta YANXIN, donde 15 renglones fueron 9 ítems.
    posiciones: new Set(conNcm.map((x) => x.ncm)).size,
  };
}
