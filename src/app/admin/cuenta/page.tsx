import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { CuentaForm } from "@/components/cuenta-form";

export const dynamic = "force-dynamic";

export default async function AdminCuentaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esEquipo(user.role)) redirect("/inicio");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Mi cuenta
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Tus datos de acceso al portal. Los dos cambios piden la contraseña
          actual.
        </p>
      </div>

      <CuentaForm usuarioActual={user.username ?? user.email ?? ""} />
    </div>
  );
}
