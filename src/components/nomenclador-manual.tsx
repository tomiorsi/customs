"use client";

import { useState } from "react";
import { Loader2, Search, ChevronLeft } from "lucide-react";
import type { SubpartidaNcm } from "@/lib/clasificador/tipos";

type PartidaHit = { partida: string; descripcion: string };
type PosicionNcm = { codigo: string; descripcion: string; di: number };

type DetallePartida = {
  partida: string;
  descripcion: string;
  subpartidas: SubpartidaNcm[];
  posiciones: PosicionNcm[];
  truncado: boolean;
  total: number;
};

const inputCls =
  "h-12 w-full rounded-lg border border-border bg-surface px-4 text-base text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

/**
 * Recorrido manual del nomenclador, sin IA: se busca por texto o por número de
 * partida, se abre la partida y se ven sus subpartidas y sus posiciones. Para
 * quien ya sabe dónde buscar y quiere ver el árbol completo.
 */
export function NomencladorManual({
  esExport,
  onElegir,
}: {
  esExport: boolean;
  /**
   * Qué hacer cuando alguien elige una posición del árbol.
   *
   * Sin esto el nomenclador solo se mira, que es lo que hace falta en la
   * pantalla de consulta y en el portal público. En la mesa de trabajo, en
   * cambio, buscar es el medio: lo que se quiere es quedarse con la posición
   * y sumarla a la carpeta. Es el mismo árbol; lo que cambia es qué pasa al
   * llegar a la hoja.
   */
  onElegir?: (posicion: { codigo: string; descripcion: string }) => void;
}) {
  const [consulta, setConsulta] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<PartidaHit[] | null>(null);
  const [detalle, setDetalle] = useState<DetallePartida | null>(null);
  const [subpartidaActiva, setSubpartidaActiva] = useState<string | null>(null);

  async function pedir(params: string) {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/nomenclador/explorar?${params}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "No se pudo consultar el nomenclador.");
        return null;
      }
      return data;
    } catch {
      setError("Error de conexión. Probá de nuevo.");
      return null;
    } finally {
      setCargando(false);
    }
  }

  async function buscar() {
    const q = consulta.trim();
    if (q.length < 2 || cargando) return;
    setDetalle(null);
    setSubpartidaActiva(null);
    const data = await pedir(`q=${encodeURIComponent(q)}`);
    if (!data) return;
    // Un número de partida devuelve el detalle directamente.
    if (data.posiciones) {
      setHits(null);
      setDetalle(data as DetallePartida);
      return;
    }
    setHits(data.partidas as PartidaHit[]);
  }

  async function abrirPartida(partida: string) {
    setSubpartidaActiva(null);
    const data = await pedir(`partida=${partida}`);
    if (data) setDetalle(data as DetallePartida);
  }

  const digitos = (s: string) => (s ?? "").replace(/\D/g, "");
  const posicionesVisibles = detalle
    ? subpartidaActiva
      ? detalle.posiciones.filter(
          (p) => digitos(p.codigo).slice(0, 6) === digitos(subpartidaActiva),
        )
      : detalle.posiciones
    : [];

  return (
    <div className="mt-4">
      <p className="text-sm leading-snug text-muted">
        Buscá por descripción o escribí el número de partida (4 dígitos) para
        abrir su árbol completo: subpartidas y posiciones, con{" "}
        {esExport ? "sus derechos de exportación." : "su derecho de importación."}
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          className={inputCls}
          placeholder="Ej.: martillo, o 8205"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void buscar();
          }}
        />
        <button
          type="button"
          onClick={() => void buscar()}
          disabled={cargando || consulta.trim().length < 2}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent px-6 text-sm font-semibold text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {cargando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Buscar
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-border bg-surface-2/40 px-4 py-3 text-sm text-muted">
          {error}
        </p>
      )}

      {hits && !detalle && (
        <div className="mt-5 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {hits.length} partidas encontradas — elegí una para abrirla
          </p>
          {hits.length === 0 && (
            <p className="rounded-lg border border-border bg-surface-2/40 px-4 py-3 text-sm text-muted">
              No hay partidas para esa descripción. Probá con otro término o con
              el número de partida.
            </p>
          )}
          <ul className="space-y-1">
            {hits.map((h) => (
              <li key={h.partida}>
                <button
                  type="button"
                  onClick={() => void abrirPartida(h.partida)}
                  className="flex w-full gap-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-left text-xs leading-snug text-muted transition-colors hover:border-accent/50 hover:text-foreground"
                >
                  <span className="shrink-0 font-mono font-semibold text-accent">
                    {h.partida}
                  </span>
                  <span className="min-w-0">{h.descripcion}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detalle && (
        <div className="mt-5 space-y-4 rounded-xl border border-accent/30 bg-surface-2/40 p-5">
          <div>
            {hits && (
              <button
                type="button"
                onClick={() => setDetalle(null)}
                className="mb-2 inline-flex items-center gap-1 text-[11px] font-medium text-muted transition-colors hover:text-accent"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Volver a los resultados
              </button>
            )}
            <p className="font-mono text-lg font-semibold text-foreground">
              Partida {detalle.partida}
            </p>
            <p className="mt-1 text-xs leading-snug text-muted">
              {detalle.descripcion}
            </p>
          </div>

          {detalle.subpartidas.length > 0 && (
            <div className="space-y-1.5 border-t border-border pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Subpartidas — tocá una para filtrar
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSubpartidaActiva(null)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    subpartidaActiva === null
                      ? "border-accent bg-accent text-[var(--accent-foreground)]"
                      : "border-border bg-surface text-muted hover:border-accent/50"
                  }`}
                >
                  Todas
                </button>
                {detalle.subpartidas.map((s) => {
                  const activa = subpartidaActiva === s.codigo;
                  return (
                    <button
                      key={s.codigo}
                      type="button"
                      onClick={() => setSubpartidaActiva(activa ? null : s.codigo)}
                      title={s.descripcion}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        activa
                          ? "border-accent bg-accent text-[var(--accent-foreground)]"
                          : "border-border bg-surface text-muted hover:border-accent/50"
                      }`}
                    >
                      <span className="font-mono">{s.codigo}</span>{" "}
                      {s.descripcion.slice(0, 34)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {posicionesVisibles.length} posiciones
              {detalle.truncado && !subpartidaActiva
                ? ` (de ${detalle.total}; refiná por subpartida para ver el resto)`
                : ""}
            </p>
            <ul className="space-y-1">
              {posicionesVisibles.map((p) => {
                const contenido = (
                  <>
                    <span className="shrink-0 font-mono font-medium text-foreground">
                      {p.codigo}
                    </span>
                    {!esExport && p.di != null && (
                      <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium text-accent">
                        DI {p.di}%
                      </span>
                    )}
                    <span className="min-w-0 basis-full text-left sm:basis-auto">
                      {p.descripcion}
                    </span>
                  </>
                );
                return (
                  <li key={p.codigo}>
                    {onElegir ? (
                      // Cuando la posición se puede elegir, el renglón es un
                      // botón: se toca y queda. Sin `onElegir` sigue siendo
                      // texto, como en la pantalla de consulta.
                      <button
                        type="button"
                        onClick={() =>
                          onElegir({ codigo: p.codigo, descripcion: p.descripcion })
                        }
                        className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md px-2 py-1.5 text-xs leading-snug text-muted transition-colors hover:bg-accent-soft hover:text-accent-text"
                      >
                        {contenido}
                      </button>
                    ) : (
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md px-2 py-1 text-xs leading-snug text-muted">
                        {contenido}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
