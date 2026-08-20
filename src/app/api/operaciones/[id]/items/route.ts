import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo, alcanceDe } from "@/lib/roles";
import { getOperationById, updateOperationCampos } from "@/lib/data";
import { candidatosDePartida } from "@/lib/clasificador/motor";
import {
  agregarItem,
  escribirItems,
  leerItems,
  ncmPrincipal,
  quitarItem,
  resumenItems,
  type ItemOperacion,
} from "@/lib/items-operacion";

/**
 * Los productos de la carpeta, uno por uno.
 *
 * Existe porque no se sabe de antemano cuántas mercaderías tiene una
 * operación: la proforma casi nunca trae las posiciones y el despachante las
 * va encontrando de a una. Entonces la lista **crece**, en vez de cargarse
 * entera de una vez.
 *
 * `PUT` agrega un producto o completa el que ya estaba con la misma
 * descripción; `DELETE` saca uno. Las dos devuelven la lista completa, para
 * que la pantalla no tenga que volver a pedirla.
 *
 * Solo para el equipo: es la clasificación de la carpeta, no algo que el
 * cliente edite.
 */

/**
 * El texto legal de una posición, buscándola entre las de su partida.
 *
 * Devuelve `null` si no aparece: puede ser una posición que el nomenclador no
 * tiene, y en ese caso es preferible guardar el renglón sin descripción antes
 * que rechazarlo.
 */
async function descripcionDePosicion(ncm: string): Promise<string | null> {
  const digitos = ncm.replace(/\D/g, "");
  if (digitos.length < 8) return null;
  try {
    const hermanas = await candidatosDePartida(digitos.slice(0, 4));
    const propia = hermanas.find((h) =>
      h.codigo.replace(/\D/g, "").startsWith(digitos.slice(0, 11)),
    );
    return propia?.descripcion ?? null;
  } catch {
    return null;
  }
}

async function operacionDe(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !esEquipo(user.role)) {
    return { error: NextResponse.json({ error: "No autorizado." }, { status: 403 }) };
  }
  const { id } = await ctx.params;
  const op = await getOperationById(id, alcanceDe(user));
  if (!op) {
    return { error: NextResponse.json({ error: "Operación no encontrada." }, { status: 404 }) };
  }
  return { op };
}

/**
 * Guarda la lista y mantiene `op.ncm` al día.
 *
 * `ncm` sigue siendo la posición principal de la carpeta —la del primer
 * producto que tenga una— porque la liquidación, la ficha para Malvina y las
 * intervenciones la leen. Mientras haya un solo producto, nada cambia de
 * comportamiento; con varios, apunta al primero y el detalle está en la lista.
 */
async function guardar(opId: string, userId: string, items: ItemOperacion[]) {
  const principal = ncmPrincipal(items);
  const cambios: Parameters<typeof updateOperationCampos>[2] = {
    items_json: escribirItems(items),
  };
  // Solo se toca `ncm` si hay una posición: borrarla porque el primer producto
  // todavía no se clasificó sería perder la que ya estaba puesta.
  if (principal) cambios.ncm = principal;
  await updateOperationCampos(userId, opId, cambios);
  return { items, resumen: resumenItems(items) };
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await operacionDe(req, ctx);
  if ("error" in r) return r.error;
  const { op } = r;

  const body = (await req.json().catch(() => ({}))) as {
    mercaderia?: string;
    ncm?: string;
    codigo?: string;
    marca?: string;
    cantidad?: string;
    unidad?: string;
    valor?: string;
    peso_neto?: string;
  };

  const mercaderia = (body.mercaderia ?? "").trim();
  if (!mercaderia) {
    return NextResponse.json(
      { error: "Sin descripción no se puede identificar el producto." },
      { status: 400 },
    );
  }

  // La posición se guarda con dígitos nada más, como el resto del sistema.
  const ncm = (body.ncm ?? "").replace(/\D/g, "");
  if (ncm && ncm.length < 8) {
    return NextResponse.json(
      { error: "La posición tiene que ser específica: al menos 8 dígitos." },
      { status: 400 },
    );
  }

  const nuevo: ItemOperacion = { mercaderia, fuente: "manual" };
  if (ncm) {
    nuevo.ncm = ncm;
    // Se busca el texto legal una sola vez, acá, y se guarda con el renglón.
    // Que la lista pueda decir QUÉ es cada posición es lo que permite darse
    // cuenta de un error de clasificación mirando, en vez de descubrirlo al
    // final. Si el nomenclador no contesta, el renglón entra igual: sin la
    // descripción se ve peor, pero perder el producto sería peor todavía.
    nuevo.descripcion_ncm = (await descripcionDePosicion(ncm)) ?? undefined;
  }
  for (const k of ["codigo", "marca", "cantidad", "unidad", "valor", "peso_neto"] as const) {
    const v = (body[k] ?? "").trim();
    if (v) nuevo[k] = v;
  }

  const items = agregarItem(leerItems(op.items_json), nuevo);
  return NextResponse.json({ ok: true, ...(await guardar(op.id, op.user_id, items)) });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await operacionDe(req, ctx);
  if ("error" in r) return r.error;
  const { op } = r;

  const orden = Number(new URL(req.url).searchParams.get("orden"));
  if (!Number.isFinite(orden) || orden < 1) {
    return NextResponse.json({ error: "Falta cuál producto sacar." }, { status: 400 });
  }

  const items = quitarItem(leerItems(op.items_json), orden);
  return NextResponse.json({ ok: true, ...(await guardar(op.id, op.user_id, items)) });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const r = await operacionDe(req, ctx);
  if ("error" in r) return r.error;
  const items = leerItems(r.op.items_json);
  return NextResponse.json({ ok: true, items, resumen: resumenItems(items) });
}
