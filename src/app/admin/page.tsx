import { redirect } from "next/navigation";

// /admin entra al inicio del equipo: la normativa del día antes que la lista.
export default function AdminIndex() {
  redirect("/admin/inicio");
}
