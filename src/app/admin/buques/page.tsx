import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { listarBuques } from "@/lib/buques";
import { BuquesTabla } from "@/components/buques-tabla";

export const dynamic = "force-dynamic";

export default async function AdminBuquesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esEquipo(user.role)) redirect("/inicio");

  const listado = await listarBuques();

  return <BuquesTabla inicial={listado} />;
}
