import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { clientesParaCotizar } from "@/lib/data";
import { CotizadorAdmin } from "@/components/cotizador-admin";

export const dynamic = "force-dynamic";

export default async function AdminCotizadorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esEquipo(user.role)) redirect("/inicio");

  const clientes = clientesParaCotizar();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Calculadora
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Importación y exportación: clasificá el producto y estimá tributos, gastos
          y costo final. Al clasificar se muestran las intervenciones de terceros
          organismos que registra VUCE para la posición.
        </p>
      </div>

      <CotizadorAdmin clientes={clientes} />
    </div>
  );
}
