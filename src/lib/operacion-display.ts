import type { OperationRow } from "./data";

/** Nombre visible de la operación: lo que eligió el cliente al crearla, no la mercadería. */
export function nombreOperacion(
  op: Pick<OperationRow, "titulo" | "ref">,
): string {
  const titulo = (op.titulo ?? "").trim();
  if (titulo) return titulo;
  const ref = (op.ref ?? "").trim();
  if (ref) return ref;
  return "Operación sin título";
}
