import { NextResponse } from "next/server";
import { ultimasNoticias } from "@/lib/noticias";
import { dentroDelLimite, ipDe } from "@/lib/limite-publico";

/**
 * Las noticias, sin cuenta.
 *
 * La portada del sitio es un archivo estático y las notas cambian cada hora,
 * así que se piden desde el navegador en vez de venir escritas en el HTML.
 *
 * Devuelve lo mismo que ve el equipo adentro: no hay una versión recortada
 * para el visitante. Son notas de otros medios, con su link — lo que se
 * publica es el título, el resumen que el propio medio pone en su feed para
 * que lo sindiquen, y de dónde salió.
 */

export const dynamic = "force-dynamic";

/** Cuántas devolver cuando no piden un número. Es lo que entra en la portada. */
const POR_DEFECTO = 3;
const MAXIMO = 40;

export async function GET(req: Request) {
  if (!dentroDelLimite(ipDe(req), "noticias", 30)) {
    return NextResponse.json(
      { ok: false, error: "Demasiadas consultas seguidas. Probá en un minuto." },
      { status: 429 },
    );
  }

  const pedidas = Number(new URL(req.url).searchParams.get("n"));
  const cuantas = Number.isFinite(pedidas)
    ? Math.min(Math.max(1, pedidas), MAXIMO)
    : POR_DEFECTO;

  const prensa = await ultimasNoticias();
  // Con imagen primero: la portada muestra tarjetas y una sin foto queda coja.
  const conImagen = prensa.noticias.filter((n) => n.imagen);
  const resto = prensa.noticias.filter((n) => !n.imagen);
  const elegidas = [...conImagen, ...resto].slice(0, cuantas);

  return NextResponse.json({
    ok: true,
    consultado: prensa.consultado,
    noticias: elegidas.map((n) => ({
      id: n.id,
      titulo: n.titulo,
      resumen: n.resumen,
      cuando: n.cuando,
      medio: n.medioNombre,
      imagen: n.imagen,
      // El link a la nota nuestra, no al medio: desde ahí se sale al original.
      href: `/noticias/${encodeURIComponent(n.id)}`,
    })),
  });
}
