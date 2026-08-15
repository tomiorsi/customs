import type { NextConfig } from "next";

// Toda la app trabaja en horario de Argentina (UTC-3), sin importar el server.
process.env.TZ = process.env.TZ || "America/Argentina/Buenos_Aires";

const esDev = process.env.NODE_ENV !== "production";

/**
 * Política de contenido. La app se sirve entera desde su propio dominio, salvo
 * dos excepciones: los posts de Instagram embebidos en la landing, que
 * necesitan su script y renderizan en un iframe de instagram.com, y los íconos
 * de los cuatro medios que se citan en Inicio.
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
  "img-src 'self' data: blob: https://*.cdninstagram.com https://aduananews.com https://*.tradenews.com.ar https://argenports.com https://*.globalports.com.ar",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline' https://www.instagram.com${esDev ? " 'unsafe-eval'" : ""}`,
  "connect-src 'self'",
  "frame-src 'self' blob: https://www.instagram.com",
  ...(esDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
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
