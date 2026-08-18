"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Send } from "lucide-react";
import type { MensajeSoporte } from "@/components/soporte-hilo";

/**
 * Lado equipo del chat de soporte: mismo hilo, pero respondiendo por una cuenta
 * ajena. Va contra `/api/admin/soporte`, que exige rol de plataforma.
 */
export function SoporteRespuesta({
  cuentaId,
  iniciales,
}: {
  cuentaId: string;
  iniciales: MensajeSoporte[];
}) {
  const [mensajes, setMensajes] = useState<MensajeSoporte[]>(iniciales);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes]);

  const refrescar = useCallback(async () => {
    const res = await fetch(`/api/admin/soporte?cuenta=${encodeURIComponent(cuentaId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    if (data?.mensajes) setMensajes(data.mensajes);
  }, [cuentaId]);

  useEffect(() => {
    const t = setInterval(refrescar, 20000);
    return () => clearInterval(t);
  }, [refrescar]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    setError(null);
    const res = await fetch("/api/admin/soporte", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cuentaId, texto: limpio }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo enviar.");
      setEnviando(false);
      return;
    }
    setMensajes(data.mensajes ?? []);
    setTexto("");
    setEnviando(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-border bg-surface p-4"
        role="log"
        aria-label="Conversación de soporte"
      >
        {mensajes.map((m) => {
          // Acá el "propio" es el equipo: se invierte respecto de la vista del usuario.
          const propio = m.origen !== "usuario";
          return (
            <div key={m.id} className={`flex ${propio ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                  propio
                    ? "bg-accent text-accent-foreground"
                    : "border border-border bg-background text-foreground"
                }`}
              >
                {m.origen === "bot" && (
                  <p className="mb-0.5 flex items-center gap-1.5 text-xs font-medium opacity-70">
                    <Bot className="h-3.5 w-3.5" />
                    Respuesta automática
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words text-sm">{m.texto}</p>
                <p className="mt-1 text-[11px] opacity-60">{formatoFecha(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>

      {error && (
        <p className="mt-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
          {error}
        </p>
      )}

      <form onSubmit={enviar} className="mt-3 flex items-end gap-2">
        <label htmlFor="resp-soporte" className="sr-only">
          Escribí la respuesta
        </label>
        <textarea
          id="resp-soporte"
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar(e as unknown as React.FormEvent);
            }
          }}
          placeholder="Escribí la respuesta…"
          className="min-h-[44px] flex-1 resize-y rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        />
        <button
          type="submit"
          disabled={enviando || !texto.trim()}
          className="inline-flex h-[44px] items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">{enviando ? "Enviando…" : "Responder"}</span>
        </button>
      </form>
    </div>
  );
}

function formatoFecha(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
