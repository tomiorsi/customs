import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { esDuenoDeEstudio, esEquipo, estudioDe } from "@/lib/roles";
import { facturacionParaUi, suscripcionDeEstudio } from "@/lib/data";
import { estadoSuscripcion, type ClavePlan } from "@/lib/suscripcion";
import { PlanesSuscripcion } from "@/components/planes-suscripcion";

export const dynamic = "force-dynamic";

export default async function SuscripcionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esEquipo(user.role)) redirect("/inicio");

  const cuenta = suscripcionDeEstudio(estudioDe(user));
  const estado = estadoSuscripcion(cuenta ?? {});

  // Un empleado no contrata por el estudio: si la suscripción venció, no puede
  // hacer nada más que avisarle a su jefe.
  if (!esDuenoDeEstudio(user)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface px-5 py-8 text-center">
        <h1 className="text-lg font-semibold text-foreground">
          {estado.estado === "vencida"
            ? "La suscripción del estudio venció"
            : "Suscripción del estudio"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {estado.estado === "vencida"
            ? "Pedile a quien administra el estudio que active un plan para volver a entrar."
            : "La gestiona quien administra el estudio."}
        </p>
      </div>
    );
  }

  return (
    <PlanesSuscripcion
      estado={estado}
      planActual={(estado.plan?.clave as ClavePlan) ?? null}
      facturacion={facturacionParaUi(estudioDe(user))}
    />
  );
}
