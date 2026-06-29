import { redirect } from "next/navigation";
import { ClientsTable } from "@/components/clients-table";
import { getClients } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function AdminClientesPage() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") redirect("/admin/operaciones");

  const clientes = await getClients();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Clientes
        </h1>
      </div>

      <ClientsTable clients={clientes} />
    </div>
  );
}
