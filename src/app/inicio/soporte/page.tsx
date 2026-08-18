import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { esEquipo } from "@/lib/roles";
import {
  getMensajesSoporte,
  marcarLeidoSoporte,
  purgarHiloInactivo,
} from "@/lib/soporte";
import { SoporteHilo } from "@/components/soporte-hilo";

export const dynamic = "force-dynamic";

export default async function SoporteClientePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (esEquipo(user.role)) redirect("/admin/soporte");

  purgarHiloInactivo(user.id);
  const mensajes = getMensajesSoporte(user.id);
  marcarLeidoSoporte(user.id, "usuario");

  return (
    <main className="mx-auto flex h-[calc(100vh-9rem)] w-full max-w-3xl flex-col">
      <SoporteHilo iniciales={mensajes} />
    </main>
  );
}
