import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo, estudioDe } from "@/lib/roles";
import { getClients } from "@/lib/data";
import {
  NuevaOperacionEquipoForm,
  type ClienteOpcion,
} from "@/components/nueva-operacion-equipo-form";

export const dynamic = "force-dynamic";

export default async function NuevaOperacionEquipoPage() {
  const user = await getCurrentUser();
  if (!esEquipo(user?.role)) redirect("/admin/operaciones");

  const clientes = await getClients(estudioDe(user!));
  const opciones: ClienteOpcion[] = clientes.map((c) => ({
    id: c.id,
    company_name: c.company_name,
    email: c.email,
    cuit: c.cuit,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Nueva operación
        </h1>
        <p className="mt-1 text-sm text-muted">
          Creá la operación a nombre de un cliente. Después podés cargar la documentación
          en la mesa de trabajo.
        </p>
      </div>
      <NuevaOperacionEquipoForm clientes={opciones} />
    </div>
  );
}
