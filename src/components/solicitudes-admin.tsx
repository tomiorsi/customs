"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Check,
  ClipboardList,
  Globe,
  Loader2,
  X,
} from "lucide-react";
import type { SolicitudData } from "@/lib/onboarding";
import { TZ_AR } from "@/lib/fechas";

type Item = {
  id: string;
  email: string | null;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  submitted_at: string | null;
  meeting: string | null;
  solicitud: SolicitudData | null;
  flags: string[];
};

const REGISTRO_LABEL: Record<string, string> = {
  si: "Inscripto",
  tramite: "En trámite",
  no: "No inscripto",
};

const ANTIGUEDAD_LABEL: Record<string, string> = {
  nueva: "Menos de 6 meses",
  media: "6 meses – 2 años",
  establecida: "Más de 2 años",
};

const TITULARIDAD_LABEL: Record<string, string> = {
  propia: "A nombre propio",
  tercero: "Opera para un tercero",
};

const FINANCIACION_LABEL: Record<string, string> = {
  propio: "Capital propio",
  bancario: "Financiamiento bancario",
  inversor: "Inversor / tercero",
  otro: "Otro",
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ_AR,
  });
}

function usd(n: number | undefined): string {
  if (!n) return "—";
  return `USD ${n.toLocaleString("es-AR")}`;
}

export function SolicitudesAdmin({ solicitudes }: { solicitudes: Item[] }) {
  const router = useRouter();
  const [items, setItems] = useState(solicitudes);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function decidir(userId: string, action: "approve" | "reject", motivoTxt?: string) {
    setError(null);
    setProcesando(userId);
    try {
      const res = await fetch("/api/admin/solicitudes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, motivo: motivoTxt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo procesar.");
        return;
      }
      setItems((xs) => xs.filter((x) => x.id !== userId));
      setRechazando(null);
      setMotivo("");
      router.refresh();
    } catch {
      setError("Error de conexión.");
    } finally {
      setProcesando(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-6 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-accent">
          <ClipboardList className="h-7 w-7" />
        </span>
        <p className="mt-4 text-sm font-medium text-foreground">
          No hay solicitudes pendientes
        </p>
        <p className="mt-1 max-w-sm text-xs text-muted">
          Cuando un cliente complete el formulario y pase el filtro, va a
          aparecer acá para que lo apruebes o rechaces.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      )}
      {items.map((it) => {
        const s = it.solicitud;
        const busy = procesando === it.id;
        return (
          <div
            key={it.id}
            className="rounded-xl border border-border bg-surface p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted" />
                  <span className="text-base font-semibold text-foreground">
                    {s?.razonSocial || it.company_name || "—"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {it.email}
                  {it.phone ? ` · ${it.phone}` : ""}
                  {s?.cuit ? ` · CUIT ${s.cuit}` : ""}
                </p>
              </div>
              <div className="text-right text-xs text-muted">
                <p>Enviada {fmt(it.submitted_at)}</p>
                {it.meeting && (
                  <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-1 font-medium capitalize text-accent">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {fmt(it.meeting)} hs
                  </p>
                )}
              </div>
            </div>

            {it.flags.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Revisar en la videollamada
                </p>
                <ul className="mt-1.5 space-y-1">
                  {it.flags.map((f) => (
                    <li
                      key={f}
                      className="text-xs text-amber-700 dark:text-amber-300"
                    >
                      • {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Dato label="Registro importador">
                {REGISTRO_LABEL[s?.registroImportador ?? ""] ?? "—"}
              </Dato>
              <Dato label="Antigüedad">
                {ANTIGUEDAD_LABEL[s?.antiguedad ?? ""] ?? "—"}
              </Dato>
              <Dato label="Titularidad">
                {TITULARIDAD_LABEL[s?.titularidad ?? ""] ?? "—"}
              </Dato>
              <Dato label="Rubro">{s?.rubro || "—"}</Dato>
              <Dato label="País">{s?.pais || "—"}</Dato>
              <Dato label="Producto">{s?.detalleProducto || "—"}</Dato>
              <Dato label="Proveedor">{s?.proveedor || "—"}</Dato>
              <Dato label="CIF por operación">{usd(s?.cifOperacion)}</Dato>
              <Dato label="Volumen anual">{usd(s?.volumenAnual)}</Dato>
              <Dato label="Financiación">
                {FINANCIACION_LABEL[s?.financiacion ?? ""] ?? "—"}
              </Dato>
              <Dato label="¿Ya importó?">
                {s?.yaImporto === "si" ? "Sí" : s?.yaImporto === "no" ? "No" : "—"}
              </Dato>
              <Dato label="Cómo nos conoció">{s?.comoConocio || "—"}</Dato>
              {s?.web && (
                <Dato label="Web / referencias">
                  <span className="inline-flex items-center gap-1 break-all">
                    <Globe className="h-3.5 w-3.5 shrink-0 text-muted" />
                    {s.web}
                  </span>
                </Dato>
              )}
            </dl>

            {s?.motivoCambio && (
              <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-foreground">
                <span className="text-xs font-medium text-muted">
                  Situación actual:{" "}
                </span>
                {s.motivoCambio}
              </div>
            )}

            {rechazando === it.id ? (
              <div className="mt-4 space-y-2">
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Motivo del rechazo (se le muestra al cliente)…"
                  className="min-h-16 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRechazando(null);
                      setMotivo("");
                    }}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-foreground"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => decidir(it.id, "reject", motivo)}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Confirmar rechazo
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRechazando(it.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-2 disabled:opacity-60"
                >
                  <X className="h-4 w-4" />
                  Rechazar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decidir(it.id, "approve")}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Aceptar y habilitar
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Dato({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-foreground">{children}</dd>
    </div>
  );
}
