import "server-only";

/**
 * Candado por archivo para las escrituras de datos.
 *
 * Cada operación sobre un parquet es leer el archivo entero, cambiar una fila
 * y volver a escribirlo entero. Si dos personas del equipo tocan al mismo
 * cliente en el mismo instante, las dos leen la misma versión y la segunda
 * escritura borra el cambio de la primera, sin error ni aviso.
 *
 * Serializando por ruta, esos ciclos no se pisan. Dos operadores en clientes
 * distintos no se estorban: son archivos distintos y cada uno tiene su cola.
 *
 * Alcanza con un candado en memoria porque la app corre en un solo proceso. Si
 * algún día hay varias instancias, esto hay que reemplazarlo por un candado en
 * disco o en la base.
 */

const colas = new Map<string, Promise<unknown>>();

/**
 * Ejecuta `fn` en exclusiva para esa ruta: nadie más entra hasta que termine.
 */
export async function conArchivo<T>(
  ruta: string,
  fn: () => Promise<T>,
): Promise<T> {
  const anterior = colas.get(ruta) ?? Promise.resolve();

  // Encadenamos incluso si la anterior falló: un error no puede dejar la cola
  // trabada para siempre.
  const turno = anterior.then(fn, fn);
  const marca = turno.then(
    () => undefined,
    () => undefined,
  );
  colas.set(ruta, marca);

  try {
    return await turno;
  } finally {
    // Si nadie se encoló detrás nuestro, sacamos la entrada: si no, el Map se
    // queda con una clave por cliente para siempre.
    if (colas.get(ruta) === marca) colas.delete(ruta);
  }
}
