import { redirect } from "next/navigation";

/**
 * La mesa de trabajo dejó de ser una página propia: ahora se entra a la mesa de
 * cada operación desde su detalle (botón «Ir al despacho»). Redirigimos a
 * Operaciones para no romper links viejos.
 */
export default function MesaPage() {
  redirect("/admin/operaciones");
}
