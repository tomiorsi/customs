"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Plus,
  Tag,
  Trash2,
} from "lucide-react";
import {
  DOC_CATEGORIA_DE,
  DOC_CATEGORIA_LABEL,
  DOC_CATEGORIAS_ORDEN,
  DOC_LABELS,
  docLabelDe,
  type DocType,
} from "@/lib/docs";
import type { DocumentRow } from "@/lib/data";

/**
 * Panel único de Documentos. Todo lo que se sube queda guardado como «otro»
 * hasta que la IA lee el contenido y clasifica el tipo (paso posterior).
 * El equipo puede reclasificar manualmente.
 */
export function PanelDocumentos({
  operationId,
  via,
  docs,
  puedeReclasificar = false,
}: {
  operationId: string;
  /** Tipo de operación (impo/expo). Se recibe por compatibilidad. */
  tipo?: string;
  via: string | null;
  docs: DocumentRow[];
  puedeReclasificar?: boolean;
}) {
  const router = useRouter();
  const [subiendo, setSubiendo] = useState(false);
  // Estado del análisis de IA de fondo (corre en el servidor después de subir).
  // Sondeamos un endpoint liviano para saber si está analizando y cuándo terminó,
  // y así mostrarlo en pantalla. Si el usuario se va, no pasa nada: el servidor
  // igual termina y persiste todo.
  const [estadoIA, setEstadoIA] = useState<{
    analizando: boolean;
    ultimoFin: string | null;
  } | null>(null);
  // Aviso breve de "analizado" que aparece al TERMINAR y se borra solo a los 5s
  // (no queda fijo). Sólo se muestra tras una transición analizando→listo de ESTA
  // sesión, no por un análisis viejo.
  const [hechoVisible, setHechoVisible] = useState(false);
  const hechoTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const montadoRef = useRef(true);
  const estadoRef = useRef<{ analizando: boolean; ultimoFin: string | null } | null>(
    null,
  );
  // Hasta cuándo sondear "rápido" (post-subida), aunque todavía no figure activo.
  const apurarHastaRef = useRef(0);

  useEffect(() => {
    montadoRef.current = true;
    let detener = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function consultar() {
      try {
        const r = await fetch(
          `/api/operaciones/${operationId}/ia/estado`,
          { cache: "no-store" },
        );
        if (!r.ok) return null;
        return (await r.json()) as { analizando: boolean; ultimoFin: string | null };
      } catch {
        return null;
      }
    }

    async function tick() {
      if (detener || !montadoRef.current) return;
      const e = await consultar();
      if (detener || !montadoRef.current) return;
      if (e) {
        const previo = estadoRef.current;
        estadoRef.current = e;
        setEstadoIA(e);
        // Cuando PASA de analizando a NO analizando, traemos los resultados ya
        // persistidos (hallazgos, reclasificación, validación del paso) y
        // mostramos "analizado" por 5 segundos.
        if (previo?.analizando && !e.analizando) {
          router.refresh();
          setHechoVisible(true);
          if (hechoTimerRef.current) clearTimeout(hechoTimerRef.current);
          hechoTimerRef.current = setTimeout(() => {
            if (montadoRef.current) setHechoVisible(false);
          }, 5000);
        }
      }
      const apurar = (e?.analizando ?? false) || Date.now() < apurarHastaRef.current;
      timer = setTimeout(tick, apurar ? 2500 : 9000);
    }

    timer = setTimeout(tick, 400);
    return () => {
      detener = true;
      montadoRef.current = false;
      if (timer) clearTimeout(timer);
      if (hechoTimerRef.current) clearTimeout(hechoTimerRef.current);
    };
  }, [operationId, router]);
  const [progreso, setProgreso] = useState<{ hecho: number; total: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [reclasificando, setReclasificando] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  async function subirUno(file: File): Promise<boolean> {
    const fd = new FormData();
    // "auto": la IA clasifica después de leer el contenido, no al subir.
    fd.append("docType", "auto");
    fd.append("file", file);
    const res = await fetch(`/api/operaciones/${operationId}/documentos`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(
        data?.error ?? `No se pudo subir "${file.name}".`,
      );
    }
    return true;
  }

  // Sube uno o varios archivos en secuencia (el almacenamiento reescribe la
  // metadata completa en cada alta: en paralelo podría pisar registros).
  async function subir(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    setSubiendo(true);
    setProgreso({ hecho: 0, total: files.length });
    let fallo: string | null = null;
    let subidos = 0;
    for (const file of files) {
      try {
        await subirUno(file);
        subidos += 1;
        setProgreso({ hecho: subidos, total: files.length });
      } catch (e) {
        fallo = e instanceof Error ? e.message : "Error al subir un archivo.";
        break;
      }
    }
    if (fallo) setError(fallo);
    setSubiendo(false);
    setProgreso(null);
    if (subidos > 0) {
      // Mostramos ya el documento subido; el análisis llega después (de fondo).
      router.refresh();
      // Apuramos el sondeo del estado de IA por los próximos ~2 minutos, y
      // mostramos "analizando" de entrada (el trabajo arranca apenas respondió).
      apurarHastaRef.current = Date.now() + 120000;
      setEstadoIA((prev) => ({ analizando: true, ultimoFin: prev?.ultimoFin ?? null }));
    }
  }

  async function eliminar(doc: DocumentRow) {
    setError(null);
    setEliminando(doc.id);
    try {
      const res = await fetch(`/api/documentos/${doc.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "No se pudo eliminar el documento.");
      }
      setConfirmando(null);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error al eliminar el documento.",
      );
    } finally {
      setEliminando(null);
    }
  }

  async function reclasificar(doc: DocumentRow, docType: DocType) {
    if (docType === doc.doc_type) {
      setReclasificando(null);
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/documentos/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "No se pudo reclasificar.");
      }
      setReclasificando(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al reclasificar.");
    }
  }

  function DocRow({ doc }: { doc: DocumentRow }) {
    const confirmar = confirmando === doc.id;
    const borrando = eliminando === doc.id;
    const editando = reclasificando === doc.id;
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-3 py-2.5">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-accent" />
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Tipo que identificó la IA */}
            <span className="text-xs font-semibold text-foreground">
              {docLabelDe(doc.doc_type, via)}
            </span>
            <a
              href={`/api/documentos/${doc.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex min-w-0 items-center gap-1 text-[11px] text-muted transition-colors hover:text-accent"
              title={doc.file_name}
            >
              <span className="truncate">{doc.file_name}</span>
              <Download className="h-3 w-3 shrink-0 group-hover:text-accent" />
            </a>
          </div>
          {puedeReclasificar && (
            <button
              type="button"
              onClick={() => setReclasificando(editando ? null : doc.id)}
              className="inline-flex items-center text-muted transition-colors hover:text-accent"
              title="Cambiar tipo"
            >
              <Tag className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmando(confirmar ? null : doc.id)}
            className="inline-flex items-center text-muted transition-colors hover:text-red-500"
            title="Eliminar documento"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* Confirmación explícita antes de borrar */}
        {confirmar && (
          <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-foreground">
              ¿De verdad querés eliminar este documento? Esta acción no se puede
              deshacer.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmando(null)}
                disabled={borrando}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-foreground disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => eliminar(doc)}
                disabled={borrando}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
              >
                {borrando && <Loader2 className="h-3 w-3 animate-spin" />}
                Sí, eliminar
              </button>
            </div>
          </div>
        )}
        {editando && puedeReclasificar && (
          <select
            value={doc.doc_type}
            onChange={(e) => reclasificar(doc, e.target.value as DocType)}
            className="w-full rounded-md border border-border bg-surface-2/40 px-1.5 py-1 text-[11px] text-foreground outline-none focus:border-accent"
          >
            {(Object.keys(DOC_LABELS) as DocType[]).map((t) => (
              <option key={t} value={t}>
                {DOC_LABELS[t]}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Subir documento (la IA identifica el tipo solo) */}
      <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-4">
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            if (files.length > 0) subir(files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={subiendo}
          onClick={() => fileInput.current?.click()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {subiendo ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {progreso && progreso.total > 1
                ? `Subiendo… (${progreso.hecho}/${progreso.total})`
                : "Subiendo…"}
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Subir documentos
            </>
          )}
        </button>
        <p className="mt-2 text-center text-[11px] text-muted">
          Se suben al instante. La IA los analiza después, sola, y actualiza el
          detalle: podés cerrar la página tranquilo. Podés subir varios a la vez.
        </p>

        {/* Estado del análisis de IA de fondo */}
        {estadoIA?.analizando ? (
          <div className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            La IA está analizando los documentos…
          </div>
        ) : hechoVisible ? (
          <div className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 transition-opacity">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Documentos analizados
          </div>
        ) : null}
      </div>

      {/* Documentos subidos, agrupados por categoría */}
      {docs.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface-2/30 px-4 py-3 text-xs text-muted">
          Todavía no hay documentos cargados.
        </p>
      ) : (
        <div className="rounded-xl border border-border bg-surface-2/30 px-4 py-3">
          <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Documentos subidos
            <span className="rounded-full bg-surface px-1.5 py-0.5 text-[10px] text-muted">
              {docs.length}
            </span>
          </p>
          <div className="flex flex-col gap-4">
            {DOC_CATEGORIAS_ORDEN.map((cat) => {
              const delGrupo = docs.filter(
                (d) => (DOC_CATEGORIA_DE[d.doc_type] ?? "otros") === cat,
              );
              if (delGrupo.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {DOC_CATEGORIA_LABEL[cat]}
                    </span>
                    <span className="text-[10px] font-medium text-muted/70">
                      {delGrupo.length}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <div className="flex flex-col gap-2">
                    {delGrupo.map((doc) => (
                      <DocRow key={doc.id} doc={doc} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="text-xs font-medium text-red-500">{error}</p>}
    </div>
  );
}
