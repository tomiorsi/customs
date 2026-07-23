"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Pencil, Trash2 } from "lucide-react";

export function OperacionMenu({
  operationId,
  onEditar,
  volverHref = "/inicio/operaciones",
  soloNombre = false,
}: {
  operationId: string;
  onEditar: () => void;
  volverHref?: string;
  /** Modo cliente: sólo "Editar nombre", sin eliminar. */
  soloNombre?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setAbierto(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [abierto]);

  async function eliminar() {
    setError(null);
    setEliminando(true);
    try {
      const res = await fetch(`/api/operaciones/${operationId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "No se pudo eliminar la operación.");
      }
      router.push(volverHref);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error al eliminar la operación.",
      );
      setEliminando(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Opciones de la operación"
        aria-haspopup="menu"
        aria-expanded={abierto}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:border-accent hover:text-accent"
      >
        <Pencil className="h-[18px] w-[18px]" />
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          <button
            type="button"
            onClick={() => {
              setAbierto(false);
              onEditar();
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-2 hover:text-accent"
          >
            <Pencil className="h-4 w-4" />
            {soloNombre ? "Editar nombre" : "Editar"}
          </button>
          {!soloNombre && (
            <>
              <div className="h-px bg-border" />
              <button
                type="button"
                onClick={() => {
                  setAbierto(false);
                  setConfirmar(true);
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </button>
            </>
          )}
        </div>
      )}

      {confirmar &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => !eliminando && setConfirmar(false)}
            className="absolute inset-0 cursor-default bg-black/50 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-500">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  ¿Eliminar esta operación?
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Se borrarán también todos sus documentos. Esta acción no se
                  puede deshacer.
                </p>
              </div>
            </div>

            {error && (
              <p className="mt-3 text-xs font-medium text-red-500">{error}</p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmar(false)}
                disabled={eliminando}
                className="inline-flex items-center rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-foreground disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={eliminar}
                disabled={eliminando}
                className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
              >
                {eliminando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>,
          document.body,
        )}
    </div>
  );
}
