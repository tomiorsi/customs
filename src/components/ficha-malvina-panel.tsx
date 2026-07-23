"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ClipboardCopy,
  FileSearch,
  FileUp,
  Loader2,
  RefreshCw,
} from "lucide-react";

type FichaCampo = {
  id: string;
  label: string;
  valor: string;
  nota?: string;
};

type FichaSeccion = {
  id: string;
  titulo: string;
  campos: FichaCampo[];
};

type FichaMalvina = {
  titulo: string;
  secciones: FichaSeccion[];
};

function CampoFila({ campo }: { campo: FichaCampo }) {
  const [copiado, setCopiado] = useState(false);
  const copiable = campo.valor !== "—";

  async function copiar() {
    if (!copiable) return;
    try {
      await navigator.clipboard.writeText(campo.valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* ignorar */
    }
  }

  return (
    <div className="flex items-start justify-between gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
          {campo.label}
        </p>
        <p className="mt-0.5 text-[11px] font-medium leading-snug text-foreground">
          {campo.valor}
        </p>
        {campo.nota && (
          <p className="mt-0.5 text-[10px] leading-snug text-muted">{campo.nota}</p>
        )}
      </div>
      {copiable && (
        <button
          type="button"
          onClick={copiar}
          title="Copiar valor"
          className="shrink-0 rounded-md border border-border p-1 text-muted transition-colors hover:text-foreground"
        >
          {copiado ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <ClipboardCopy className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

export function FichaMalvinaPanel({
  opId,
  checklistKey,
  despachoCargado = false,
  onDocumentoSubido,
}: {
  opId: string;
  /** Cambia cuando el operador marca ítems del checklist (VEP, pago, etc.). */
  checklistKey?: string;
  despachoCargado?: boolean;
  onDocumentoSubido?: () => void;
}) {
  const [data, setData] = useState<FichaMalvina | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const apurarHastaRef = useRef(0);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/operaciones/${opId}/ficha-malvina`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "No se pudo cargar la ficha.");
        setData(null);
        return;
      }
      setData(json.resultado as FichaMalvina);
    } catch {
      setError("Error de conexión.");
      setData(null);
    } finally {
      setCargando(false);
    }
  }, [opId]);

  useEffect(() => {
    void cargar();
  }, [cargar, checklistKey]);

  useEffect(() => {
    let detener = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let prevAnalizando: boolean | null = null;

    async function tick() {
      if (detener) return;
      try {
        const res = await fetch(`/api/operaciones/${opId}/ia/estado`, {
          cache: "no-store",
        });
        if (res.ok) {
          const e = (await res.json()) as { analizando: boolean };
          setAnalizando(e.analizando);
          if (prevAnalizando === true && !e.analizando) {
            onDocumentoSubido?.();
          }
          prevAnalizando = e.analizando;
        }
      } catch {
        /* ignorar */
      }
      const apurar =
        (prevAnalizando ?? false) || Date.now() < apurarHastaRef.current;
      timer = setTimeout(tick, apurar ? 2500 : 12000);
    }

    void tick();
    return () => {
      detener = true;
      if (timer) clearTimeout(timer);
    };
  }, [opId, onDocumentoSubido]);

  async function subirDespacho(file: File) {
    setSubiendo(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("docType", "despacho");
      fd.append("file", file);
      const res = await fetch(`/api/operaciones/${opId}/documentos`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "No se pudo subir el despacho.");
        return;
      }
      apurarHastaRef.current = Date.now() + 120_000;
      setAnalizando(true);
      onDocumentoSubido?.();
    } catch {
      setError("Error de conexión al subir el despacho.");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="rounded-xl border border-accent/30 bg-accent-soft/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <FileSearch className="h-3.5 w-3.5 text-accent" />
          Ficha para Malvina
        </p>
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={cargando}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-foreground disabled:opacity-60"
        >
          {cargando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Actualizar
        </button>
      </div>

      <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
        Armá la carátula con estos datos, oficializá en Malvina y subí acá el PDF
        del despacho oficializado. La IA lo lee y tacha el ítem del checklist.
        Después registrá el canal y avanzá a verificación.
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void subirDespacho(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={subiendo || analizando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {subiendo || analizando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileUp className="h-3.5 w-3.5" />
          )}
          {subiendo
            ? "Subiendo…"
            : analizando
              ? "Analizando despacho…"
              : "Subir despacho oficializado"}
        </button>
        {despachoCargado && !analizando && (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Despacho registrado en checklist
          </span>
        )}
      </div>

      {cargando && !data ? (
        <p className="mt-3 flex items-center gap-2 text-[11px] text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Armando ficha…
        </p>
      ) : error ? (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : data ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {data.secciones.map((sec) => (
            <div
              key={sec.id}
              className="rounded-lg border border-border bg-surface/80 px-3 py-2"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                {sec.titulo}
              </p>
              <div className="mt-1 divide-y divide-border/60">
                {sec.campos.map((c) => (
                  <CampoFila key={c.id} campo={c} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
