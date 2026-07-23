import { redirect } from "next/navigation";
import { getClients, getOperadores } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth-server";
import { EquipoAdmin } from "@/components/equipo-admin";

export const dynamic = "force-dynamic";

export default async function EquipoPage() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") redirect("/admin/operaciones");

  const operadores = getOperadores().map((o) => ({
    id: o.id,
    nombre: o.contact_name,
    username: o.username,
    email: o.email,
  }));

  const clientes = (await getClients()).map((c) => ({
    id: c.id,
    company_name: c.company_name,
    email: c.email,
    cuit: c.cuit,
    tieneAcceso: c.portal_habilitado === "1",
  }));

  return (
    <div className="space-y-10">
      <section className="space-y-5">
        <EquipoAdmin operadores={operadores} clientes={clientes} />
      </section>
    </div>
  );
}
