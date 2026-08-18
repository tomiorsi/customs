"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";
import { CONDICIONES_IVA } from "@/lib/suscripcion";

/**
 * Datos del estudio con los que se emite la factura de la suscripción.
 *
 * Se pueden editar acá y no solo al contratar: cambian —una mudanza, un pase a
 * responsable inscripto— y no hay que esperar a la renovación para corregirlos.
 */

const INPUT =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

export function DatosEstudioForm({
  inicial,
}: {
  inicial: { nombre: string; cuit: string; condicionIva: string; domicilio: string };
}) {
  const router = useRouter();
  const [datos, setDatos] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState<{ tipo: "ok" | "error"; msg: string } | null>(
    null,
  );

  const sinCambios =
    datos.nombre === inicial.nombre &&
    datos.cuit === inicial.cuit &&
    datos.condicionIva === inicial.condicionIva &&
    datos.domicilio === inicial.domicilio;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setEstado(null);
    try {
      const res = await fetch("/api/usuario/estudio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEstado({ tipo: "error", msg: data.error ?? "No se pudo guardar." });
        return;
      }
      setEstado({ tipo: "ok", msg: "Datos actualizados." });
      router.refresh();
    } catch {
      setEstado({ tipo: "error", msg: "Error de conexión." });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2.5">
        <Building2 className="h-4 w-4 shrink-0 text-accent" />
        <div>
          <p className="text-sm font-medium text-foreground">Datos del estudio</p>
          <p className="text-xs text-muted">
            Con estos datos te emitimos la factura de la suscripción.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="est-nombre" className="text-xs font-medium text-muted">
            Nombre o estudio
          </label>
          <input
            id="est-nombre"
            className={INPUT}
            value={datos.nombre}
            onChange={(e) => setDatos((d) => ({ ...d, nombre: e.target.value }))}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="est-cuit" className="text-xs font-medium text-muted">
            CUIT
          </label>
          <input
            id="est-cuit"
            inputMode="numeric"
            className={INPUT}
            placeholder="30-12345678-9"
            value={datos.cuit}
            onChange={(e) => setDatos((d) => ({ ...d, cuit: e.target.value }))}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="est-iva" className="text-xs font-medium text-muted">
            Condición frente al IVA
          </label>
          <select
            id="est-iva"
            className={INPUT}
            value={datos.condicionIva}
            onChange={(e) => setDatos((d) => ({ ...d, condicionIva: e.target.value }))}
          >
            <option value="">Seleccionar…</option>
            {CONDICIONES_IVA.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="est-domicilio" className="text-xs font-medium text-muted">
            Domicilio fiscal
          </label>
          <input
            id="est-domicilio"
            className={INPUT}
            placeholder="Av. Siempre Viva 123, CABA"
            value={datos.domicilio}
            onChange={(e) => setDatos((d) => ({ ...d, domicilio: e.target.value }))}
          />
        </div>
      </div>

      {estado && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
            estado.tipo === "ok"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border border-accent/40 bg-accent-soft text-accent"
          }`}
        >
          {estado.msg}
        </p>
      )}

      <button
        type="submit"
        disabled={guardando || sinCambios}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
      >
        {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Guardar cambios
      </button>
    </form>
  );
}
