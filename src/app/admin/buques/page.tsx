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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Buques
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Arribos anunciados a puertos argentinos, consolidados desde los cronogramas
          públicos de terminales y autoridades portuarias. Las fechas son estimadas y
          las modifican las líneas marítimas.
        </p>
      </div>

      <BuquesTabla inicial={listado} />
    </div>
  );
}
