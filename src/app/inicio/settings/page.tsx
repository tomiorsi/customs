import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { SettingsForm } from "@/components/settings-form";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Configuración
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        Actualizá tus datos, tus preferencias de despacho y tu contraseña. Estos
        datos los usamos para estimar tus costos con más precisión.
      </p>

      <SettingsForm user={user} />
    </div>
  );
}
