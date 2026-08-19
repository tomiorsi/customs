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
   * La raíz sirve la landing de wabe.dev tal cual está en public/landing.
   *
   * No se portó a componentes a propósito: son 65 KB de CSS y 1.700 líneas de
   * JS con un canvas de three.js y siete demos interactivos. Reescribirlo a
   * Tailwind garantizaba diferencias contra el original, y lo que se pidió es
   * que sea idéntica. Así el archivo es el mismo que el sitio publicado, y
   * actualizarla es copiar la carpeta de nuevo.
   *
   * `beforeFiles` para que gane sobre cualquier ruta de la app.
   */
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/landing/index.html" }],
      afterFiles: [],
      fallback: [],
    };
  },

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
