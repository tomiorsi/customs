import type { MetadataRoute } from "next";

/**
 * Qué puede recorrer un buscador.
 *
 * Abierto lo que es abierto —la portada y las noticias— y cerrado el panel y
 * las rutas de datos. No es una medida de seguridad: el panel ya pide sesión.
 * Es para que Google no gaste su presupuesto de rastreo golpeando puertas
 * cerradas en vez de leer las notas, que es lo que queremos que indexe.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/inicio", "/login", "/registro"],
    },
    sitemap: "https://wabe.dev/sitemap.xml",
  };
}
