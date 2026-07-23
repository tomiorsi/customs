import { redirect } from "next/navigation";

// El panel de administración se eliminó: /admin entra directo a operaciones.
export default function AdminIndex() {
  redirect("/admin/operaciones");
}
