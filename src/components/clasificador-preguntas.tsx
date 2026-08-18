"use client";

import { Check, Loader2 } from "lucide-react";
import type { Pregunta } from "@/lib/clasificador/tipos";

type Props = {
  preguntas: Pregunta[];
  fasePartida?: boolean;
  sel: Record<string, string>;
  textoLibre: Record<string, string>;
  onSelect: (pregunta: string, opcion: string) => void;
  onTextoLibre: (pregunta: string, texto: string) => void;
  onAfinar: () => void;
  afinando: boolean;
  /** Clases opcionales para el contenedor */
  className?: string;
  /** Tamaño compacto para paneles embebidos */
  compacto?: boolean;
};

export function haySeleccionClasificador(
  preguntas: Pregunta[],
  sel: Record<string, string>,
  textoLibre: Record<string, string>,
): boolean {
  return preguntas.some((q) => {
    if ((textoLibre[q.pregunta] ?? "").trim()) return true;
    return Boolean(sel[q.pregunta]);
  });
}

/**
 * Las preguntas que hace el clasificador cuando le falta un dato para cerrar la
 * posición.
 *
 * Solo opciones, sin campo de texto libre. El texto libre parecía una salida
 * amable —"escribí si ninguna aplica"— pero entra crudo al motor y le mete
 * ruido a un retrieval que ya es sensible: una frase ambigua tira la
 * clasificación a otra rama. Las opciones las arma el propio motor sabiendo qué
 * necesita para desempatar, así que si ninguna encaja el camino correcto es
 * reescribir la descripción del producto, no forzar una respuesta acá.
 */
export function ClasificadorPreguntas({
  preguntas,
  fasePartida = false,
  sel,
  textoLibre,
  onSelect,
  onAfinar,
  afinando,
  className = "",
  compacto = false,
}: Props) {
  if (preguntas.length === 0) return null;

  const haySeleccion = haySeleccionClasificador(preguntas, sel, textoLibre);
  const visibles = preguntas.slice(0, 4);

  return (
    <div
      className={`rounded-xl border border-border bg-surface ${
        compacto ? "p-3" : "p-4 sm:p-5"
      } ${className}`}
    >
      <div className={compacto ? "space-y-4" : "space-y-5"}>
        {visibles.map((q, i) => {
          const maxBotones = q.maxOpcionesBotones ?? 3;
          const opciones = (q.opciones ?? []).slice(0, maxBotones);
          const elegida = sel[q.pregunta];
          return (
            <div key={i}>
              <p
                className={`font-semibold text-foreground ${
                  compacto ? "text-xs leading-snug" : "text-sm leading-snug"
                }`}
              >
                {/* Numerada solo si hay más de una: con una sola, el "1." sobra. */}
                {visibles.length > 1 && (
                  <span className="mr-1.5 font-mono text-orange-700 dark:text-orange-300">
                    {i + 1}.
                  </span>
                )}
                {q.pregunta}
              </p>

              {/* Una opción por renglón y a lo ancho: son frases largas, y
                  puestas en fila se cortaban y costaba compararlas. Apiladas
                  se leen de un barrido. */}
              <div className={compacto ? "mt-2 space-y-1.5" : "mt-2.5 space-y-2"}>
                {opciones.map((op) => {
                  const activo = elegida === op;
                  return (
                    <button
                      key={op}
                      type="button"
                      onClick={() => onSelect(q.pregunta, activo ? "" : op)}
                      aria-pressed={activo}
                      className={`flex w-full items-center gap-2.5 rounded-lg border text-left font-medium transition-all ${
                        compacto ? "px-3 py-2 text-[11px]" : "px-3.5 py-2.5 text-sm"
                      } ${
                        activo
                          ? "border-accent bg-accent-soft text-foreground shadow-sm"
                          : "border-border bg-surface text-foreground hover:border-accent/60 hover:bg-accent-soft/40"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                          activo
                            ? "border-accent bg-accent text-[var(--accent-foreground)]"
                            : "border-border"
                        }`}
                      >
                        {activo && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                      </span>
                      {op}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* El botón cierra el bloque, pegado a la última opción: es el paso
          siguiente de lo que se acaba de elegir, no una acción suelta. */}
      <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={onAfinar}
          disabled={!haySeleccion || afinando}
          className={`inline-flex items-center justify-center gap-2 rounded-lg bg-accent font-semibold text-[var(--accent-foreground)] shadow-sm transition-all hover:opacity-90 disabled:opacity-50 ${
            compacto ? "h-9 w-full px-3 text-xs" : "h-11 px-6 text-sm"
          }`}
        >
          {afinando && <Loader2 className="h-4 w-4 animate-spin" />}
          {fasePartida ? "Continuar clasificación" : "Afinar clasificación"}
        </button>
        {!haySeleccion && !compacto && (
          <p className="text-xs text-foreground/70">
            Elegí una opción para seguir.
          </p>
        )}
      </div>
    </div>
  );
}
