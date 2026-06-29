import type { NextConfig } from "next";

// Toda la app trabaja en horario de Argentina (UTC-3), sin importar el server.
process.env.TZ = process.env.TZ || "America/Argentina/Buenos_Aires";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@dsnp/parquetjs"],
  devIndicators: false,
};

export default nextConfig;
