import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import path from "node:path";

/**
 * Almacenamiento cifrado de los archivos que suben los clientes.
 *
 * Acá adentro hay facturas, fichas técnicas, cartas de garantía y documentación
 * aduanera de empresas que no son nuestras. Que estén en un disco que
 * controlamos no alcanza: si alguien se lleva una copia del directorio —un
 * backup mal guardado, un disco que se vende, un acceso al servidor— tiene todo
 * en claro. Cifrados, lo que se lleva no sirve sin la clave.
 *
 * Cada archivo se guarda así:
 *
 *   [ 6 bytes  ] "JCSEC1"  — marca de formato y versión
 *   [ 1 byte   ] flags     — bit 0: el contenido va comprimido
 *   [ 12 bytes ] IV        — nonce único por archivo
 *   [ 16 bytes ] authTag   — GCM: detecta cualquier alteración
 *   [ resto    ] contenido cifrado
 *
 * Decisiones que importan:
 *
 * - AES-256-GCM y no AES-CBC: GCM además de cifrar AUTENTICA. Si alguien edita
 *   un byte del archivo en disco, el descifrado falla en vez de devolver basura
 *   silenciosamente.
 * - Se comprime ANTES de cifrar. Al revés no sirve: un texto cifrado es
 *   estadísticamente aleatorio y no se comprime nada.
 * - El IV es nuevo en cada escritura. Repetir un IV con la misma clave rompe la
 *   garantía de GCM por completo.
 * - Como datos asociados (AAD) va la identidad del archivo: cliente + nombre
 *   guardado. Así un archivo copiado a la carpeta de otro cliente NO se puede
 *   descifrar, aunque el atacante tenga la clave y acceso al disco.
 */

const MAGIC = Buffer.from("JCSEC1", "utf8");
const IV_LEN = 12;
const TAG_LEN = 16;
const CABECERA = MAGIC.length + 1 + IV_LEN + TAG_LEN;

const FLAG_COMPRIMIDO = 0x01;

/** Debajo de esto comprimir no compensa el trabajo. */
const MIN_COMPRIMIR = 1024;

/** Permisos: solo el usuario dueño del proceso. Ni el grupo ni el resto. */
export const MODO_ARCHIVO = 0o600;
export const MODO_DIRECTORIO = 0o700;

const DATA_DIR = path.join(process.cwd(), "data");
const ARCHIVO_CLAVE = path.join(DATA_DIR, ".clave-almacenamiento");

let claveCache: Buffer | null = null;

/**
 * Clave maestra de 32 bytes.
 *
 * Sale de ALMACENAMIENTO_KEY (64 caracteres hex) si está definida — que es lo
 * que corresponde en producción, donde la clave la administra el entorno y no
 * toca el disco de la aplicación.
 *
 * Si no está, se genera una y se guarda en data/.clave-almacenamiento con
 * permisos 600. Esto es deliberado: el sistema tiene que quedar cifrado por
 * defecto, sin depender de que alguien se acuerde de configurar algo. Un
 * almacenamiento que solo se protege "si lo activás" termina sin activar.
 *
 * SI SE PIERDE LA CLAVE, LOS ARCHIVOS NO SE RECUPERAN. Entra en el backup igual
 * que la base.
 */
export function claveAlmacenamiento(): Buffer {
  if (claveCache) return claveCache;

  const env = (process.env.ALMACENAMIENTO_KEY ?? "").trim();
  if (env) {
    if (!/^[0-9a-fA-F]{64}$/.test(env)) {
      throw new Error(
        "ALMACENAMIENTO_KEY tiene que ser de 64 caracteres hexadecimales (32 bytes). " +
          "Generá una con: openssl rand -hex 32",
      );
    }
    claveCache = Buffer.from(env, "hex");
    return claveCache;
  }

  if (existsSync(ARCHIVO_CLAVE)) {
    const guardada = readFileSync(ARCHIVO_CLAVE, "utf8").trim();
    if (/^[0-9a-fA-F]{64}$/.test(guardada)) {
      claveCache = Buffer.from(guardada, "hex");
      return claveCache;
    }
  }

  const nueva = randomBytes(32);
  writeFileSync(ARCHIVO_CLAVE, nueva.toString("hex"), { mode: MODO_ARCHIVO });
  console.warn(
    "\n[almacenamiento] Se generó una clave nueva en data/.clave-almacenamiento.\n" +
      "  Incluila en el backup: sin ella los archivos de los clientes NO se pueden leer.\n" +
      "  En producción, mejor pasarla por la variable ALMACENAMIENTO_KEY.\n",
  );
  claveCache = nueva;
  return claveCache;
}

