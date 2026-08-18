# Almacenamiento y seguridad de los datos

Este portal guarda documentación aduanera de empresas que no son nuestras:
facturas comerciales, fichas técnicas, cartas de garantía, CUIT y valores de
operación. Este documento dice cómo se protege y qué hay que hacer para no
romperlo.

## Dónde vive cada cosa

```
data/
├── app.db                        Cuentas, sesiones, suscripciones (SQLite)
├── .clave-almacenamiento         Clave maestra de cifrado  ← BACKUP OBLIGATORIO
├── cache/                        Fotos de fuentes públicas (buques, boletín)
└── clientes/<id_cliente>/        Un directorio por cliente, permisos 0700
    ├── operaciones.parquet       Datos de las operaciones
    ├── documentos.parquet        Metadata de los archivos
    ├── eventos.parquet           Historial
    ├── archivos/                 Lo que sube el cliente, CIFRADO
    └── marca/                    Logo del estudio (solo en cuentas de equipo)
```

Nada de esto está bajo `public/`, así que el servidor web no lo sirve por URL.
Se accede solo por rutas de API que verifican sesión y pertenencia.

## Cifrado de los archivos subidos

Cada archivo se guarda con **AES-256-GCM**, comprimido antes de cifrar.

```
[ 6 bytes ] "JCSEC1"   marca de formato y versión
[ 1 byte  ] flags      bit 0: contenido comprimido
[ 12 bytes] IV         nonce único por escritura
[ 16 bytes] authTag    detecta cualquier alteración
[ resto   ] contenido cifrado
```

Tres decisiones que conviene no revertir:

- **GCM y no CBC.** GCM autentica además de cifrar: si alguien edita un byte en
  disco, el descifrado falla en vez de devolver basura silenciosamente.
- **Comprimir antes de cifrar.** Al revés no sirve: un texto cifrado es
  estadísticamente aleatorio y no comprime nada.
- **El AAD es `<id_cliente>/<nombre_guardado>`.** Un archivo copiado a la
  carpeta de otro cliente no se puede descifrar, aunque el atacante tenga la
  clave. Si alguna vez se renombran archivos guardados, hay que descifrar con el
  nombre viejo y volver a cifrar con el nuevo.

## La clave maestra

En producción se pasa por entorno:

```bash
openssl rand -hex 32
```

```
ALMACENAMIENTO_KEY=<los 64 caracteres hex que salieron>
```

Si esa variable no está, el sistema **genera una sola vez** y la deja en
`data/.clave-almacenamiento` con permisos 600. Es deliberado: el almacenamiento
tiene que quedar cifrado por defecto, sin depender de que alguien se acuerde de
configurarlo.

> **Si se pierde la clave, los archivos no se recuperan.** No hay respaldo ni
> forma de derivarla. Va en el backup junto con `app.db` — pero **no en el mismo
> lugar**: un backup que contiene los datos cifrados *y* la clave al lado es un
> backup sin cifrar.

## Qué se acepta al subir

El tipo se decide por los **primeros bytes del archivo**, no por el
`Content-Type` que manda el navegador (ese lo elige quien sube: renombrar un
`.html` a `.pdf` es trivial).

Se aceptan PDF, imágenes (JPG, PNG, WebP, HEIC, TIFF, GIF) y documentos de
Office. Se rechaza todo lo demás — en particular HTML y SVG, que abiertos desde
nuestro dominio ejecutarían JavaScript con la sesión del usuario.

Límite: 15 MB por archivo.

## Permisos en disco

- Directorios: `0700`
- Archivos: `0600`

Con los `0755`/`0644` que deja `mkdir` por defecto, cualquier cuenta del
servidor podía listar y leer la documentación de todos los clientes.

## Lo que todavía NO está cifrado

Hay que decirlo con todas las letras:

- **`app.db`** (cuentas, CUIT, datos de facturación) y los **`.parquet`** (datos
  de las operaciones: mercadería, valores, NCM) quedan con permisos `0600` pero
  **en claro**. Cifrarlos exigiría descifrar a un temporal en cada lectura, lo
  que empeoraría la seguridad —el archivo en claro pasaría por `/tmp`— y la
  velocidad.
- La protección correcta para esa capa es **cifrado de disco a nivel del sistema
  operativo** (LUKS en Linux, FileVault en macOS) o un volumen cifrado del
  proveedor. Es un requisito del servidor, no del código.

Lo que sí está resuelto en el código es lo más sensible y lo más fácil de
filtrar: los archivos que suben los clientes.

## Migrar / verificar

```bash
npx tsx --require ./scripts/register-server-only-stub.cjs scripts/migrar-almacenamiento.mjs --seco
```

Muestra qué haría sin escribir. Sin `--seco` cifra lo que esté en claro y cierra
los permisos de todo el árbol. Es idempotente: lo ya cifrado se saltea, así que
se puede correr cuantas veces haga falta.

## Lo que ya estaba bien (no tocar)

- Contraseñas con **scrypt** + salt y comparación en tiempo constante.
- Cookie de sesión `httpOnly`, `sameSite=lax`, `secure` en producción.
- Sesión con expiración por inactividad (2 h), renovada en cada request.
- Aislamiento por estudio: las consultas de documentos recorren únicamente los
  clientes del alcance del usuario, así que un despachante nunca encuentra un
  documento de otro estudio (da 404, no 403 — no confirma que exista).
- Descarga con `X-Content-Type-Options: nosniff` y `attachment` para todo lo que
  no sea PDF o imagen conocida.
- `/data/` está en `.gitignore`; no hay datos de clientes versionados.
