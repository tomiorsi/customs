import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { getClienteById } from "@/lib/data";
import { ClienteForm } from "@/components/cliente-form";

export const dynamic = "force-dynamic";

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  // Modificar el registro de cliente: admin y operador (subadmin).
  if (!esEquipo(user?.role)) redirect("/admin/operaciones");

  const { id } = await params;
  const cliente = getClienteById(id);
  if (!cliente) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Editar cliente
        </h1>
        <p className="mt-1 text-sm text-muted">
          Actualizá los datos del cliente (contacto, teléfono, email, etc.).
        </p>
      </div>
      <ClienteForm cliente={cliente} />
    </div>
  );
}
