import { redirect } from "next/navigation";
import { ClipboardList, UserCog } from "lucide-react";
import { flagsDeRiesgo, getSolicitudesPendientes } from "@/lib/onboarding";
import { getOperadores } from "@/lib/data";
import { getCurrentUser } from "@/lib/auth-server";
import { SolicitudesAdmin } from "@/components/solicitudes-admin";
import { EquipoAdmin } from "@/components/equipo-admin";

export const dynamic = "force-dynamic";

export default async function EquipoPage() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") redirect("/admin/operaciones");

  const solicitudes = getSolicitudesPendientes().map((s) => ({
    id: s.id,
    email: s.email,
    company_name: s.company_name,
    contact_name: s.contact_name,
    phone: s.phone,
    submitted_at: s.op_submitted_at,
    meeting: s.op_meeting_at,
    solicitud: s.solicitud,
    flags: s.solicitud ? flagsDeRiesgo(s.solicitud) : [],
  }));

  const operadores = getOperadores().map((o) => ({
    id: o.id,
    nombre: o.contact_name,
    username: o.username,
    email: o.email,
  }));

  return (
    <div className="space-y-10">
      <section className="space-y-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent">
            <ClipboardList className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Solicitudes para operar
              </h2>
              {solicitudes.length > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground">
                  {solicitudes.length}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              Pasaron el filtro automático y esperan tu aprobación. Aceptá para
              habilitar la creación de operaciones, o rechazá con un motivo.
            </p>
          </div>
        </div>
        <SolicitudesAdmin solicitudes={solicitudes} />
      </section>

      <section className="space-y-5">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent">
            <UserCog className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Equipo
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              Tus empleados acceden con su usuario para trabajar las
              operaciones. No ven clientes, honorarios ni facturación.
            </p>
          </div>
        </div>
        <EquipoAdmin operadores={operadores} />
      </section>
    </div>
  );
}
