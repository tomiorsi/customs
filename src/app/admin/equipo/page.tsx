import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";
import { esDuenoDeEstudio, esEquipo, estudioDe } from "@/lib/roles";
import { getOperadores } from "@/lib/data";
import { EquipoAdmin } from "@/components/equipo-admin";

export const dynamic = "force-dynamic";

/**
 * Cuentas del equipo.
 *
 * Sección propia del menú de la cuenta, al lado de «Mi cuenta» y «Plan y
 * suscripción». Estaba embebida dentro de Mi cuenta, pero no es configuración
 * personal: es administrar quién más entra al estudio, y se consulta con otra
 * frecuencia y por otro motivo.
 *
 * Solo el dueño del estudio: un empleado no puede darse de alta compañeros ni
 * quitarse a sí mismo.
 */
export default async function EquipoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!esEquipo(user.role)) redirect("/inicio");
  if (!esDuenoDeEstudio(user)) redirect("/admin/cuenta");

  const operadores = getOperadores(estudioDe(user)).map((o) => ({
    id: o.id,
    nombre: o.contact_name,
    username: o.username,
    email: o.email,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Cuentas del equipo
        </h1>
        <p className="mt-1 text-sm text-muted">
          Cada persona del estudio entra con su usuario. Todos ven la misma
          cartera de clientes y las mismas operaciones.
        </p>
      </div>

      <EquipoAdmin operadores={operadores} />
    </div>
  );
}
