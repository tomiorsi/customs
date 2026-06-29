import type { Pregunta, Respuesta } from "./tipos";
import { consecuenciaParaOpcion } from "./tipos";
import { normClaveTexto } from "./preguntas-sistema";

/** Primera pregunta del plan (id «1» o primera del array). */
export function primeraDelPlan(plan: Pregunta[]): Pregunta | null {
  if (!plan.length) return null;
  return plan.find((p) => p.id === "1") ?? plan[0]!;
}

/**
 * Tras las respuestas acumuladas, devuelve la siguiente pregunta del plan,
 * `listo` si no hace falta más, o null si el plan está vacío.
 */
export function siguienteEnPlan(
  plan: Pregunta[],
  respuestas: Respuesta[],
): Pregunta | "listo" | null {
  if (!plan.length) return null;
  if (!respuestas.length) return primeraDelPlan(plan);

  let idSiguiente: string | null = plan[0]!.id ?? "1";

  for (const r of respuestas) {
    const p =
      plan.find((x) => x.id === idSiguiente) ??
      plan.find((x) => normClaveTexto(x.pregunta) === normClaveTexto(r.pregunta));
    if (!p) return "listo";

    const cons = consecuenciaParaOpcion(p, r.opcion)?.trim().toLowerCase();
    if (!cons || cons === "listo") return "listo";
    if (cons.startsWith("pregunta:")) {
      idSiguiente = cons.slice("pregunta:".length).trim();
      continue;
    }
    return "listo";
  }

  const next = plan.find((x) => x.id === idSiguiente);
  if (!next) return "listo";
  const ya = respuestas.some(
    (r) => normClaveTexto(r.pregunta) === normClaveTexto(next.pregunta),
  );
  return ya ? "listo" : next;
}

/** Normaliza preguntas del plan (ids, texto libre por defecto). */
export function normalizarPlanPreguntas(preguntas: Pregunta[] | undefined): Pregunta[] {
  if (!preguntas?.length) return [];
  return preguntas.map((p, i) => ({
    ...p,
    id: (p.id ?? String(i + 1)).trim(),
    opciones: p.opciones ?? [],
    permiteTextoLibre: p.permiteTextoLibre !== false,
  }));
}
