"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Package, Pencil } from "lucide-react";
import { faltaParaDeclarar } from "@/lib/items-operacion";

/**
 * Los productos de la carpeta, que se cargan de a uno.
 *
 * Una carpeta rara vez tiene una sola mercadería —un tercio de los despachos
 * del archivo llevan varias, y el más grande tiene 37— pero **no se sabe
 * cuántas son hasta clasificarlas**: la proforma casi nunca trae la posición.
 *
 * Por eso acá no se pide "cargá los N productos": se agrega uno, se clasifica,
 * y se ve si hay otro. La lista crece con el trabajo, que es como el
 * despachante lo hace igual.
 *
 * Vive en la etapa de apertura y en la de clasificación, porque el mismo
 * problema aparece en las dos: en la proforma para cotizar y en la factura
 * definitiva para declarar.
 */

export type ProductoCarpeta = {
  orden?: number;
  codigo?: string;
  mercaderia?: string;
  ncm?: string;
  marca?: string;
  cantidad?: string;
  unidad?: string;
  valor?: string;
  peso_neto?: string;
  fuente?: "documento" | "manual";
};

type Resumen = {
  total: number;
  clasificados: number;
  posiciones: number;
  incompletos: number;
};

/**
 * Lo que hay que completar de cada renglón para poder declarar.
 *
 * La factura trae la cantidad y el valor, pero el peso sale del packing list y
 * la posición la pone el despachante, así que un renglón recién agregado
 * siempre está a medias. Mostrarlo acá evita que el hueco aparezca recién al
 * generar el archivo, cuando ya no hay contexto de qué producto era.
 */
const CAMPOS_RENGLON = [
  { clave: "ncm", label: "Posición", ancho: "w-40", numerico: true },
  { clave: "cantidad", label: "Cantidad", ancho: "w-28", numerico: true },
  { clave: "unidad", label: "Unidad", ancho: "w-32", numerico: false },
  { clave: "peso_neto", label: "Peso neto", ancho: "w-28", numerico: true },
  { clave: "valor", label: "Valor", ancho: "w-28", numerico: true },
] as const;

