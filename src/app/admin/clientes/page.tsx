import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ClientsTable } from "@/components/clients-table";
import { getClients } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function AdminClientesPage() {
  const user = await getCurrentUser();
  if (!esEquipo(user?.role)) redirect("/admin/operaciones");

  const clientes = await getClients();

  return (
    <div className="space-y-6">
      <ClientsTable
        clients={clientes}
        action={
          <Link
            href="/admin/clientes/nuevo"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nuevo cliente</span>
          </Link>
        }
      />
    </div>
  );
}
