/**
 * Prensa de comercio exterior.
 *
 * El Boletín dice qué te obliga; estos medios dicen qué está pasando. Son los
 * cuatro portales del rubro que publican RSS abierto, así que se leen sin
 * scrapear nada ni depender de que alguien cargue links a mano.
 */

export type Medio = {
  id: string;
  nombre: string;
  /** Feed RSS del medio. */
  feed: string;
  /** Home, para citar la fuente. */
  sitio: string;
};

export const MEDIOS: Medio[] = [
  {
    id: "aduana-news",
    nombre: "Aduana News",
    feed: "https://aduananews.com/feed/",
    sitio: "https://aduananews.com",
  },
  {
    id: "trade-news",
    nombre: "Trade News",
    feed: "https://www.tradenews.com.ar/feed/",
    sitio: "https://www.tradenews.com.ar",
  },
  {
    id: "argenports",
    nombre: "ArgenPorts",
    feed: "https://argenports.com/feed/",
    sitio: "https://argenports.com",
  },
  {
    id: "globalports",
    nombre: "GlobalPorts",
    feed: "https://www.globalports.com.ar/feed/",
    sitio: "https://www.globalports.com.ar",
  },
];

export type Noticia = {
  id: string;
  titulo: string;
  url: string;
  /** Resumen del feed, ya sin HTML. Vacío si el medio no lo publica. */
  resumen: string;
  autor: string | null;
  categoria: string | null;
  /** Publicación en ISO, para ordenar. */
  publicado: string | null;
  /**
   * Cuándo salió, ya redactado ("hoy 14:59", "ayer 18:53", "12/08").
   * Se calcula en el servidor para que no haya desfasaje al hidratar.
   */
  cuando: string;
  medioId: string;
  medioNombre: string;
};

export type ListadoNoticias = {
  noticias: Noticia[];
  /** Medios que no respondieron, para no fingir que no existían. */
  fallaron: { nombre: string; error: string }[];
  consultado: string;
};
