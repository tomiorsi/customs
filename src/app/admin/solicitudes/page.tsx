import { redirect } from "next/navigation";

// Solicitudes y equipo se unificaron en una sola sección del panel admin.
export default function SolicitudesPage() {
  redirect("/admin/equipo");
}
