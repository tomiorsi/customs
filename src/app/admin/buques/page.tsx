import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { historicoBuques, listarBuques } from "@/lib/buques";
import { BuquesTabla } from "@/components/buques-tabla";

export const dynamic = "force-dynamic";

export default async function AdminBuquesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esEquipo(user.role)) redirect("/inicio");

  // El histórico va aparte: son las escalas ya terminadas, que la terminal
  // suele borrar de su lineup y sin este archivo se perderían.
  const [listado, historico] = await Promise.all([
    listarBuques(),
    historicoBuques(),
  ]);

  return <BuquesTabla inicial={listado} historico={historico} />;
}
