import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { NuevaOperacionForm } from "@/components/nueva-operacion-form";

export const dynamic = "force-dynamic";

export default async function NuevaOperacionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.op_status !== "approved") redirect("/inicio/operaciones");

  return (
    <div className="space-y-6">
      <NuevaOperacionForm />
    </div>
  );
}
