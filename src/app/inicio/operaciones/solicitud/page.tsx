import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { SolicitudForm } from "@/components/solicitud-form";

export const dynamic = "force-dynamic";

export default async function SolicitudPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.op_status === "approved") redirect("/inicio/operaciones");

  return (
    <SolicitudForm
      estadoInicial={(user.op_status ?? "none") as "none" | "submitted" | "rejected"}
      tieneSlot={Boolean(user.op_meeting_at)}
      defaults={{
        razonSocial: user.company_name ?? "",
        cuit: user.cuit ?? "",
      }}
    />
  );
}
