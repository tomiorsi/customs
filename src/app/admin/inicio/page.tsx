import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { boletinDelDia } from "@/lib/boletin";
import { ultimasNoticias } from "@/lib/noticias";
import { BoletinInicio } from "@/components/boletin-inicio";

export const dynamic = "force-dynamic";

export default async function AdminInicioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esEquipo(user.role)) redirect("/inicio");

  // Boletín y prensa son fuentes externas independientes: se piden juntas para
  // que la pantalla espere una sola vez.
  const [boletin, prensa] = await Promise.all([boletinDelDia(), ultimasNoticias()]);

  return <BoletinInicio boletin={boletin} prensa={prensa} />;
}
