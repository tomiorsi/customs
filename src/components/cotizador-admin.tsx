"use client";

import { useState } from "react";
import { Building2, Info } from "lucide-react";
import { CotizadorImportacion } from "@/components/cotizador-importacion";
import { PERFILES_FISCALES, perfilDesdeCondicionIva } from "@/lib/cotizador";
import type { ClienteFiscal } from "@/lib/data";

/**
 * Cotizador del equipo: el mismo motor que usa el cliente, pero cotizando a
 * nombre de un cliente concreto.
 *
 * El perfil fiscal no es un detalle cosmético — define qué percepciones entran
 * y si el IVA se recupera. Por eso se elige el cliente antes de cotizar en vez
 * de asumir un default y entregar un número que no es el suyo.
 */
export function CotizadorAdmin({ clientes }: { clientes: ClienteFiscal[] }) {
  const [clienteId, setClienteId] = useState("");

  const cliente = clientes.find((c) => c.id === clienteId) ?? null;
  // Sin cliente elegido cotizamos como responsable inscripto sin certificado:
  // es el caso más común y deja el número del lado conservador.
  const ivaCondition = cliente?.ivaCondition ?? "responsable_inscripto";
  const certExencion = cliente?.certExencion ?? null;

  const perfil = perfilDesdeCondicionIva(ivaCondition);
  const perfilLabel =
    PERFILES_FISCALES.find((p) => p.value === perfil)?.label ?? perfil;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface px-5 py-4">
        <label
          htmlFor="cotizador-cliente"
          className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted"
        >
          <Building2 className="h-3.5 w-3.5" />
          Cotizar a nombre de
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            id="cotizador-cliente"
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)] sm:max-w-sm"
          >
            <option value="">Sin cliente (responsable inscripto)</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
                {c.cuit ? ` · ${c.cuit}` : ""}
              </option>
            ))}
          </select>

          <p className="flex items-start gap-1.5 text-xs text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Perfil fiscal aplicado: <strong>{perfilLabel}</strong>
              {certExencion?.toLowerCase() === "si"
                ? " · con certificado de exención"
                : ""}
              {!cliente && clientes.length > 0
                ? ". Elegí un cliente para usar su condición real."
                : ""}
            </span>
          </p>
        </div>
      </div>

      <CotizadorImportacion
        // Al cambiar de cliente cambian percepciones y recupero de IVA: se
        // remonta el cotizador para que no queden números del perfil anterior.
        key={clienteId || "sin-cliente"}
        ivaCondition={ivaCondition}
        certExencion={certExencion}
      />
    </div>
  );
}
