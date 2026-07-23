import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { ClienteForm } from "@/components/cliente-form";

export const dynamic = "force-dynamic";

export default async function NuevoClientePage() {
  const user = await getCurrentUser();
  // Alta del registro de cliente: admin y operador (subadmin).
  if (!esEquipo(user?.role)) redirect("/admin/operaciones");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Nuevo cliente
        </h1>
        <p className="mt-1 text-sm text-muted">
          Registrá el cliente para poder crear operaciones a su nombre.
        </p>
      </div>
      <ClienteForm />
    </div>
  );
}
