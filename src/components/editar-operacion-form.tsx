"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import type { OperationRow } from "@/lib/data";
import { UNIDADES } from "@/lib/unidades";

type CampoTipo = "text" | "date" | "via" | "moneda" | "unidad";

type Campo = {
  campo: string;
  label: string;
  type?: CampoTipo;
  basico?: boolean;
  hint?: string;
};

const SECCIONES: { titulo: string; campos: Campo[] }[] = [
  {
    titulo: "General",
    campos: [
      { campo: "titulo", label: "Título", basico: true },
      { campo: "via", label: "Vía", type: "via", basico: true },
      { campo: "contraparte", label: "Proveedor / comprador", basico: true },
      { campo: "aduana", label: "Aduana" },
      { campo: "pais_origen", label: "País de origen", basico: true },
      { campo: "pais_procedencia", label: "Procedencia" },
      { campo: "pais_adquisicion", label: "País de adquisición" },
      { campo: "pais_destino", label: "País de destino", basico: true },
    ],
  },
  {
    titulo: "Mercadería",
    campos: [
      { campo: "mercaderia", label: "Mercadería", basico: true },
      { campo: "ncm", label: "NCM" },
      { campo: "marca", label: "Marca", basico: true },
      { campo: "estado_merc", label: "Estado", basico: true },
      {
        campo: "cantidad",
        label: "Cantidad de mercadería",
        basico: true,
        hint: "No es la cantidad de bultos. Es la cantidad del producto según la factura.",
      },
      {
        campo: "unidad",
        label: "Unidad de medida",
        type: "unidad",
        basico: true,
        hint: "Unidad de la cantidad declarada (según la tabla de la Aduana).",
      },
      { campo: "bultos", label: "Bultos" },
      { campo: "tipo_embalaje", label: "Embalaje" },
      { campo: "peso_neto", label: "Peso neto (con unidad)" },
      { campo: "peso_bruto", label: "Peso bruto (con unidad)" },
    ],
  },
  {
    titulo: "Valoración",
    campos: [
      { campo: "incoterm", label: "Incoterm", basico: true },
      { campo: "moneda", label: "Moneda", basico: true },
      { campo: "valor_factura", label: "Valor factura", basico: true },
      { campo: "valor_fob", label: "Valor FOB" },
      { campo: "flete", label: "Flete" },
      { campo: "seguro", label: "Seguro" },
      { campo: "valor_cif", label: "Valor CIF" },
      { campo: "gastos_origen", label: "Gastos en origen" },
      { campo: "gastos_destino", label: "Gastos en destino" },
      { campo: "forma_pago", label: "Forma de pago", basico: true },
    ],
  },
  {
    titulo: "Transporte",
    campos: [
      { campo: "medio_transporte", label: "Transporte" },
      { campo: "transportista", label: "Transportista / forwarder" },
      { campo: "transporte_doc_nro", label: "N° de documento" },
      { campo: "puerto_origen", label: "Origen" },
      { campo: "puerto_transbordo", label: "Transbordo / escala" },
      { campo: "puerto_destino", label: "Destino" },
      { campo: "tipo_carga", label: "Tipo de carga" },
      { campo: "contenedor", label: "N° de contenedor" },
      { campo: "paso_frontera", label: "Paso fronterizo" },
      {
        campo: "eta",
        label: "Fecha de arribo / embarque",
        type: "date",
        basico: true,
      },
    ],
  },
];

const TODOS_CAMPOS = SECCIONES.flatMap((s) => s.campos.map((c) => c.campo)).concat(
  "detalle",
);

const VIAS = [
  { value: "", label: "— Sin especificar —" },
  { value: "maritima", label: "Marítima" },
  { value: "aerea", label: "Aérea" },
  { value: "terrestre", label: "Terrestre" },
];

const inputCls =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

export function EditarOperacionForm({
  op,
  onDone,
  completo = false,
}: {
  op: OperationRow;
  onDone: () => void;
  completo?: boolean;
}) {
  const router = useRouter();
  const fuente = op as unknown as Record<string, string | null>;
  const esExpo = op.tipo.toLowerCase().startsWith("exp");

  const secciones = SECCIONES.map((sec) => ({
    ...sec,
    campos: (completo ? sec.campos : sec.campos.filter((c) => c.basico)).map(
      (c) =>
        c.campo === "contraparte"
          ? { ...c, label: esExpo ? "Comprador" : "Proveedor" }
          : c,
    ),
  })).filter((sec) => sec.campos.length > 0);

  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const c of TODOS_CAMPOS) init[c] = fuente[c] ?? "";
    return init;
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(campo: string, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function guardar() {
    setError(null);
    if (!form.titulo.trim()) {
      setError("Ponele un nombre a la operación para identificarla.");
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`/api/operaciones/${op.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "No se pudieron guardar los cambios.");
      }
      router.refresh();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar los cambios.");
      setGuardando(false);
    }
  }

  return (
    <div className="neon-top overflow-hidden rounded-2xl border border-border bg-surface/80 backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-2/40 px-5 py-4">
        <p className="text-base font-semibold text-foreground">
          Editar operación
        </p>
      </div>

      <div className="space-y-6 px-5 py-5">
        {secciones.map((sec) => (
          <div key={sec.titulo}>
            <div className="mb-3 flex items-center gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                {sec.titulo}
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
            </div>
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {sec.campos.map(({ campo, label, type, hint }) => (
                <div key={campo} className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    {label}
                    {campo === "titulo" && (
                      <span className="text-accent"> *</span>
                    )}
                  </label>
                  {type === "via" ? (
                    <select
                      className={inputCls}
                      value={form[campo]}
                      onChange={(e) => set(campo, e.target.value)}
                    >
                      {VIAS.map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  ) : type === "unidad" ? (
                    <select
                      className={inputCls}
                      value={form[campo]}
                      onChange={(e) => set(campo, e.target.value)}
                    >
                      <option value="">— Sin especificar —</option>
                      {form[campo] &&
                        !UNIDADES.includes(form[campo]) && (
                          <option value={form[campo]}>{form[campo]}</option>
                        )}
                      {UNIDADES.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={type === "date" ? "date" : "text"}
                      className={inputCls}
                      value={form[campo]}
                      onChange={(e) => set(campo, e.target.value)}
                    />
                  )}
                  {hint && <p className="text-[11px] leading-snug text-muted">{hint}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div>
          <div className="mb-3 flex items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              Observaciones
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
          </div>
          <textarea
            rows={3}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            value={form.detalle}
            onChange={(e) => set("detalle", e.target.value)}
          />
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-500">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDone}
            disabled={guardando}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-muted transition-colors hover:text-foreground disabled:opacity-60"
          >
            <X className="h-4 w-4" />
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-[#fb923c] px-6 py-3 text-sm font-semibold text-accent-foreground shadow-[0_10px_30px_-12px_var(--ring)] transition-all hover:opacity-95 disabled:opacity-60"
          >
            {guardando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {guardando ? "Guardando…" : "Confirmar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
