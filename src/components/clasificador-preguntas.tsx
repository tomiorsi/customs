"use client";

import { Loader2 } from "lucide-react";
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

export function ClasificadorPreguntas({
  preguntas,
  fasePartida = false,
  sel,
  textoLibre,
  onSelect,
  onTextoLibre,
  onAfinar,
  afinando,
  className = "",
  compacto = false,
}: Props) {
  if (preguntas.length === 0) return null;

  const haySeleccion = haySeleccionClasificador(preguntas, sel, textoLibre);
  const btnCls = compacto
    ? "inline-flex items-center gap-1.5 rounded-lg border border-accent/40 px-2.5 py-1.5 text-[10px] font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-60"
    : "inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50";
  const chipCls = compacto
    ? "rounded-full border px-2 py-1 text-[10px] font-medium transition-colors"
    : "rounded-full border px-3 py-1 text-left text-xs font-medium transition-colors";

  return (
    <div
      className={`space-y-3 rounded-lg border border-border bg-surface/60 px-3 py-3 ${className}`}
    >
      {preguntas.slice(0, 4).map((q, i) => {
        const maxBotones = q.maxOpcionesBotones ?? 3;
        const opcionesVisibles = (q.opciones ?? []).slice(0, maxBotones);
        const etiquetaLibre =
          q.etiquetaTextoLibre?.trim() || "Otra respuesta (texto libre)";
        const libre = textoLibre[q.pregunta] ?? "";
        return (
          <div key={i} className="space-y-1.5">
            <p
              className={
                compacto
                  ? "text-[11px] font-medium text-foreground"
                  : "text-xs leading-snug text-foreground"
              }
            >
              {q.pregunta}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {opcionesVisibles.map((op) => {
                const activo = sel[q.pregunta] === op && !libre.trim();
                return (
                  <button
                    key={op}
                    type="button"
                    onClick={() => {
                      onTextoLibre(q.pregunta, "");
                      onSelect(q.pregunta, op);
                    }}
                    className={`${chipCls} ${
                      activo
                        ? "border-accent bg-accent text-[var(--accent-foreground)]"
                        : "border-border bg-surface text-muted hover:border-accent/50"
                    }`}
                  >
                    {op}
                  </button>
                );
              })}
            </div>
            {q.permiteTextoLibre !== false && (
              <div className="mt-1 space-y-1">
                <label className="text-[10px] font-medium text-muted">
                  {etiquetaLibre}
                </label>
                <input
                  type="text"
                  className={`w-full rounded-lg border border-border bg-surface px-3 text-foreground outline-none focus:border-accent ${
                    compacto ? "h-8 text-[11px]" : "h-9 text-xs"
                  }`}
                  value={libre}
                  onChange={(e) => {
                    onTextoLibre(q.pregunta, e.target.value);
                    if (e.target.value.trim()) onSelect(q.pregunta, "");
                  }}
                  placeholder="Escribí acá si ninguna opción aplica"
                />
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAfinar}
        disabled={!haySeleccion || afinando}
        className={compacto ? `${btnCls} w-full justify-center` : btnCls}
      >
        {afinando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {fasePartida ? "Continuar clasificación" : "Afinar clasificación"}
      </button>
    </div>
  );
}
