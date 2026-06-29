import { notFound, redirect } from "next/navigation";
import { getAllOperations } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { nombreOperacion } from "@/lib/operacion-display";
import { MesaTrabajo, type MesaOp } from "@/components/mesa-trabajo";

export const dynamic = "force-dynamic";

/**
 * Mesa de trabajo de UNA operación. Es la única forma de entrar a la mesa: se
 * accede desde el detalle de la operación (botón «Ir al despacho»). No hay
 * buscador ni lista: se abre directo esa operación.
 */
export default async function MesaOperacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !esEquipo(user.role)) redirect("/login");

  const { id } = await params;
  const ops = await getAllOperations();
  const op = ops.find((o) => o.id === id);
  if (!op) notFound();

  const item: MesaOp = {
    id: op.id,
    ref: op.ref,
    titulo: nombreOperacion(op),
    tipo: op.tipo,
    via: op.via,
    incoterm: op.incoterm,
    liberacion: op.liberacion_doc,
    formaPago: op.forma_pago,
    fechaFactura: op.fecha_factura,
    plazoPagoDias: op.plazo_pago_dias,
    fechaVencimientoPago: op.fecha_vencimiento_pago,
    paisAdquisicion: op.pais_adquisicion,
    paisOrigen: op.pais_origen,
    cliente: op.company_name ?? op.client_email ?? "—",
    etapa: op.etapa,
    estado: op.estado,
    checklist: op.checklist,
    docs: op.docs,
    ncm: op.ncm,
    eta: op.eta,
    mercaderia: op.mercaderia,
    primeraVez: op.primera_vez,
    hallazgosIA: op.hallazgos_ia,
    validacionIA: op.validacion_ia,
  };

  return (
    <div className="space-y-4">
      <MesaTrabajo
        items={[item]}
        solo
        volverHref={`/admin/operaciones/${op.id}`}
      />
    </div>
  );
}
