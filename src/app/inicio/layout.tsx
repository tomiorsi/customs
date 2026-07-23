import { redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { clienteTienePortal } from "@/lib/portal-cliente";
import { PortalDeshabilitado } from "@/components/portal-deshabilitado";

export default async function InicioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (esEquipo(user.role)) redirect("/admin/operaciones");

  // Acceso por-cliente: el portal solo se muestra a los clientes que el estudio
  // habilitó. El resto ve un aviso (sin redirigir, para no ciclar el login).
  if (!clienteTienePortal(user)) {
    return <PortalDeshabilitado />;
  }

  return (
    <div className="min-h-screen">
      <Topbar user={user} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
