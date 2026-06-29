/**
 * Se ejecuta una vez al iniciar el server. Fija la zona horaria de Argentina
 * (UTC-3) para que todas las fechas (new Date(), toLocaleString, etc.) usen el
 * horario local del estudio sin importar dónde esté hospedado el server.
 */
export async function register() {
  process.env.TZ = "America/Argentina/Buenos_Aires";
}
