"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Check, KeyRound, Loader2, Pencil, Search, Shield, ShieldAlert, ShieldCheck, TriangleAlert, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ClientRow } from "@/lib/data";
import { estadoCartaGarantia, formatVence } from "@/lib/carta-garantia";
import { AccesoCliente } from "@/components/acceso-cliente";

/** Input compacto para la edición inline de una celda. */
const CELL_INPUT =
  "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

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

export function ClientsTable({
  clients,
  action,
}: {
  clients: ClientRow[];
  action?: React.ReactNode;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
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
  const [cartaPos, setCartaPos] = useState<{ top: number; right: number } | null>(
    null,
  );
  const [guardandoCarta, setGuardandoCarta] = useState<string | null>(null);

  // Fila cuyo panel de acceso está abierto. El acceso se administra acá, en la
  // misma pantalla donde vive el cliente.
  const [accesoAbierto, setAccesoAbierto] = useState<string | null>(null);

  // Edición inline de una fila (razón social, CUIT, email, teléfono).
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    company_name: "",
    cuit: "",
    email: "",
    phone: "",
  });
  const [guardandoEdit, setGuardandoEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function abrirEdit(c: ClientRow) {
    setEditError(null);
    setEditandoId(c.id);
    setEditForm({
      company_name: c.company_name ?? "",
      cuit: c.cuit ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
    });
  }

  async function guardarEdit(id: string) {
    setGuardandoEdit(true);
    setEditError(null);
    try {
      const res = await fetch("/api/admin/clientes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          companyName: editForm.company_name,
          cuit: editForm.cuit,
          email: editForm.email,
          phone: editForm.phone,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(data.error ?? "No se pudo guardar.");
        return;
      }
      setEditandoId(null);
      router.refresh();
    } catch {
      setEditError("Error de conexión.");
    } finally {
      setGuardandoEdit(false);
    }
  }

  function abrirCarta(e: React.MouseEvent<HTMLButtonElement>, id: string) {
    if (editandoCarta === id) {
      setEditandoCarta(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setCartaPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setEditandoCarta(id);
  }

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por razón social, email o CUIT…"
            className="w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
        </div>
        {action}
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
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[23%]" />
                <col className="w-[15%]" />
                <col className="w-[25%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
                <col className="w-[9%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Empresa</th>
                  <th className="px-5 py-3 font-medium">CUIT</th>
                  <th className="px-5 py-3 font-medium">Contacto</th>
                  <th className="px-5 py-3 text-right font-medium">Operaciones</th>
                  <th className="px-5 py-3 font-medium">Carta de garantía</th>
                  <th className="px-5 py-3 text-right font-medium sr-only">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtrados.map((c) => {
                  const editando = editandoId === c.id;
                  return (
                  <Fragment key={c.id}>
                  <tr className="transition-colors hover:bg-surface-2">
                    <td className="px-5 py-3.5 align-top">
                      {editando ? (
                        <input
                          value={editForm.company_name}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, company_name: e.target.value }))
                          }
                          placeholder="Razón social"
                          className={CELL_INPUT}
                        />
                      ) : (
                        <>
                          <Link
                            href={`/admin/clientes/${c.id}/editar`}
                            title="Ver / editar cliente"
                            className="block truncate text-base font-semibold text-foreground transition-colors hover:text-accent"
                          >
                            {c.company_name ?? "—"}
                          </Link>
                          {/* El hueco se descubría tarde: recién al generar el
                              archivo, con la carpeta ya armada. Acá se ve
                              antes de necesitarlo, y el enlace lleva justo a
                              donde se completa. */}
                          {c.faltan_datos_declaracion && (
                            <Link
                              href={`/admin/clientes/${c.id}/editar`}
                              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 transition-opacity hover:opacity-80 dark:text-amber-400"
                            >
                              <TriangleAlert className="h-3 w-3 shrink-0" />
                              Faltan sus datos para declarar
                            </Link>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-5 py-3.5 align-top">
                      {editando ? (
                        <input
                          value={editForm.cuit}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, cuit: e.target.value }))
                          }
                          placeholder="CUIT"
                          inputMode="numeric"
                          className={CELL_INPUT}
                        />
                      ) : (
                        <span className="block truncate tabular-nums text-foreground">
                          {c.cuit ?? "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 align-top">
                      {editando ? (
                        <div className="space-y-1.5">
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, email: e.target.value }))
                            }
                            placeholder="Email"
                            autoCapitalize="none"
                            className={CELL_INPUT}
                          />
                          <input
                            value={editForm.phone}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, phone: e.target.value }))
                            }
                            placeholder="Teléfono"
                            className={CELL_INPUT}
                          />
                          {editError && (
                            <p className="text-xs text-red-500">{editError}</p>
                          )}
                        </div>
                      ) : (
                        <>
                          <p className="truncate text-foreground">{c.email ?? "—"}</p>
                          <p className="truncate text-xs text-muted">
                            {c.phone ?? "Sin teléfono"}
                          </p>
                        </>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right align-top">
                      <p className="font-medium text-foreground">
                        {c.opsActivas} activa{c.opsActivas === 1 ? "" : "s"}
                      </p>
                      <p className="text-xs text-muted">
                        {c.opsCerradas} cerrada{c.opsCerradas === 1 ? "" : "s"}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 align-top">
                      {(() => {
                        const carta = cartas[c.id] ?? {
                          tipo: c.carta_garantia,
                          vence: c.carta_garantia_vence,
                        };
                        const info = cartaInfo(carta.tipo, carta.vence);
                        const Icon = info.Icon;
                        return (
                          <button
                            type="button"
                            title="Cambiar estado de la carta de garantía"
                            onClick={(e) => abrirCarta(e, c.id)}
                            className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80 ${info.cls}`}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{info.text}</span>
                          </button>
                        );
                      })()}
                    </td>
                    <td className="px-5 py-3.5 text-right align-top">
                      {editando ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            title="Guardar"
                            disabled={guardandoEdit}
                            onClick={() => guardarEdit(c.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                          >
                            {guardandoEdit ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            title="Cancelar"
                            disabled={guardandoEdit}
                            onClick={() => setEditandoId(null)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-60"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            title={
                              c.portal_habilitado === "1"
                                ? "Cambiar acceso al portal"
                                : "Dar acceso al portal"
                            }
                            aria-expanded={accesoAbierto === c.id}
                            onClick={() =>
                              setAccesoAbierto((a) => (a === c.id ? null : c.id))
                            }
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-2 ${
                              c.portal_habilitado === "1"
                                ? "text-accent"
                                : "text-muted hover:text-accent"
                            }`}
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Editar datos"
                            onClick={() => abrirEdit(c)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-accent"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {accesoAbierto === c.id && (
                    <tr>
                      <td colSpan={99} className="bg-surface-2/30 px-5 py-4">
                        <AccesoCliente
                          clienteId={c.id}
                          nombre={c.company_name ?? "este cliente"}
                          emailActual={c.email}
                          tieneAcceso={c.portal_habilitado === "1"}
                          onCerrar={() => setAccesoAbierto(null)}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editandoCarta && cartaPos && (() => {
        const carta = cartas[editandoCarta] ?? { tipo: null, vence: null };
        const tipoActual = (carta.tipo ?? "no").toLowerCase();
        const busy = guardandoCarta === editandoCarta;
        const opciones: { tipo: "anual" | "puntual" | "no"; label: string }[] = [
          { tipo: "anual", label: "Anual" },
          { tipo: "puntual", label: "Por operación" },
          { tipo: "no", label: "Sin carta" },
        ];
        return (
          <>
            {/* Capa transparente para cerrar el popover al tocar fuera. */}
            <button
              type="button"
              aria-label="Cerrar"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setEditandoCarta(null)}
            />
            <div
              role="menu"
              className="fixed z-50 w-52 rounded-lg border border-border bg-surface p-1 shadow-lg"
              style={{ top: cartaPos.top, right: cartaPos.right }}
            >
              {opciones.map((o) => {
                const activo = tipoActual === o.tipo;
                return (
                  <button
                    key={o.tipo}
                    type="button"
                    disabled={busy}
                    onClick={() => guardarCarta(editandoCarta, o.tipo)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors disabled:opacity-60 ${
                      activo
                        ? "bg-accent-soft font-medium text-foreground"
                        : "text-foreground hover:bg-surface-2"
                    }`}
                  >
                    {o.label}
                    {activo && !busy && (
                      <Check className="h-4 w-4 shrink-0 text-accent" />
                    )}
                    {busy && activo && (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" />
                    )}
                  </button>
                );
              })}
            </div>
          </>
        );
      })()}
    </div>
  );
}
