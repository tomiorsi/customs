"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  Loader2,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ClientRow } from "@/lib/data";
import { estadoCartaGarantia, formatVence } from "@/lib/carta-garantia";

/** Config visual de la columna "Carta de garantía" según el estado calculado. */
function cartaInfo(
  tipo: string | null,
  vence: string | null,
): { text: string; cls: string; Icon: LucideIcon } {
  const f = formatVence(vence);
  switch (estadoCartaGarantia(tipo, vence)) {
    case "vigente":
      return {
        text: f ? `Anual · vence ${f}` : "Anual · vigente",
        cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        Icon: ShieldCheck,
      };
    case "vencida":
      return {
        text: "Vencida · renovar",
        cls: "bg-red-500/10 text-red-500",
        Icon: ShieldAlert,
      };
    case "puntual":
      return {
        text: "Por operación",
        cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
        Icon: Shield,
      };
    default:
      return { text: "Sin carta", cls: "bg-surface-2 text-muted", Icon: Shield };
  }
}

const ESTADO_BADGE: Record<string, { label: string; cls: string }> = {
  approved: {
    label: "Habilitada",
    cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  submitted: {
    label: "En revisión",
    cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  rejected: {
    label: "Rechazada",
    cls: "bg-red-500/10 text-red-500",
  },
  none: { label: "Sin acceso", cls: "bg-surface-2 text-muted" },
};

export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [estados, setEstados] = useState<Record<string, string>>(() =>
    Object.fromEntries(clients.map((c) => [c.id, c.op_status ?? "none"])),
  );
  const [procesando, setProcesando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [cartas, setCartas] = useState<
    Record<string, { tipo: string | null; vence: string | null }>
  >(() =>
    Object.fromEntries(
      clients.map((c) => [
        c.id,
        { tipo: c.carta_garantia, vence: c.carta_garantia_vence },
      ]),
    ),
  );
  const [editandoCarta, setEditandoCarta] = useState<string | null>(null);
  const [guardandoCarta, setGuardandoCarta] = useState<string | null>(null);

  async function guardarCarta(id: string, tipo: "anual" | "puntual" | "no") {
    setGuardandoCarta(id);
    try {
      const res = await fetch("/api/admin/clientes/carta-garantia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, tipo }),
      });
      if (res.ok) {
        const data = (await res.json()) as { tipo: string; vence: string | null };
        setCartas((c) => ({ ...c, [id]: { tipo: data.tipo, vence: data.vence } }));
        setEditandoCarta(null);
        router.refresh();
      }
    } finally {
      setGuardandoCarta(null);
    }
  }

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return clients;
    return clients.filter((c) =>
      [c.company_name, c.email, c.cuit, c.contact_name]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(t)),
    );
  }, [q, clients]);

  async function cambiar(id: string, action: "approve" | "revoke") {
    setProcesando(id);
    try {
      const res = await fetch("/api/admin/solicitudes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, action }),
      });
      if (res.ok) {
        setEstados((e) => ({
          ...e,
          [id]: action === "approve" ? "approved" : "none",
        }));
        router.refresh();
      }
    } finally {
      setProcesando(null);
      setConfirmando(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por razón social, email o CUIT…"
          className="w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-accent">
              <Building2 className="h-7 w-7" />
            </span>
            <p className="mt-4 text-sm font-medium text-foreground">
              {clients.length === 0
                ? "Todavía no hay clientes registrados"
                : "Sin resultados para tu búsqueda"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Empresa</th>
                  <th className="px-5 py-3 font-medium">Contacto</th>
                  <th className="px-5 py-3 text-right font-medium">Operaciones</th>
                  <th className="px-5 py-3 font-medium">Carta de garantía</th>
                  <th className="px-5 py-3 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtrados.map((c) => {
                  const estado = estados[c.id] ?? "none";
                  const badge = ESTADO_BADGE[estado] ?? ESTADO_BADGE.none;
                  const habilitada = estado === "approved";
                  const busy = procesando === c.id;
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-surface-2">
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                          <span className="text-base font-semibold text-foreground">
                            {c.company_name ?? "—"}
                          </span>
                          {c.cuit ? (
                            <span className="text-[11px] text-muted">
                              CUIT {c.cuit}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-foreground">{c.email ?? "—"}</p>
                        <p className="text-xs text-muted">
                          {c.phone ?? "Sin teléfono"}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <p className="font-medium text-foreground">
                          {c.opsActivas} activa{c.opsActivas === 1 ? "" : "s"}
                        </p>
                        <p className="text-xs text-muted">
                          {c.opsCerradas} cerrada{c.opsCerradas === 1 ? "" : "s"}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        {(() => {
                          const carta = cartas[c.id] ?? {
                            tipo: c.carta_garantia,
                            vence: c.carta_garantia_vence,
                          };
                          const cartaBusy = guardandoCarta === c.id;
                          if (editandoCarta === c.id) {
                            const opciones: {
                              tipo: "anual" | "puntual" | "no";
                              label: string;
                            }[] = [
                              { tipo: "anual", label: "Anual" },
                              { tipo: "puntual", label: "Por operación" },
                              { tipo: "no", label: "Sin carta" },
                            ];
                            const tipoActual = (carta.tipo ?? "no").toLowerCase();
                            return (
                              <div className="flex flex-wrap items-center gap-1.5">
                                {opciones.map((o) => {
                                  const activo = tipoActual === o.tipo;
                                  return (
                                    <button
                                      key={o.tipo}
                                      type="button"
                                      disabled={cartaBusy}
                                      onClick={() => guardarCarta(c.id, o.tipo)}
                                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
                                        activo
                                          ? "bg-accent text-accent-foreground"
                                          : "bg-surface-2 text-foreground hover:bg-accent-soft"
                                      }`}
                                    >
                                      {o.label}
                                    </button>
                                  );
                                })}
                                {cartaBusy ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
                                ) : (
                                  <button
                                    type="button"
                                    aria-label="Cancelar"
                                    onClick={() => setEditandoCarta(null)}
                                    className="rounded-md p-1 text-muted transition-colors hover:text-foreground"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            );
                          }
                          const info = cartaInfo(carta.tipo, carta.vence);
                          const Icon = info.Icon;
                          return (
                            <button
                              type="button"
                              title="Cambiar estado de la carta de garantía"
                              onClick={() => setEditandoCarta(c.id)}
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80 ${info.cls}`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {info.text}
                            </button>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-3">
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badge.cls}`}
                          >
                            {badge.label}
                          </span>

                          {confirmando === c.id ? (
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <span className="text-xs text-muted">
                                {habilitada
                                  ? "¿De verdad querés quitar el acceso?"
                                  : "¿De verdad querés habilitar?"}
                              </span>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  cambiar(
                                    c.id,
                                    habilitada ? "revoke" : "approve",
                                  )
                                }
                                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${
                                  habilitada
                                    ? "bg-red-500 text-white hover:opacity-90"
                                    : "bg-accent text-accent-foreground hover:opacity-90"
                                }`}
                              >
                                {busy && (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                )}
                                Sí
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setConfirmando(null)}
                                className="rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-foreground"
                              >
                                No
                              </button>
                            </div>
                          ) : habilitada ? (
                            <button
                              type="button"
                              title="Quitar acceso"
                              aria-label="Quitar acceso"
                              onClick={() => setConfirmando(c.id)}
                              className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-red-500"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmando(c.id)}
                              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Habilitar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
