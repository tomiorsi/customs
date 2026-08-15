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

  return <CotizadorAdmin clientes={clientes} />;
}
