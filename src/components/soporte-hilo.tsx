"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Headset, Send } from "lucide-react";

export type MensajeSoporte = {
  id: string;
  origen: "usuario" | "soporte" | "bot";
  autor: string | null;
  texto: string;
  created_at: string;
};

/**
 * Chat de soporte, con la gramática de una app de mensajería: burbujas con
 * cola, agrupadas por día, hora dentro de la burbuja y el compositor pegado
 * abajo. La forma ya es familiar, así que nadie tiene que aprender a usarla.
 *
 * El fondo lleva una trama sutil en vez de un panel liso: separa la
 * conversación del resto del panel sin agregar bordes.
 */
export function SoporteHilo({ iniciales }: { iniciales: MensajeSoporte[] }) {
  const [mensajes, setMensajes] = useState<MensajeSoporte[]>(iniciales);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [mensajes, enviando]);

  const refrescar = useCallback(async () => {
    const res = await fetch("/api/soporte", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    if (data?.mensajes) setMensajes(data.mensajes);
  }, []);

  useEffect(() => {
    const t = setInterval(refrescar, 20000);
    return () => clearInterval(t);
  }, [refrescar]);

  async function enviar(e?: React.FormEvent) {
    e?.preventDefault();
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    setError(null);
    setTexto("");
    if (areaRef.current) areaRef.current.style.height = "auto";

    // El mensaje aparece al instante: el bot puede tardar un segundo y el chat
    // no puede quedarse mudo mientras tanto.
    const provisorio: MensajeSoporte = {
      id: `pendiente-${Date.now()}`,
      origen: "usuario",
      autor: null,
      texto: limpio,
      created_at: new Date().toISOString(),
    };
    setMensajes((m) => [...m, provisorio]);

    const res = await fetch("/api/soporte", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: limpio }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMensajes((m) => m.filter((x) => x.id !== provisorio.id));
      setTexto(limpio);
      setError(data.error ?? "No se pudo enviar el mensaje.");
      setEnviando(false);
      return;
    }
    setMensajes(data.mensajes ?? []);
    setEnviando(false);
  }

  const grupos = agruparPorDia(mensajes);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      {/* Cabecera */}
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft">
          <Headset className="h-4.5 w-4.5 text-accent" />
        </span>
        <span>
          <span className="block text-sm font-semibold text-foreground">Soporte</span>
          <span className="block text-xs text-muted">
            Respondemos al toque · 24/7
          </span>
        </span>
      </header>

      {/* Conversación */}
      <div
        className="chat-trama flex-1 space-y-1 overflow-y-auto px-3 py-4 sm:px-5"
        role="log"
        aria-label="Conversación con soporte"
      >
        {/* Saludo de apertura. Es una burbuja como cualquier otra para que el
            chat nunca arranque vacío, pero no se guarda: no es parte de la
            consulta y no tiene por qué aparecer en la bandeja ni en el mail. */}
        {mensajes.length === 0 && (
          <div className="mb-2 flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-border bg-surface px-3 py-2 text-sm shadow-sm sm:max-w-[72%]">
              <p className="leading-relaxed text-foreground">
                ¡Hola! ¿En qué te podemos ayudar?
              </p>
            </div>
          </div>
        )}

        {grupos.map(([dia, delDia]) => (
          <div key={dia} className="space-y-1">
            <p className="sticky top-0 z-10 mx-auto my-3 w-fit rounded-full bg-surface-2/90 px-3 py-1 text-[11px] font-medium text-muted shadow-sm backdrop-blur">
              {dia}
            </p>

            {delDia.map((m, i) => {
              const propio = m.origen === "usuario";
              // Solo la última burbuja de una tanda lleva cola: encadenadas se
              // leen como un bloque, como en cualquier app de mensajería.
              const ultimaDeTanda = delDia[i + 1]?.origen !== m.origen;
              return (
                <div
                  key={m.id}
                  className={`flex ${propio ? "justify-end" : "justify-start"} ${
                    ultimaDeTanda ? "mb-2" : "mb-0.5"
                  }`}
                >
                  <div
                    className={`relative max-w-[85%] px-3 py-2 text-sm shadow-sm sm:max-w-[72%] ${
                      propio
                        ? "rounded-2xl bg-accent text-accent-foreground"
                        : "rounded-2xl border border-border bg-surface text-foreground"
                    } ${ultimaDeTanda ? (propio ? "rounded-br-md" : "rounded-bl-md") : ""}`}
                  >
                    <p className="whitespace-pre-wrap break-words leading-relaxed">
                      {m.texto}
                    </p>
                    <span
                      className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                        propio ? "text-accent-foreground/70" : "text-muted"
                      }`}
                    >
                      {hora(m.created_at)}
                      {propio &&
                        (m.id.startsWith("pendiente-") ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <CheckCheck className="h-3 w-3" />
                        ))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {enviando && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 shadow-sm">
              <span className="sr-only">Soporte está escribiendo</span>
              <span className="flex gap-1" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="chat-punto h-1.5 w-1.5 rounded-full bg-muted"
                    style={{ animationDelay: `${i * 0.16}s` }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}

        <div ref={finRef} />
      </div>

      {/* Compositor */}
      <div className="border-t border-border bg-surface px-3 py-3 sm:px-4">
        {error && (
          <p className="mb-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-xs font-medium text-accent">
            {error}
          </p>
        )}
        <form onSubmit={enviar} className="flex items-end gap-2">
          <label htmlFor="soporte-texto" className="sr-only">
            Escribí tu consulta
          </label>
          <textarea
            id="soporte-texto"
            ref={areaRef}
            rows={1}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              // Crece con el texto hasta un tope, como cualquier compositor.
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
            placeholder="Escribí un mensaje…"
            className="max-h-[140px] min-h-[44px] flex-1 resize-none rounded-2xl border border-border bg-surface-2/40 px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
          <button
            type="submit"
            disabled={!texto.trim()}
            aria-label="Enviar mensaje"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-all hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:scale-95 disabled:opacity-40"
          >
            <Send className="h-4.5 w-4.5" />
          </button>
        </form>
      </div>
    </div>
  );
}

/** Agrupa por día para poder poner el separador de fecha. */
function agruparPorDia(mensajes: MensajeSoporte[]): [string, MensajeSoporte[]][] {
  const grupos = new Map<string, MensajeSoporte[]>();
  for (const m of mensajes) {
    const clave = etiquetaDia(m.created_at);
    const lista = grupos.get(clave);
    if (lista) lista.push(m);
    else grupos.set(clave, [m]);
  }
  return [...grupos.entries()];
}

/** SQLite guarda 'YYYY-MM-DD HH:MM:SS' en UTC, sin zona explícita. */
function aFecha(iso: string): Date {
  return new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
}

function etiquetaDia(iso: string): string {
  const d = aFecha(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  const mismoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mismoDia(d, hoy)) return "Hoy";
  if (mismoDia(d, ayer)) return "Ayer";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "long" });
}

function hora(iso: string): string {
  const d = aFecha(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}
