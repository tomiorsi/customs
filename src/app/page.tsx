import { getCurrentUser } from "@/lib/auth-server";
import { landingPath } from "@/lib/roles";
import { Landing } from "@/components/landing/landing";

/**
 * jyccomex.com.ar es la web pública del estudio, siempre.
 *
 * A quien ya tiene sesión no lo sacamos de acá: la landing es la cara de la
 * empresa y tiene que poder mostrarse a un cliente en cualquier momento. Lo
 * único que cambia es el botón del encabezado, que en vez de "Ingresar" lo
 * lleva directo a su panel.
 */
export default async function Home() {
  const user = await getCurrentUser();
  return <Landing destinoPanel={user ? landingPath(user.role) : null} />;
}
