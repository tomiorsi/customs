"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  FileText,
  Loader2,
  MessageSquare,
  Send,
  Upload,
  X,
} from "lucide-react";
import { docLabelEn } from "@/lib/docs";
import type { DocumentRow, MensajeParticipanteRow } from "@/lib/data";

function horaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ParticipantePanel({
  token,
  via,
  docs,
  mensajes,
}: {
  token: string;
  tipo: string;
  via: string | null;
  docs: DocumentRow[];
  mensajes: MensajeParticipanteRow[];
}) {
  const router = useRouter();

  // Documentos (columna izquierda).
  const [archivos, setArchivos] = useState<File[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [errorDoc, setErrorDoc] = useState<string | null>(null);
  const [okDoc, setOkDoc] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Chat (columna derecha).
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorChat, setErrorChat] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "nearest" });
  }, [mensajes.length]);

  function agregarArchivos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setOkDoc(false);
    setErrorDoc(null);
    setArchivos((prev) => [...prev, ...Array.from(files)]);
  }

  function quitarArchivo(idx: number) {
    setArchivos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function subirDocumentos() {
    if (subiendo || archivos.length === 0) return;
    setSubiendo(true);
    setErrorDoc(null);
    setOkDoc(false);
    try {
      for (const file of archivos) {
        const fd = new FormData();
        fd.append("docType", "auto");
        fd.append("file", file);
        const res = await fetch(`/api/p/${token}/documentos`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(data?.error ?? `Couldn't upload "${file.name}".`);
        }
      }
      setArchivos([]);
      setOkDoc(true);
      setTimeout(() => setOkDoc(false), 5000);
      router.refresh();
    } catch (err) {
      setErrorDoc(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubiendo(false);
    }
  }

  async function enviarMensaje(e: React.FormEvent | React.KeyboardEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setErrorChat(null);
    try {
      const res = await fetch(`/api/p/${token}/mensaje`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: t }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Couldn't send your message.");
      }
      setTexto("");
      router.refresh();
    } catch (err) {
      setErrorChat(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-5">
      {/* Columna izquierda: documentos (~1/4, se apila si no hay espacio) */}
      <div className="min-w-[150px] flex-1 space-y-4">
        <div className="rounded-xl border border-dashed border-accent/40 bg-surface-2/40 px-4 py-5">
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              agregarArchivos(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-accent/50 px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:border-accent hover:bg-accent-soft/50"
          >
            <Upload className="h-4 w-4" />
            Upload documents
          </button>
          <p className="mt-2 text-center text-[11px] text-muted">
            Any file type. You can add several.
          </p>

          {archivos.length > 0 && (
            <>
              <ul className="mt-4 space-y-1.5">
                {archivos.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted" />
                    <span
                      className="min-w-0 flex-1 truncate text-xs text-foreground"
                      title={f.name}
                    >
                      {f.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => quitarArchivo(i)}
                      disabled={subiendo}
                      className="shrink-0 text-muted transition-colors hover:text-red-500 disabled:opacity-50"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={subirDocumentos}
                disabled={subiendo}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {subiendo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Send {archivos.length} file{archivos.length > 1 ? "s" : ""}
              </button>
            </>
          )}

          {okDoc && (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              Sent. You can upload more anytime.
            </p>
          )}
          {errorDoc && (
            <p className="mt-3 text-xs font-medium text-red-500">{errorDoc}</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface-2/40 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Documents on file
          </p>
          {docs.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {docs.map((doc) => (
                <li key={doc.id} className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">
                      {docLabelEn(doc.doc_type, via)}
                    </p>
                    <p
                      className="flex items-center gap-1 truncate text-[11px] text-muted"
                      title={doc.file_name}
                    >
                      <FileText className="h-3 w-3 shrink-0" />
                      <span className="truncate">{doc.file_name}</span>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted">
              Nothing uploaded yet. Use the button above to send your documents.
            </p>
          )}
        </div>
      </div>

      {/* Columna derecha: chat (~3/4, se apila si no hay espacio) */}
      <div className="flex h-[520px] max-h-[70vh] min-w-[280px] flex-[3] flex-col overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border bg-surface-2/50 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent">
            <MessageSquare className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Chat</p>
            <p className="truncate text-[11px] text-muted">
              Anything you need to tell us, write it here.
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-auto bg-gradient-to-b from-surface to-surface-2/30 px-4 py-4">
          {mensajes.length > 0 ? (
            mensajes.map((m) => {
              const mio = m.origen === "participante";
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${mio ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                      mio
                        ? "rounded-br-md bg-accent text-accent-foreground"
                        : "rounded-bl-md border border-border bg-surface text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                  </div>
                  <span className="mt-1 px-1 text-[11px] text-muted">
                    {mio ? "You" : m.autor || "Us"} · {horaCorta(m.created_at)}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                <MessageSquare className="h-6 w-6" />
              </span>
              <p className="text-sm font-medium text-foreground">No messages yet</p>
              <p className="max-w-xs text-xs text-muted">
                Write to us here for anything about this shipment — questions,
                updates or comments.
              </p>
            </div>
          )}
          <div ref={finRef} />
        </div>

        {errorChat && (
          <p className="border-t border-border px-4 py-2 text-xs font-medium text-red-500">
            {errorChat}
          </p>
        )}

        <form
          onSubmit={enviarMensaje}
          className="flex items-end gap-2 border-t border-border bg-surface-2/50 px-3 py-3"
        >
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviarMensaje(e);
              }
            }}
            rows={1}
            placeholder="Write a message…"
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent"
          />
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            aria-label="Send message"
            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {enviando ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
