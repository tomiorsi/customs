import type { NextConfig } from "next";

// Toda la app trabaja en horario de Argentina (UTC-3), sin importar el server.
process.env.TZ = process.env.TZ || "America/Argentina/Buenos_Aires";

const esDev = process.env.NODE_ENV !== "production";

/**
 * Política de contenido. La app se sirve entera desde su propio dominio, salvo
 * dos excepciones: los reels de la landing, que renderizan en un iframe de
 * instagram.com, y los íconos de los cuatro medios que se citan en Noticias.
 * Ya no hace falta permitir el script de Meta: el embed va por iframe directo.
 *
 * `unsafe-inline` en scripts es lo que hoy necesita Next para su bootstrap
 * inline; se puede endurecer más adelante con nonces por request.
 * `unsafe-eval` va solo en desarrollo, que es donde lo usa el refresco rápido.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  // Nadie puede meter la app en un iframe: evita clickjacking sobre el portal.
  "frame-ancestors 'none'",
  "form-action 'self'",
  /**
   * Imágenes de terceros: solo las portadas de los medios del Boletín.
   *
   * Cada medio va con las DOS formas —el dominio pelado y el comodín— porque
   * no controlamos desde cuál sirve sus imágenes y puede cambiar sin aviso.
   * `*.tradenews.com.ar` NO cubre `tradenews.com.ar`: el comodín exige al
   * menos un subdominio. Por eso una noticia de Trade News salía sin foto
   * mientras las de los otros medios cargaban bien.
   */
  "img-src 'self' data: blob: https://*.cdninstagram.com " +
    "https://aduananews.com https://*.aduananews.com " +
    "https://tradenews.com.ar https://*.tradenews.com.ar " +
    "https://argenports.com https://*.argenports.com " +
    "https://globalports.com.ar https://*.globalports.com.ar",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  `script-src 'self' 'unsafe-inline'${esDev ? " 'unsafe-eval'" : ""}`,
  "connect-src 'self'",
  "frame-src 'self' blob: https://www.instagram.com",
  ...(esDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  /**
   * La raíz es una página de la aplicación, no un archivo estático.
   *
   * Hasta el 20/8/2026 había acá un `rewrite` que servía
   * `public/landing/index.html`: la landing de agencia, con servicios y
   * proyectos. Se sacó cuando la portada pasó a mostrar lo mismo que ve el
   * equipo adentro —Boletín del día, notas del sector, nomenclador—, porque
   * eso son componentes que ya existen y un archivo estático no los puede
   * usar. De la landing queda la ola 3D del hero, que sí se sirve de
   * `public/landing/`.
   */

  serverExternalPackages: ["better-sqlite3", "@dsnp/parquetjs"],
  devIndicators: false,

  // Los PDFs y datos de clientes no deben quedar cacheados por Cloudflare ni
  // por proxies intermedios: cada respuesta se pide al origen.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          ...(esDev
            ? []
            : [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]),
        ],
      },
      {
        // Documentos de clientes: nunca en caché compartida.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
