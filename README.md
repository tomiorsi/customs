# Estudio de Despachantes · Portal de Comercio Exterior

Portal documental y de seguimiento para importadores y exportadores.
Construido con **Next.js 16**, **React 19**, **TypeScript** y **Tailwind CSS v4**.

Interfaz minimalista y moderna, con **modo día / modo noche** (botón de cambio)
y un único color de acento: **naranja**.

## Cómo levantar la web

Con Python (forma recomendada, levanta el servidor local):

```bash
python3 run.py
```

Esto instala dependencias la primera vez y abre la web en
`http://localhost:3000`.

Opciones:

```bash
python3 run.py --port 4000   # otro puerto
python3 run.py --prod        # build + start (producción)
python3 run.py --no-open     # no abrir el navegador
```

Alternativa con npm:

```bash
npm install
npm run dev
```

## Cuentas y acceso (autenticación real)

Hay **dos tipos de cuenta**, cada una con su propio portal y datos privados:

- **Admin** (vos y tus empleados): ve a **todos los clientes** del estudio.
  - Usuario: `admin` · Contraseña: `admin`
  - Portal: `/admin`
- **Cliente** (importadores / exportadores): ve **solo las operaciones de su
  empresa**.
  - Se crean desde `/registro` (cuentas reales).
  - Portal: `/inicio`

Las contraseñas se guardan con hash (scrypt) y la sesión va en una cookie
httpOnly. Cada cuenta es independiente: el cliente nunca ve datos de otro, y
solo el admin accede al panel de administración.

> La base de datos es un archivo local SQLite en `data/app.db`
> (se crea sola al primer arranque y queda fuera de git). La cuenta `admin`
> se crea automáticamente.

## Estructura

- `src/app/login`, `src/app/registro` — ingreso y alta de clientes.
- `src/app/admin` — portal del administrador (lista de clientes).
- `src/app/inicio` — portal del cliente (sus operaciones).
- `src/app/api/auth` — login, registro, logout y sesión.
- `src/lib/db.ts` — base de datos SQLite y esquema.
- `src/lib/auth-server.ts` — sesiones y guardas de servidor.
- `src/components` — marca, barra superior, toggle de tema, tabla de clientes.
- `run.py` — levanta el servidor local.

## Roadmap (MVP Fase 1)

Login · Clientes · Operaciones · Documentos · Seguimiento ·
Comentarios · Checklist documental · Costeo y prefactura manual.
