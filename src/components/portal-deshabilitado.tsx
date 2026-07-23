"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Brand } from "@/components/brand";
import { logoutRequest } from "@/lib/auth-client";

const NOMBRE_ESTUDIO =
  process.env.NEXT_PUBLIC_ESTUDIO_NOMBRE?.trim() || "el estudio";

/**
 * Aviso que se muestra al cliente cuando el portal self-service está deshabilitado
 * (modelo de control interno). No borra la cuenta ni los datos: el equipo gestiona
 * las operaciones. Reactivable con PORTAL_CLIENTE_HABILITADO=true.
 */
export function PortalDeshabilitado() {
  const router = useRouter();

  async function salir() {
    await logoutRequest();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Brand size="md" />
      <div className="max-w-md space-y-3">
        <h1 className="text-xl font-semibold text-foreground">
          Portal de clientes no disponible
        </h1>
        <p className="text-sm text-muted">
          Estamos gestionando las operaciones de forma directa desde {NOMBRE_ESTUDIO}.
          Para consultas o para avanzar con tu despacho, contactanos y nuestro equipo
          te atiende personalmente.
        </p>
      </div>
      <button
        type="button"
        onClick={salir}
        className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </button>
    </div>
  );
}
