import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import { CotizadorImportacion } from "@/components/cotizador-importacion";

export const dynamic = "force-dynamic";

export default async function AdminCotizadorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esEquipo(user.role)) redirect("/inicio");

  // Sin selector de cliente: se cotiza como responsable inscripto sin
  // certificado de exención, que es el caso más común y el más conservador.
  return <CotizadorImportacion ivaCondition="responsable_inscripto" />;
}
