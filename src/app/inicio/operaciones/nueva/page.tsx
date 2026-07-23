import { redirect } from "next/navigation";

// Control interno: los clientes ya no crean operaciones; las carga el estudio.
export default function NuevaOperacionPage() {
  redirect("/inicio/operaciones");
}
