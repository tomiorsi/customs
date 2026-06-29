import { notFound } from "next/navigation";
import { Package, Plane, Ship, Truck, type LucideIcon } from "lucide-react";
import {
  getDocumentsByOperation,
  getMensajesByParticipante,
  getOperationById,
  getParticipanteByToken,
} from "@/lib/data";
import { Brand } from "@/components/brand";
import { ParticipantePanel } from "@/components/participante-panel";
import { nombreOperacion } from "@/lib/operacion-display";

export const dynamic = "force-dynamic";

const viaIcon: Record<string, LucideIcon> = {
  maritima: Ship,
  aerea: Plane,
  terrestre: Truck,
};

const viaLabel: Record<string, string> = {
  maritima: "Sea",
  aerea: "Air",
  terrestre: "Road",
};

function tipoLabel(tipo: string): string {
  return tipo.toLowerCase().startsWith("exp") ? "Export" : "Import";
}

export default async function ParticipantePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const participante = getParticipanteByToken(token);
  if (!participante) notFound();

  const op = await getOperationById(participante.operation_id);
  if (!op) notFound();

  const docs = await getDocumentsByOperation(op.id, op.user_id);
  const mensajes = getMensajesByParticipante(participante.id);
  const titulo = nombreOperacion(op);
  const Via = (op.via && viaIcon[op.via]) || Package;

  return (
    <main className="mx-auto min-h-full w-full max-w-6xl px-4 py-5 sm:py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Brand size="md" />
        <span className="rounded-full border border-border bg-surface-2/60 px-3 py-1 text-[11px] font-medium text-muted">
          Participant access
        </span>
      </div>

      <div className="neon-top overflow-hidden rounded-2xl border border-border bg-surface/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 border-b border-border bg-surface-2/40 px-5 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent ring-1 ring-accent/20">
            <Via className="h-[18px] w-[18px]" />
          </span>
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <p className="shrink-0 truncate text-sm font-semibold text-foreground">
              {op.company_name || titulo}
            </p>
            {op.company_name && (
              <span className="truncate text-xs font-medium text-muted">
                {titulo}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
              {tipoLabel(op.tipo)}
            </span>
            {op.via && (
              <span className="hidden rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted sm:inline">
                {viaLabel[op.via] ?? op.via}
              </span>
            )}
          </div>
        </div>

        <div className="px-5 py-5">
          <ParticipantePanel
            token={token}
            tipo={op.tipo}
            via={op.via}
            docs={docs}
            mensajes={mensajes}
          />
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        If you have any questions, just reply here. This link is personal —
        please don&apos;t share it.
      </p>
    </main>
  );
}
