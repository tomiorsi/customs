"use client";

import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { ESTADOS, estadoDescripcion, estadoIndex } from "@/lib/estados";
import { iconoVia } from "@/lib/via-ui";

export function EstadoOperacion({
  operationId,
  estado,
  tipo,
  via,
  medioTransporte,
  editable = false,
  bare = false,
}: {
  operationId: string;
  estado: string | null;
  tipo?: string;
  via?: string | null;
  /** Respaldo si `via` no está persistida (p. ej. operaciones viejas). */
  medioTransporte?: string | null;
  editable?: boolean;
  /** Si es true, renderiza sólo los pasos (sin tarjeta, encabezado ni descripción). */
  bare?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const actual = estadoIndex(estado);
  const esExpo = (tipo ?? "").toLowerCase().startsWith("exp");
  const VehiculoVia = iconoVia(via, medioTransporte);

  const pendienteDef = ESTADOS.find((e) => e.value === pendiente);

  function abrirCambio(value: string) {
    if (loading) return;
    setError(null);
    setNota("");
    setPendiente(value);
  }

  async function confirmarCambio() {
    if (!pendiente || loading) return;
    setError(null);
    setLoading(pendiente);
    const res = await fetch(`/api/operaciones/${operationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: pendiente, nota: nota.trim() || undefined }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo actualizar el estado.");
      setLoading(null);
      return;
    }
    setLoading(null);
    setPendiente(null);
    setNota("");
    router.refresh();
  }

  const pasos = (
    <div className="flex items-start">
      {ESTADOS.map((e, i) => {
          const done = i < actual;
          const current = i === actual;
          const active = i <= actual;
          const cargando = loading === e.value;

          const dot = (
            <span
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                active
                  ? "bg-gradient-to-br from-accent to-[#fb923c] text-accent-foreground shadow-[0_6px_16px_-6px_var(--ring)]"
                  : "border border-border bg-surface text-muted"
              } ${current ? "ring-2 ring-[var(--ring)]" : ""} ${
                cargando ? "opacity-60" : ""
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
          );

          return (
            <Fragment key={e.value}>
              <div className="relative flex flex-1 flex-col items-center text-center">
                {i > 0 && (
                  <span
                    className={`absolute right-1/2 top-4 h-0.5 w-full ${
                      i <= actual ? "bg-accent" : "bg-border"
                    }`}
                  />
                )}
                {i === actual + 1 && (
                  <span className="animate-avanzar pointer-events-none absolute top-4 z-20 -translate-x-1/2 -translate-y-1/2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-muted">
                      <VehiculoVia className="h-3.5 w-3.5" />
                    </span>
                  </span>
                )}
                {editable ? (
                  <button
                    type="button"
                    onClick={() => abrirCambio(e.value)}
                    disabled={!!loading}
                    aria-label={`Marcar como ${e.label}`}
                    className="rounded-full transition-transform hover:scale-105 disabled:cursor-not-allowed"
                  >
                    {dot}
                  </button>
                ) : (
                  dot
                )}
                <span
                  className={`mt-2 text-[11px] leading-tight ${
                    current
                      ? "font-semibold text-foreground"
                      : active
                        ? "text-foreground"
                        : "text-muted"
                  }`}
                >
                  {e.label}
                </span>
              </div>
            </Fragment>
          );
        })}
    </div>
  );

  const modal =
    pendiente && mounted
      ? createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => !loading && setPendiente(null)}
              className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
            />
            <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl">
              <p className="text-sm font-semibold text-foreground">
                Cambiar etapa a{" "}
                <span className="text-accent">
                  &laquo;{pendienteDef?.label}&raquo;
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Sumá una nota para el cliente (opcional). Se guarda junto con el
                cambio de etapa en el seguimiento.
              </p>

              <textarea
                autoFocus
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={3}
                placeholder="Ej.: Recibimos la documentación, avanzamos con la declaración."
                className="mt-3 min-h-[80px] w-full resize-y rounded-xl border border-border bg-surface-2/40 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent"
              />

              {error && (
                <p className="mt-2 text-xs font-medium text-accent">{error}</p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendiente(null)}
                  disabled={!!loading}
                  className="inline-flex items-center rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-foreground disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarCambio}
                  disabled={!!loading}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  {nota.trim() ? "Cambiar y guardar nota" : "Cambiar etapa"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  if (bare) {
    return (
      <div>
        {pasos}
        {error && !pendiente && (
          <p className="mt-3 text-xs font-medium text-accent">{error}</p>
        )}
        {modal}
      </div>
    );
  }

  return (
    <div className="neon-top rounded-2xl border border-border glass px-5 py-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
          Seguimiento
        </p>
        {editable && (
          <span className="rounded-full border border-border bg-surface-2/60 px-3 py-1 text-[11px] font-medium text-muted">
            Tocá una etapa para marcarla
          </span>
        )}
      </div>

      {pasos}

      <p className="mt-5 max-w-prose text-sm text-muted">
        {estadoDescripcion(estado, esExpo)}
      </p>

      {error && !pendiente && (
        <p className="mt-3 text-xs font-medium text-accent">{error}</p>
      )}
      {modal}
    </div>
  );
}
