import { redirect } from "next/navigation";

// El tablero de inicio del cliente se sacó: /inicio entra directo a operaciones.
export default function InicioIndex() {
  redirect("/inicio/operaciones");
}
