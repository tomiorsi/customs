"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Download, FileCode2, Loader2, RefreshCw } from "lucide-react";

/**
 * El archivo del pre-SIM, en la etapa de oficialización.
 *
 * Va al lado de la ficha para Malvina porque es el mismo momento: la ficha
 * sirve para cargar a mano y esto genera el archivo que el Kit importa.
 *
 * Lo que se muestra primero es **lo que falta**, no el archivo. Un despachante
 * que abre esto quiere saber si puede emitir; el texto es el resultado, no la
 * pregunta.
 */

type Faltante = { campo: string; porque: string };
type Hallazgo = {
  nivel: "error" | "aviso";
  seccion: string;
  nart: string;
  clave: string;
  detalle: string;
};

type Respuesta = {
  ok?: boolean;
  error?: string;
  faltantes?: Faltante[];
  hallazgos?: Hallazgo[];
  resumen?: { errores: number; avisos: number; emitible: boolean };
  subregimen?: string;
  nombre?: string;
  archivo?: string | null;
};

export function PresimPanel({ opId }: { opId: string }) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(false);

  const consultar = useCallback(async (): Promise<Respuesta> => {
    try {
      const r = await fetch(`/api/operaciones/${opId}/presim`, { cache: "no-store" });
      return (await r.json()) as Respuesta;
    } catch {
      return { error: "No se pudo consultar el pre-SIM." };
    }
  }, [opId]);

  /** El botón «Revisar»: acá sí corresponde marcar que está cargando. */
  const cargar = useCallback(async () => {
    setCargando(true);
    setDatos(await consultar());
    setCargando(false);
  }, [consultar]);

  // Primera carga. El estado se toca solo cuando llega la respuesta: marcarlo
  // antes obligaría a un render de más apenas se monta el panel.
  useEffect(() => {
    let vigente = true;
    void consultar().then((d) => {
      if (vigente) setDatos(d);
    });
    return () => {
      vigente = false;
    };
  }, [consultar]);

  const descargar = () => {
    if (!datos?.archivo) return;
    // Latin-1 con saltos de Windows: es lo que espera el Kit, y es como vienen
    // los archivos que genera Sintia.
    const bytes = Uint8Array.from(
      datos.archivo.replace(/\n/g, "\r\n"),
      (c) => c.charCodeAt(0) & 0xff,
    );
    const url = URL.createObjectURL(new Blob([bytes], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = datos.nombre ?? "presim.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const faltantes = datos?.faltantes ?? [];
  const hallazgos = datos?.hallazgos ?? [];
  const errores = hallazgos.filter((h) => h.nivel === "error");
  const avisos = hallazgos.filter((h) => h.nivel === "aviso");
  const listo = Boolean(datos?.archivo) && errores.length === 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-foreground">Archivo para el Kit Malvina</h3>
          {datos?.subregimen && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-text">
              {datos.subregimen}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={cargando}
          className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-accent disabled:opacity-50"
        >
          {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Revisar
        </button>
      </div>

      {datos?.error && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          {datos.error}
        </p>
      )}

      {/* Lo que falta cargar. Va primero: es lo accionable. */}
      {faltantes.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-foreground">
            Falta cargar {faltantes.length === 1 ? "un dato" : `${faltantes.length} datos`} antes de emitir:
          </p>
          <ul className="mt-2 space-y-1.5">
            {faltantes.map((f, i) => (
              <li key={i} className="flex gap-2 text-xs">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span>
                  <span className="font-medium text-foreground">{f.campo}</span>
                  <span className="text-muted"> — {f.porque}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Lo que el SIM va a objetar. */}
      {hallazgos.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {[...errores, ...avisos].map((h, i) => (
            <li key={i} className="flex gap-2 text-xs">
              <AlertTriangle
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${h.nivel === "error" ? "text-red-500" : "text-amber-500"}`}
              />
              <span>
                <span className="font-medium text-foreground">
                  {h.seccion}
                  {h.nart !== "0000" && ` · ítem ${Number(h.nart)}`} · {h.clave}
                </span>
                <span className="text-muted"> — {h.detalle}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {listo && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            {avisos.length === 0
              ? "Sin observaciones."
              : `${avisos.length} aviso${avisos.length === 1 ? "" : "s"}, ninguno bloquea.`}
          </span>
          <button
            type="button"
            onClick={descargar}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            <Download className="h-3.5 w-3.5" />
            Descargar {datos?.nombre}
          </button>
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="text-xs text-muted underline-offset-2 hover:underline"
          >
            {abierto ? "Ocultar" : "Ver"} el archivo
          </button>
        </div>
      )}

      {abierto && datos?.archivo && (
        <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-muted/10 p-3 text-[11px] leading-relaxed text-foreground">
          {datos.archivo}
        </pre>
      )}

      {!cargando && !datos?.error && faltantes.length === 0 && !datos?.archivo && (
        <p className="mt-3 text-xs text-muted">Todavía no hay datos suficientes para armarlo.</p>
      )}
    </section>
  );
}