/**
 * Ata el archivo a su dueño y a su nombre. Va como AAD: no se cifra, pero
 * cualquier cambio invalida el authTag y el descifrado falla.
 */
function datosAsociados(userId: string, storedName: string): Buffer {
  return Buffer.from(`${userId}/${storedName}`, "utf8");
}

/** ¿Este contenido está cifrado por nosotros? */
export function estaCifrado(buf: Buffer): boolean {
  return (
    buf.length >= CABECERA &&
    timingSafeEqual(buf.subarray(0, MAGIC.length), MAGIC)
  );
}

export function cifrar(
  contenido: Buffer,
  userId: string,
  storedName: string,
): Buffer {
  // Se comprime primero, y solo si sirve: un PDF o un JPG ya vienen
  // comprimidos y gzip los deja igual o apenas más grandes.
  let cuerpo = contenido;
  let flags = 0;
  if (contenido.length >= MIN_COMPRIMIR) {
    const comprimido = gzipSync(contenido, { level: 9 });
    if (comprimido.length < contenido.length) {
      cuerpo = comprimido;
      flags |= FLAG_COMPRIMIDO;
    }
  }

  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", claveAlmacenamiento(), iv);
  cipher.setAAD(datosAsociados(userId, storedName));
  const cifrado = Buffer.concat([cipher.update(cuerpo), cipher.final()]);

  return Buffer.concat([
    MAGIC,
    Buffer.from([flags]),
    iv,
    cipher.getAuthTag(),
    cifrado,
  ]);
}

export function descifrar(
  buf: Buffer,
  userId: string,
  storedName: string,
): Buffer {
  // Compatibilidad: lo guardado antes de esto está en claro. Se devuelve tal
  // cual para no romper nada, y el script de migración lo reescribe cifrado.
  if (!estaCifrado(buf)) return buf;

  const flags = buf[MAGIC.length];
  const iv = buf.subarray(MAGIC.length + 1, MAGIC.length + 1 + IV_LEN);
  const tag = buf.subarray(MAGIC.length + 1 + IV_LEN, CABECERA);
  const cuerpo = buf.subarray(CABECERA);

  const decipher = createDecipheriv("aes-256-gcm", claveAlmacenamiento(), iv);
  decipher.setAAD(datosAsociados(userId, storedName));
  decipher.setAuthTag(tag);
  // Si el archivo fue alterado, o es de otro cliente, esto tira acá.
  const plano = Buffer.concat([decipher.update(cuerpo), decipher.final()]);

  return flags & FLAG_COMPRIMIDO ? gunzipSync(plano) : plano;
}

/** Escribe un archivo de cliente: comprimido, cifrado y con permisos 600. */
export async function escribirArchivoSeguro(
  destino: string,
  contenido: Buffer,
  userId: string,
  storedName: string,
): Promise<void> {
  await mkdir(path.dirname(destino), { recursive: true, mode: MODO_DIRECTORIO });
  await writeFile(destino, cifrar(contenido, userId, storedName), {
    mode: MODO_ARCHIVO,
  });
}

/** Lee y descifra. Devuelve null si el archivo no está o no se puede leer. */
export async function leerArchivoSeguro(
  origen: string,
  userId: string,
  storedName: string,
): Promise<Buffer | null> {
  try {
    return descifrar(await readFile(origen), userId, storedName);
  } catch {
    return null;
  }
}

/** Ajusta permisos de un directorio ya creado (para los que vienen de antes). */
export async function asegurarPermisos(dir: string): Promise<void> {
  await chmod(dir, MODO_DIRECTORIO).catch(() => {});
}