export function ProductosCarpeta({
  opId,
  /** Lo que el clasificador acaba de encontrar, para ofrecerlo con un clic. */
  sugerencia,
  onCambio,
}: {
  opId: string;
  sugerencia?: { mercaderia?: string; ncm?: string } | null;
  onCambio?: (resumen: Resumen) => void;
}) {
  const [items, setItems] = useState<ProductoCarpeta[]>([]);
  const [resumen, setResumen] = useState<Resumen>({
    total: 0,
    clasificados: 0,
    posiciones: 0,
    incompletos: 0,
  });
  /** Qué renglón se está completando, por orden. */
  const [editando, setEditando] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mercaderia, setMercaderia] = useState("");
  const [ncm, setNcm] = useState("");

  const aplicar = useCallback(
    (d: { items?: ProductoCarpeta[]; resumen?: Resumen; error?: string }) => {
      if (d.error) {
        setError(d.error);
        return false;
      }
      setError(null);
      if (d.items) setItems(d.items);
      if (d.resumen) {
        setResumen(d.resumen);
        onCambio?.(d.resumen);
      }
      return true;
    },
    [onCambio],
  );

  // Primera carga. El estado se toca solo cuando llega la respuesta.
  useEffect(() => {
    let vigente = true;
    void fetch(`/api/operaciones/${opId}/items`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (vigente) aplicar(d);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [opId, aplicar]);

  async function agregar(prod: Partial<ProductoCarpeta> & { mercaderia: string }) {
    if (!prod.mercaderia.trim()) {
      setError("Poné qué es el producto.");
      return;
    }
    setCargando(true);
    try {
      const r = await fetch(`/api/operaciones/${opId}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prod),
      });
      if (aplicar(await r.json())) {
        // Se limpia para el siguiente: la idea es encadenar productos sin
        // tener que borrar lo anterior a mano.
        setMercaderia("");
        setNcm("");
        setEditando(null);
      }
    } catch {
      setError("No se pudo guardar el producto.");
    } finally {
      setCargando(false);
    }
  }

  async function quitar(orden: number) {
    setCargando(true);
    try {
      const r = await fetch(`/api/operaciones/${opId}/items?orden=${orden}`, { method: "DELETE" });
      aplicar(await r.json());
    } catch {
      setError("No se pudo sacar el producto.");
    } finally {
      setCargando(false);
    }
  }

  const sugerible = sugerencia?.ncm && sugerencia.mercaderia;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-foreground">Productos de la carpeta</h3>
        </div>
        {resumen.total > 0 && (
          <span className="text-[11px] text-muted">
            {resumen.clasificados} de {resumen.total} clasificado
            {resumen.clasificados === 1 ? "" : "s"}
            {resumen.posiciones > 0 &&
              ` · ${resumen.posiciones} posición${resumen.posiciones === 1 ? "" : "es"} distinta${resumen.posiciones === 1 ? "" : "s"}`}
            {resumen.incompletos > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {" "}
                · {resumen.incompletos} sin completar
              </span>
            )}
          </span>
        )}
      </div>

      {/* Lo que el clasificador acaba de encontrar, a un clic. */}
      {sugerible && (
        <div className="mt-3 rounded-lg bg-accent-soft px-3 py-2.5">
          <p className="text-xs text-accent-text">
            <span className="font-medium">{sugerencia!.mercaderia}</span> → {sugerencia!.ncm}
          </p>
          <button
            type="button"
            disabled={cargando}
            onClick={() =>
              void agregar({ mercaderia: sugerencia!.mercaderia!, ncm: sugerencia!.ncm })
            }
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar este producto a la carpeta
          </button>
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {items.map((it) => {
            const falta = faltaParaDeclarar(it);
            return (
              <li key={it.orden} className="py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="text-muted">{it.orden}.</span> {it.mercaderia}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {it.ncm ? (
                        <span className="font-medium text-accent-text">{it.ncm}</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">sin clasificar</span>
                      )}
                      {[it.codigo, it.cantidad && `${it.cantidad} ${it.unidad ?? ""}`.trim(), it.peso_neto && `${it.peso_neto} kg`, it.valor]
                        .filter(Boolean)
                        .map((x) => ` · ${x}`)}
                    </p>
                    {falta.length > 0 && (
                      <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                        Para declarar falta: {falta.join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={cargando}
                      onClick={() => setEditando(editando === it.orden ? null : it.orden!)}
                      aria-label={`Completar ${it.mercaderia}`}
                      className="rounded p-1 text-muted transition-colors hover:text-accent disabled:opacity-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={cargando}
                      onClick={() => void quitar(it.orden!)}
                      aria-label={`Sacar ${it.mercaderia}`}
                      className="rounded p-1 text-muted transition-colors hover:text-red-500 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {editando === it.orden && (
                  <form
                    className="mt-2 flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      // Se manda con la misma descripción a propósito: el
                      // servidor completa el renglón que ya está en vez de
                      // duplicarlo, y lo vacío no pisa lo que ya había.
                      const prod: Partial<ProductoCarpeta> & { mercaderia: string } = {
                        mercaderia: it.mercaderia ?? "",
                      };
                      for (const c of CAMPOS_RENGLON) {
                        const v = String(fd.get(c.clave) ?? "").trim();
                        if (v) prod[c.clave] = v;
                      }
                      void agregar(prod);
                    }}
                  >
                    {CAMPOS_RENGLON.map((c) => (
                      <label key={c.clave} className={`${c.ancho} space-y-1`}>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
                          {c.label}
                        </span>
                        <input
                          name={c.clave}
                          defaultValue={it[c.clave] ?? ""}
                          inputMode={c.numerico ? "numeric" : undefined}
                          className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground"
                        />
                      </label>
                    ))}
                    <button
                      type="submit"
                      disabled={cargando}
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      Guardar
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Alta a mano: para el producto que no está en ningún documento. */}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
            Otro producto
          </span>
          <input
            value={mercaderia}
            onChange={(e) => setMercaderia(e.target.value)}
            placeholder="Qué es"
            className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="w-36 space-y-1">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
            Posición
          </span>
          <input
            value={ncm}
            onChange={(e) => setNcm(e.target.value)}
            placeholder="opcional"
            inputMode="numeric"
            className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm tabular-nums text-foreground"
          />
        </label>
        <button
          type="button"
          disabled={cargando || !mercaderia.trim()}
          onClick={() => void agregar({ mercaderia, ncm: ncm || undefined })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Agregar
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      {items.length === 0 && !error && (
        <p className="mt-2 text-[11px] text-muted">
          Se puede dejar vacío si la carpeta tiene una sola mercadería: en ese caso alcanza con la
          posición de arriba.
        </p>
      )}
    </section>
  );
}
