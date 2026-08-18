import { redirect } from "next/navigation";
import { Topbar } from "@/components/topbar";
import { RefrescoCompartido } from "@/components/refresco-compartido";
import { PlanesSuscripcion } from "@/components/planes-suscripcion";
import { getCurrentUser } from "@/lib/auth-server";
import { esDuenoDeEstudio, esEquipo, estudioDe } from "@/lib/roles";
import { facturacionParaUi, suscripcionDeEstudio } from "@/lib/data";
import { estadoSuscripcion, type ClavePlan } from "@/lib/suscripcion";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esEquipo(user.role)) redirect("/inicio");

  // El corte de acceso vive acá, en el layout, para que valga en todo el panel y
  // no haya que acordarse de repetirlo en cada página nueva. Se reemplaza el
  // contenido en vez de redirigir: un redirect desde el layout que envuelve a la
  // propia página de planes entraría en bucle.
  // El admin de la plataforma queda fuera del cobro: es el dueño del producto,
  // no un estudio suscripto. Bloquearlo lo dejaría afuera de su propio panel.
  const esPlataforma = user.role === "admin";
  const estado = estadoSuscripcion(suscripcionDeEstudio(estudioDe(user)) ?? {});
  const vencida = !esPlataforma && estado.estado === "vencida";

  return (
    <div className="min-h-screen">
      {/* Varias personas del estudio comparten la misma cartera: sin esto, cada
          una ve la foto del momento en que abrió la pantalla. */}
      <RefrescoCompartido />
      <Topbar
        user={user}
        diasPrueba={
          !esPlataforma && estado.estado === "trial" ? estado.diasRestantes : null
        }
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {!vencida ? (
          children
        ) : esDuenoDeEstudio(user) ? (
          <PlanesSuscripcion
            estado={estado}
            planActual={(estado.plan?.clave as ClavePlan) ?? null}
            facturacion={facturacionParaUi(estudioDe(user))}
          />
        ) : (
          <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface px-5 py-8 text-center">
            <h1 className="text-lg font-semibold text-foreground">
              La suscripción del estudio venció
            </h1>
            <p className="mt-2 text-sm text-muted">
              Pedile a quien administra el estudio que active un plan. Tus datos
              están intactos y vuelven a estar disponibles apenas se reactive.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
