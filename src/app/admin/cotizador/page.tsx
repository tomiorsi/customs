import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { CotizadorImportacion } from "@/components/cotizador-importacion";

export const dynamic = "force-dynamic";

export default async function AdminCotizadorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esEquipo(user.role)) redirect("/inicio");

  // Arranca en responsable inscripto porque es el caso más común, pero es solo
  // el valor inicial: la condición del importador se elige dentro, en «Perfil
  // del importador». No es un dato del despachante que cotiza.
  return <CotizadorImportacion ivaCondition="Responsable Inscripto" />;
}
