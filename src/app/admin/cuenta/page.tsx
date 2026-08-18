import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, CreditCard, Palette, UserCog } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-server";
import { esDuenoDeEstudio, esEquipo, estudioDe } from "@/lib/roles";
import {
  facturacionParaUi,
  getEstudios,
  getOperadores,
  suscripcionDeEstudio,
} from "@/lib/data";
import { estadoSuscripcion, precioFormateado } from "@/lib/suscripcion";
import { logoDeEstudio } from "@/lib/logo-estudio";
import { CuentaForm } from "@/components/cuenta-form";
import { DatosEstudioForm } from "@/components/datos-estudio-form";
import { SelectorTema } from "@/components/selector-tema";
import { LogoEstudioForm } from "@/components/logo-estudio-form";
import { EstudiosPlataforma } from "@/components/estudios-plataforma";

export const dynamic = "force-dynamic";

export default async function AdminCuentaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esEquipo(user.role)) redirect("/inicio");

  const dueno = esDuenoDeEstudio(user);
  const estudio = estudioDe(user);
  const estado = estadoSuscripcion(suscripcionDeEstudio(estudio) ?? {});
  const facturacion = facturacionParaUi(estudio);
  const operadores = dueno
    ? getOperadores(estudio).map((o) => ({
        id: o.id,
        nombre: o.contact_name,
        username: o.username,
        email: o.email,
      }))
    : [];

  const resumenPlan =
    estado.estado === "activa"
      ? `${estado.plan?.nombre ?? "Plan activo"} · ${estado.plan ? precioFormateado(estado.plan.precio) + "/mes" : ""}`
      : estado.estado === "trial"
        ? `Prueba gratis · ${estado.diasRestantes} ${estado.diasRestantes === 1 ? "día" : "días"} restantes`
        : "Sin plan activo";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* Apariencia: lo más liviano arriba, no requiere confirmar nada. */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2.5">
          <Palette className="h-4 w-4 shrink-0 text-accent" />
          <div>
            <p className="text-sm font-medium text-foreground">Apariencia</p>
            <p className="text-xs text-muted">
              Se guarda en este dispositivo.
            </p>
          </div>
        </div>
        <SelectorTema />
      </section>

      <CuentaForm usuarioActual={user.username ?? user.email ?? ""} />

      {dueno && (
        <>
          <Link
            href="/admin/suscripcion"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent"
          >
            <span className="flex items-center gap-2.5">
              <CreditCard className="h-4 w-4 shrink-0 text-accent" />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  Plan y suscripción
                </span>
                <span className="block text-xs text-muted">{resumenPlan}</span>
              </span>
            </span>
            <span className="text-xs font-semibold text-accent">Ver planes</span>
          </Link>

          <LogoEstudioForm tieneLogo={Boolean(logoDeEstudio(user))} />

          <DatosEstudioForm
            inicial={{
              nombre: user.company_name ?? "",
              cuit: facturacion.cuit,
              condicionIva: facturacion.condicionIva,
              domicilio: facturacion.domicilio,
            }}
          />

          {/* Cuentas del equipo tiene su propia entrada en el menú: no es
              configuración personal, es administrar quién más entra. */}
          <Link
            href="/admin/equipo"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent"
          >
            <span className="flex items-center gap-2.5">
              <UserCog className="h-4 w-4 shrink-0 text-accent" />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  Cuentas del equipo
                </span>
                <span className="block text-xs text-muted">
                  {operadores.length === 0
                    ? "Todavía trabajás solo"
                    : `${operadores.length} ${operadores.length === 1 ? "persona" : "personas"} además de vos`}
                </span>
              </span>
            </span>
            <span className="text-xs font-semibold text-accent">Administrar</span>
          </Link>
        </>
      )}

      {user.role === "admin" && (
        <section className="space-y-3">
          <div className="flex items-center gap-2.5">
            <Building2 className="h-4 w-4 shrink-0 text-accent" />
            <p className="text-sm font-medium text-foreground">Plataforma</p>
          </div>
          <EstudiosPlataforma estudios={getEstudios()} />
        </section>
      )}
    </div>
  );
}
