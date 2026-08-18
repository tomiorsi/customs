"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Loader2, Trash2 } from "lucide-react";

/**
 * Logo del estudio: se ve en los PDF que se le entregan al cliente.
 *
 * Muestra la previsualización real —el mismo archivo que va al PDF— porque el
 * problema típico de un logo no es que no cargue, es que cargue mal: recortado,
 * con fondo blanco sobre fondo blanco, o en una resolución que se ve borrosa.
 * Eso solo se detecta viéndolo.
 */
export function LogoEstudioForm({ tieneLogo }: { tieneLogo: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cambia en cada subida para saltear la caché del navegador.
  const [version, setVersion] = useState(0);

  async function subir(file: File) {
    setError(null);
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch("/api/admin/logo", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo subir el logo.");
        return;
      }
      setVersion((v) => v + 1);
      router.refresh();
    } catch {
      setError("Error de conexión.");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function quitar() {
    setBorrando(true);
    try {
      await fetch("/api/admin/logo", { method: "DELETE" });
      setVersion((v) => v + 1);
      router.refresh();
    } finally {
      setBorrando(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2.5">
        <ImageUp className="h-4 w-4 shrink-0 text-accent" />
        <div>
          <p className="text-sm font-medium text-foreground">Logo del estudio</p>
          <p className="text-xs text-muted">
            Sale en las cotizaciones y estimaciones que descargás.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2">
          {tieneLogo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/api/admin/logo?v=${version}`}
              alt="Logo del estudio"
              className="h-full w-full object-contain p-1.5"
            />
          ) : (
            <ImageUp className="h-6 w-6 text-muted" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={subiendo}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90 disabled:opacity-60"
            >
              {subiendo ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImageUp className="h-4 w-4" />
              )}
              {tieneLogo ? "Cambiar" : "Subir logo"}
            </button>
            {tieneLogo && (
              <button
                type="button"
                onClick={quitar}
                disabled={borrando}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-red-500 disabled:opacity-60"
              >
                {borrando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Quitar
              </button>
            )}
          </div>
          <p className="text-[11px] leading-snug text-muted">
            PNG, JPG, SVG, WebP, AVIF, GIF o TIFF — hasta 8 MB. Se convierte y
            se ajusta solo al PDF sin deformarse, sea cuadrado, apaisado o
            vertical. Conviene fondo transparente: se imprime sobre blanco.
          </p>
          {error && <p className="text-xs font-medium text-red-500">{error}</p>}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.svg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void subir(f);
        }}
      />
    </section>
  );
}
