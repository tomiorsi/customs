import type { MetadataRoute } from "next";
import { ultimasNoticias } from "@/lib/noticias";

/**
 * El mapa del sitio.
 *
 * Reemplaza al `sitemap.xml` que vivía en `public/landing/`, que estaba roto
 * sin que se notara: `robots.txt` apunta a `/sitemap.xml` y ese archivo se
 * servía en `/landing/sitemap.xml`, así que la URL que Google leía daba 404.
 *
 * Además ahora hay algo que mapear. Antes el sitio era una sola página con
 * anclas —una entrada y listo—; ahora cada nota tiene su URL, y son las notas
 * las que traen gente que todavía no nos conoce.
 */

export const revalidate = 1800;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://wabe.dev";
  const fijas: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/noticias`, changeFrequency: "hourly", priority: 0.8 },
  ];

  // Si los feeds no contestan, el mapa sale igual con las dos fijas: un
  // sitemap incompleto es mejor que uno que no responde.
  try {
    const prensa = await ultimasNoticias();
    return [
      ...fijas,
      ...prensa.noticias.map((n) => ({
        url: `${base}/noticias/${encodeURIComponent(n.id)}`,
        lastModified: n.publicado ? new Date(n.publicado) : undefined,
        changeFrequency: "never" as const,
        priority: 0.6,
      })),
    ];
  } catch {
    return fijas;
  }
}
