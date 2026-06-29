"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import type { EventoRow, OperationRow } from "@/lib/data";
import { estadoDescripcion } from "@/lib/estados";
import { TZ_AR } from "@/lib/fechas";
import { EstadoOperacion } from "@/components/estado-operacion";

function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ_AR,
  });
}

/**
 * Panel de seguimiento estilo CRM: arriba los 5 pasos del pipeline y debajo
 * un timeline con cada evento de la operación, del más nuevo al más viejo.
 */
export function SeguimientoOperacion({
  op,
  eventos,
  modo = "general",
}: {
  op: OperationRow;
  eventos: EventoRow[];
  /**
   * "general": lo mismo que ve el cliente (pipeline simple + timeline público).
   * "empleado": workflow interno protagonista + notas + timeline completo.
   */
  modo?: "general" | "empleado";
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [interno, setInterno] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editableEstado = modo === "empleado";
  // En la vista general mostramos sólo lo que vería el cliente.
  const eventosVisibles = editableEstado
    ? eventos
    : eventos.filter((ev) => !ev.interno);

  const esExpo = op.tipo.toLowerCase().startsWith("exp");
  // Texto de la etapa de recepción (queda como detalle del evento de creación).
  const recepcion = estadoDescripcion("Nueva operación", esExpo);

  async function agregarNota(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setError(null);
    const res = await fetch(`/api/operaciones/${op.id}/eventos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: t, interno }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo agregar la nota.");
      setEnviando(false);
      return;
    }
    setTexto("");
    setEnviando(false);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="neon-top rounded-2xl border border-border glass px-5 py-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            Seguimiento
          </p>
        </div>

        {/* Pipeline simple (no editable): el avance se maneja en la Mesa de trabajo. */}
        <EstadoOperacion
          operationId={op.id}
          estado={op.estado}
          tipo={op.tipo}
          via={op.via}
          medioTransporte={op.medio_transporte}
          editable={false}
          bare
        />

        {/* Caja para sumar una nota manual (sólo el estudio / admin) */}
      {editableEstado && (
        <form onSubmit={agregarNota} className="mt-5">
          <div className="flex items-end gap-2">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) agregarNota(e);
              }}
              rows={2}
              placeholder={
                interno
                  ? "Nota interna (solo la ve el equipo)…"
                  : "Enviá un mensaje al cliente (le llega por mail y aparece en su seguimiento)…"
              }
              className="min-h-[42px] flex-1 resize-y rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent"
            />
            <button
              type="submit"
              disabled={enviando || !texto.trim()}
              aria-label={interno ? "Agregar nota interna" : "Enviar mensaje al cliente"}
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {enviando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={interno}
              onChange={(e) => setInterno(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            Nota interna (no la ve el cliente)
          </label>
          {error && (
            <p className="mt-2 text-xs font-medium text-accent">{error}</p>
          )}
        </form>
      )}

      {/* Timeline: puntos unidos por una línea, el más nuevo arriba */}
      {eventosVisibles.length === 0 ? (
        <p className="mt-5 text-sm text-muted">
          Todavía no hay movimientos en esta operación.
        </p>
      ) : (
        <ul className="mt-5">
          {eventosVisibles.map((ev) => {
            const esCreacion = ev.tipo === "creacion";
            // El primer evento (creación) representa la llegada al estudio.
            const titulo = esCreacion ? "Le llegó al estudio" : ev.titulo;
            // Operaciones nuevas guardan un detalle rico; las viejas guardaban
            // sólo el título, así que en ese caso usamos el texto de recepción.
            const detalle =
              esCreacion && (!ev.detalle || ev.detalle === op.titulo)
                ? recepcion
                : ev.detalle;
            return (
              <li
                key={ev.id}
                className="relative flex gap-3 pb-5 last:pb-0 before:absolute before:left-[3.5px] before:top-2.5 before:h-full before:w-px before:bg-border last:before:hidden"
              >
                <span
                  className={`relative z-10 mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    ev.interno ? "bg-amber-500" : "bg-accent"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-foreground whitespace-pre-wrap break-words">
                    {ev.interno && (
                      <span className="mr-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                        Interna
                      </span>
                    )}
                    {titulo}
                  </p>
                  {detalle && (
                    <p className="mt-0.5 text-xs text-muted whitespace-pre-wrap break-words">
                      {detalle}
                    </p>
                  )}
                  <p className="mt-0.5 text-[10px] text-muted/80">
                    {fechaHora(ev.created_at)}
                    {ev.autor ? ` · ${ev.autor}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        )}
      </div>
    </div>
  );
}
