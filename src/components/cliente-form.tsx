"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ClienteEditable } from "@/lib/data";

const IVA_OPCIONES = [
  { value: "", label: "Sin definir" },
  { value: "Responsable Inscripto", label: "Responsable Inscripto" },
  { value: "Monotributo", label: "Monotributo" },
  { value: "Exento", label: "Exento" },
  { value: "Consumidor Final", label: "Consumidor Final" },
];

/**
 * Alta y edición de cliente por el equipo (control interno). Si recibe `cliente`
 * edita ese registro (PUT); si no, da de alta uno nuevo (POST).
 */
export function ClienteForm({ cliente }: { cliente?: ClienteEditable }) {
  const router = useRouter();
  const editando = Boolean(cliente);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setError(null);
    const fd = new FormData(e.currentTarget);
    const companyName = String(fd.get("companyName") ?? "").trim();
    if (!companyName) {
      setError("El nombre o razón social es obligatorio.");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/admin/clientes", {
        method: editando ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: cliente?.id,
          companyName,
          personType: fd.get("personType"),
          cuit: fd.get("cuit"),
          email: fd.get("email"),
          contactName: fd.get("contactName"),
          phone: fd.get("phone"),
          ivaCondition: fd.get("ivaCondition"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (!editando && !data.id)) {
        setError(data.error ?? "No se pudo guardar el cliente.");
        setEnviando(false);
        return;
      }
      router.push("/admin/clientes");
      router.refresh();
    } catch {
      setError("Error de conexión. Probá de nuevo.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo className="sm:col-span-2" label="Nombre / Razón social *">
          <Input
            name="companyName"
            defaultValue={cliente?.company_name ?? ""}
            placeholder="Ej. Dayplas S.A."
            required
          />
        </Campo>

        <Campo label="Tipo de persona">
          <Select name="personType" defaultValue={cliente?.person_type ?? "juridica"}>
            <option value="juridica">Persona jurídica</option>
            <option value="fisica">Persona física</option>
          </Select>
        </Campo>

        <Campo label="CUIT">
          <Input name="cuit" defaultValue={cliente?.cuit ?? ""} placeholder="30-12345678-9" />
        </Campo>

        <Campo label="Email">
          <Input
            name="email"
            type="email"
            defaultValue={cliente?.email ?? ""}
            placeholder="cliente@empresa.com"
          />
        </Campo>

        <Campo label="Condición IVA">
          <Select name="ivaCondition" defaultValue={cliente?.iva_condition ?? ""}>
            {IVA_OPCIONES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Campo>

        <Campo label="Persona de contacto">
          <Input
            name="contactName"
            defaultValue={cliente?.contact_name ?? ""}
            placeholder="Nombre y apellido"
          />
        </Campo>

        <Campo label="Teléfono">
          <Input name="phone" defaultValue={cliente?.phone ?? ""} placeholder="+54 …" />
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
          {enviando
            ? "Guardando…"
            : editando
              ? "Guardar cambios"
              : "Crear cliente"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/clientes")}
          className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Estilo base compartido de campos (input y select). */
const CAMPO_BASE =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

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
