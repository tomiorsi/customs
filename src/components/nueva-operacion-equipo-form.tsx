"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ClienteOpcion = {
  id: string;
  company_name: string | null;
  email: string | null;
  cuit: string | null;
};

const VIAS = [
  { value: "", label: "Sin definir" },
  { value: "maritima", label: "Marítima" },
  { value: "aerea", label: "Aérea" },
  { value: "terrestre", label: "Terrestre" },
];

/** Incoterms 2020 (cláusula de entrega). */
const INCOTERMS = [
  { value: "", label: "Sin definir" },
  { value: "EXW", label: "EXW · En fábrica" },
  { value: "FCA", label: "FCA · Franco transportista" },
  { value: "FAS", label: "FAS · Franco al costado del buque" },
  { value: "FOB", label: "FOB · Franco a bordo" },
  { value: "CFR", label: "CFR · Costo y flete" },
  { value: "CIF", label: "CIF · Costo, seguro y flete" },
  { value: "CPT", label: "CPT · Transporte pagado hasta" },
  { value: "CIP", label: "CIP · Transporte y seguro pagados hasta" },
  { value: "DAP", label: "DAP · Entregado en lugar" },
  { value: "DPU", label: "DPU · Entregado en lugar descargado" },
  { value: "DDP", label: "DDP · Entregado con derechos pagados" },
];

/** Alta de operación por el equipo (control interno): a nombre de un cliente. */
export function NuevaOperacionEquipoForm({ clientes }: { clientes: ClienteOpcion[] }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (!String(fd.get("cliente_id") ?? "").trim()) {
      setError("Elegí el cliente.");
      return;
    }
    if (!String(fd.get("titulo") ?? "").trim()) {
      setError("Ponele un nombre a la operación.");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/operaciones", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) {
        setError(data.error ?? "No se pudo crear la operación.");
        setEnviando(false);
        return;
      }
      router.push(`/admin/operaciones/${data.id}/mesa`);
    } catch {
      setError("Error de conexión. Probá de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo className="sm:col-span-2" label="Cliente *">
          <Select name="cliente_id" defaultValue="" required>
            <option value="" disabled>
              Elegí un cliente…
            </option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name?.trim() || c.email || c.cuit || c.id}
                {c.cuit ? ` · ${c.cuit}` : ""}
              </option>
            ))}
          </Select>
          {clientes.length === 0 && (
            <p className="mt-1 text-xs text-muted">
              No hay clientes cargados todavía. Creá el cliente desde la pestaña Clientes.
            </p>
          )}
        </Campo>

        <Campo label="Tipo *">
          <Select name="tipo" defaultValue="Importación" required>
            <option value="Importación">Importación</option>
            <option value="Exportación">Exportación</option>
          </Select>
        </Campo>

        <Campo label="Vía">
          <Select name="via" defaultValue="">
            {VIAS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </Select>
        </Campo>

        <Campo className="sm:col-span-2" label="Nombre de la operación *">
          <Input name="titulo" placeholder="Ej. Film policarbonato Brasil" required />
        </Campo>

        <Campo className="sm:col-span-2" label="Mercadería">
          <Input name="mercaderia" placeholder="Descripción de la mercadería" />
        </Campo>

        <Campo label="País de origen">
          <Input name="pais_origen" placeholder="Ej. Brasil" />
        </Campo>

        <Campo label="Incoterm">
          <Select name="incoterm" defaultValue="">
            {INCOTERMS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </Select>
        </Campo>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={enviando}
          className="inline-flex items-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {enviando ? "Creando…" : "Crear operación"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/operaciones")}
          className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Estilo base compartido de campos (input y select) del formulario. */
const CAMPO_BASE =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

/** Contenedor de un campo con su etiqueta. */
function Campo({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={CAMPO_BASE} />;
}

/** Select con el estilo base; el chevron lo pone el CSS global. */
function Select({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${CAMPO_BASE} cursor-pointer`}>
      {children}
    </select>
  );
}
