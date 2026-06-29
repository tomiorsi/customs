"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Check,
  Link2,
  Loader2,
  MessageSquare,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { MensajeParticipanteRow, ParticipanteRow } from "@/lib/data";

const MAX_PARTICIPANTES = 3;

function horaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ParticipantesControl({
  operationId,
  participantes: iniciales,
  puedeEliminar = false,
  noLeidos = {},
  chatHabilitado = true,
}: {
  operationId: string;
  participantes: ParticipanteRow[];
  /** El estudio o el dueño de la operación pueden dar de baja un participante. */
  puedeEliminar?: boolean;
  /** Mensajes del tercero sin leer por el estudio, por id de participante. */
  noLeidos?: Record<string, number>;
  /** El chat con el tercero es interno del estudio; el cliente no lo ve. */
  chatHabilitado?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState<ParticipanteRow[]>(iniciales);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Chat por participante.
  const [chatDe, setChatDe] = useState<string | null>(null);
  const [hilos, setHilos] = useState<Record<string, MensajeParticipanteRow[]>>(
    {},
  );
  const [cargandoChat, setCargandoChat] = useState(false);
  const [textoChat, setTextoChat] = useState("");
  const [enviandoChat, setEnviandoChat] = useState(false);
  const [sinLeer, setSinLeer] = useState<Record<string, number>>(noLeidos);
  const [montado, setMontado] = useState(false);
  const chatFinRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMontado(true), []);

  const hayParticipantes = lista.length > 0;
  const totalSinLeer = chatHabilitado
    ? Object.values(sinLeer).reduce((a, b) => a + b, 0)
    : 0;
  const chatPart = chatDe ? lista.find((p) => p.id === chatDe) ?? null : null;
  const chatMsgs = chatDe ? hilos[chatDe] ?? [] : [];

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

  useEffect(() => {
    // Al cerrar el cajón, volvemos a mostrar el botón "Agregar participante".
    if (!abierto) setMostrarForm(false);
  }, [abierto]);

  useEffect(() => {
    if (!chatDe) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setChatDe(null);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [chatDe]);

  useEffect(() => {
    if (chatDe) chatFinRef.current?.scrollIntoView({ block: "nearest" });
  }, [chatDe, chatMsgs.length]);

  function linkDe(token: string): string {
    return `${window.location.origin}/p/${token}`;
  }

  async function copiar(token: string) {
    try {
      await navigator.clipboard.writeText(linkDe(token));
      setCopiado(token);
      setTimeout(() => setCopiado((c) => (c === token ? null : c)), 2000);
    } catch {
      setError("No se pudo copiar. Copialo manualmente.");
    }
  }

  function emailValido(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const n = nombre.trim();
    const m = email.trim();
    if (!n || creando) return;
    if (!m) {
      setError("El email es obligatorio: ahí le mandamos el link.");
      return;
    }
    if (!emailValido(m)) {
      setError("Revisá el email: no parece válido.");
      return;
    }
    setCreando(true);
    setError(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/operaciones/${operationId}/participantes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: n, email: m, rol: rol.trim() }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            participante?: ParticipanteRow;
            error?: string;
            emailEnviado?: boolean;
            emailError?: string | null;
          }
        | null;
      if (!res.ok || !data?.participante) {
        throw new Error(data?.error ?? "No se pudo agregar el participante.");
      }
      setLista((l) => [...l, data.participante!]);
      setNombre("");
      setEmail("");
      setRol("");
      setMostrarForm(false);
      if (data.emailEnviado) {
        setAviso(`Le enviamos el link por email a ${m}.`);
      } else {
        // No se pudo mandar: copiamos el link para pasarlo a mano.
        copiar(data.participante.token);
        setError(
          "Participante agregado, pero no pudimos enviar el email. " +
            "Te copiamos el link para que se lo pases vos.",
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al agregar.");
    } finally {
      setCreando(false);
    }
  }

  async function eliminar(id: string) {
    setEliminando(id);
    setError(null);
    try {
      const res = await fetch(`/api/participantes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "No se pudo eliminar el participante.");
      }
      setLista((l) => l.filter((p) => p.id !== id));
      setConfirmar(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar.");
    } finally {
      setEliminando(null);
    }
  }

  async function abrirChat(id: string) {
    setChatDe(id);
    setAbierto(false);
    setTextoChat("");
    setError(null);
    setCargandoChat(true);
    try {
      const res = await fetch(`/api/participantes/${id}/mensajes`);
      const data = (await res.json().catch(() => null)) as
        | { mensajes?: MensajeParticipanteRow[]; error?: string }
        | null;
      if (!res.ok) throw new Error(data?.error ?? "No se pudo abrir el chat.");
      setHilos((h) => ({ ...h, [id]: data?.mensajes ?? [] }));
      // Al abrir, quedaron leídos del lado del estudio.
      setSinLeer((s) => ({ ...s, [id]: 0 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al abrir el chat.");
    } finally {
      setCargandoChat(false);
    }
  }

  async function enviarChat(
    e: React.FormEvent | React.KeyboardEvent,
    id: string,
  ) {
    e.preventDefault();
    const t = textoChat.trim();
    if (!t || enviandoChat) return;
    setEnviandoChat(true);
    setError(null);
    try {
      const res = await fetch(`/api/participantes/${id}/mensajes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: t }),
      });
      const data = (await res.json().catch(() => null)) as
        | { mensaje?: MensajeParticipanteRow; emailEnviado?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.mensaje) {
        throw new Error(data?.error ?? "No se pudo enviar el mensaje.");
      }
      setHilos((h) => ({ ...h, [id]: [...(h[id] ?? []), data.mensaje!] }));
      setTextoChat("");
      if (data.emailEnviado) {
        setAviso("Le avisamos por email.");
        setTimeout(() => setAviso(null), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al enviar.");
    } finally {
      setEnviandoChat(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent"
      >
        {hayParticipantes ? (
          <Users className="h-[18px] w-[18px]" />
        ) : (
          <UserPlus className="h-[18px] w-[18px]" />
        )}
        <span className="hidden sm:inline">
          {hayParticipantes ? `Participantes (${lista.length})` : "Añadir participante"}
        </span>
        {totalSinLeer > 0 && (
          <span className="ml-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {totalSinLeer}
          </span>
        )}
      </button>

      {abierto && (
        <div
          role="dialog"
          className={`absolute right-0 z-50 mt-2 overflow-hidden rounded-xl border border-border bg-surface shadow-lg ${
            chatHabilitado ? "w-[20rem]" : "w-[28rem] max-w-[92vw]"
          }`}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">
              Participantes
            </p>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="text-muted transition-colors hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[60vh] space-y-3 overflow-auto px-4 py-3">
            {!chatHabilitado && (
              <p className="text-xs text-muted">
                Sumá a un tercero (forwarder, transportista, proveedor) para que
                suba documentos. Le enviamos el link de acceso por email (no
                necesita cuenta) y nosotros nos comunicamos con él. Hasta{" "}
                {MAX_PARTICIPANTES} participantes por operación.
              </p>
            )}

            {lista.length > 0 && (
              <ul className="space-y-2.5">
                {lista.map((p) => {
                  const confirmando = confirmar === p.id;
                  const borrando = eliminando === p.id;
                  return (
                    <li
                      key={p.id}
                      className="rounded-xl border border-border bg-surface-2/40 p-3"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent ring-1 ring-accent/20">
                          {p.nombre.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {p.nombre}
                          </p>
                          {p.email && (
                            <p className="truncate text-[11px] text-muted">
                              {p.email}
                            </p>
                          )}
                          {p.rol && (
                            <p className="mt-1 rounded-md bg-surface px-2 py-1 text-[11px] leading-snug text-foreground/80">
                              {p.rol}
                            </p>
                          )}
                        </div>
                        {puedeEliminar &&
                          (confirmando ? (
                            <span className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => eliminar(p.id)}
                                disabled={borrando}
                                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-red-500 transition-colors hover:text-red-600 disabled:opacity-60"
                              >
                                {borrando && (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                )}
                                Sí
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmar(null)}
                                disabled={borrando}
                                className="rounded-md px-1.5 py-1 text-[11px] font-medium text-muted transition-colors hover:text-foreground disabled:opacity-60"
                              >
                                No
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmar(p.id)}
                              className="inline-flex shrink-0 items-center justify-center rounded-md p-1 text-muted transition-colors hover:text-red-500"
                              title="Eliminar participante"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ))}
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        {chatHabilitado && (
                          <button
                            type="button"
                            onClick={() => abrirChat(p.id)}
                            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-accent/30 bg-accent-soft text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            <MessageSquare className="h-4 w-4" />
                            Chat
                            {(sinLeer[p.id] ?? 0) > 0 && (
                              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold leading-none text-white">
                                {sinLeer[p.id]}
                              </span>
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => copiar(p.token)}
                          className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent ${
                            chatHabilitado ? "shrink-0" : "flex-1"
                          }`}
                          title="Copiar link de acceso"
                        >
                          {copiado === p.token ? (
                            <>
                              <Check className="h-4 w-4" /> Copiado
                            </>
                          ) : (
                            <>
                              <Link2 className="h-4 w-4" /> Link
                            </>
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {lista.length >= MAX_PARTICIPANTES ? (
              <p className="border-t border-border pt-3 text-xs font-medium text-muted">
                Llegaste al máximo de {MAX_PARTICIPANTES} participantes.{" "}
                {puedeEliminar
                  ? "Para sumar otro, primero eliminá a uno."
                  : "Para sumar otro, pedile al estudio que dé de baja uno."}
              </p>
            ) : lista.length > 0 && !mostrarForm ? (
              <button
                type="button"
                onClick={() => {
                  setMostrarForm(true);
                  setError(null);
                }}
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-accent/50 text-sm font-semibold text-accent transition-colors hover:bg-accent-soft/50"
              >
                <UserPlus className="h-4 w-4" /> Agregar participante
              </button>
            ) : (
              <form
                onSubmit={crear}
                className="space-y-2 border-t border-border pt-3"
              >
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre del participante *"
                  className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent"
                />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email *"
                  type="email"
                  required
                  className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent"
                />
                <textarea
                  value={rol}
                  onChange={(e) => setRol(e.target.value)}
                  rows={2}
                  placeholder="Su función / qué le pedimos (ej: forwarder, emite el BL)"
                  className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={creando || !nombre.trim() || !email.trim()}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-accent text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {creando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Enviar link por email
                </button>
                {lista.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setMostrarForm(false);
                      setNombre("");
                      setEmail("");
                      setRol("");
                      setError(null);
                    }}
                    className="inline-flex h-8 w-full items-center justify-center rounded-lg text-xs font-medium text-muted transition-colors hover:text-foreground"
                  >
                    Cancelar
                  </button>
                )}
              </form>
            )}

            {aviso && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                {aviso}
              </p>
            )}
            {error && (
              <p className="text-xs font-medium text-red-500">{error}</p>
            )}
          </div>
        </div>
      )}

      {chatHabilitado &&
        chatPart &&
        montado &&
        createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setChatDe(null)}
        >
          <div
            role="dialog"
            aria-label={`Chat con ${chatPart.nombre}`}
            onClick={(e) => e.stopPropagation()}
            className="flex h-[70vh] max-h-[600px] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2/50 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-base font-semibold text-accent ring-1 ring-accent/20">
                  {chatPart.nombre.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-foreground">
                    {chatPart.nombre}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {chatPart.email ? (
                      <>Le llega por email a {chatPart.email}</>
                    ) : (
                      <>Sin email · pasale el link manualmente</>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setChatDe(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
                aria-label="Cerrar chat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-auto bg-gradient-to-b from-surface to-surface-2/30 px-5 py-5">
              {cargandoChat && chatMsgs.length === 0 ? (
                <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando conversación…
                </p>
              ) : chatMsgs.length > 0 ? (
                chatMsgs.map((m) => {
                  const delEstudio = m.origen === "estudio";
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${
                        delEstudio ? "items-end" : "items-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                          delEstudio
                            ? "rounded-br-md bg-accent text-accent-foreground"
                            : "rounded-bl-md border border-border bg-surface text-foreground"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                      </div>
                      <span className="mt-1 px-1 text-[11px] text-muted">
                        {delEstudio ? m.autor || "Vos" : chatPart.nombre} ·{" "}
                        {horaCorta(m.created_at)}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <MessageSquare className="h-6 w-6" />
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    Todavía no hay mensajes
                  </p>
                  <p className="max-w-xs text-xs text-muted">
                    Escribile para pedirle documentos, coordinar fechas o lo que
                    necesites. Le va a llegar por email y te responde desde acá.
                  </p>
                </div>
              )}
              <div ref={chatFinRef} />
            </div>

            {(error || aviso) && (
              <div className="border-t border-border px-5 py-2">
                {error && (
                  <p className="text-xs font-medium text-red-500">{error}</p>
                )}
                {aviso && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                    {aviso}
                  </p>
                )}
              </div>
            )}

            <form
              onSubmit={(e) => enviarChat(e, chatPart.id)}
              className="flex items-end gap-2 border-t border-border bg-surface-2/50 px-4 py-3"
            >
              <textarea
                value={textoChat}
                onChange={(e) => setTextoChat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviarChat(e, chatPart.id);
                  }
                }}
                rows={1}
                autoFocus
                placeholder="Escribí un mensaje…"
                className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent"
              />
              <button
                type="submit"
                disabled={enviandoChat || !textoChat.trim()}
                aria-label="Enviar mensaje"
                className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {enviandoChat ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            </form>
          </div>
        </div>,
          document.body,
        )}
    </div>
  );
}
