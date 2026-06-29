import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, ClipboardList, Plus, Ship, XCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth-server";
import { getDocumentsByOperation, getOperationsByUser } from "@/lib/data";
import { TZ_AR } from "@/lib/fechas";
import {
  OperacionesLista,
  type OperacionItem,
} from "@/components/operaciones-lista";

export const dynamic = "force-dynamic";

function formatoSlot(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ_AR,
  });
}

export default async function OperacionesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const estado = user.op_status ?? "none";

  // ── Gate: hasta que el estudio no apruebe la cuenta, no se ve la lista ──
  if (estado !== "approved") {
    if (estado === "submitted") {
      const meeting = user.op_meeting_at;
      return (
        <Aviso
          icon={<CalendarClock className="h-7 w-7" />}
          titulo="Tu solicitud está en revisión"
          tono="accent"
        >
          <p className="mt-1 max-w-md text-sm text-muted">
            Recibimos tu información y la estamos revisando. La videollamada
            queda sujeta a confirmación: si el perfil encaja, te confirmamos la
            llamada por mail; si no, te avisamos por el mismo medio que por ahora
            no podemos avanzar.
          </p>
          {meeting ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium capitalize text-foreground">
              <CalendarClock className="h-4 w-4 text-accent" />
              Horario propuesto: {formatoSlot(meeting)} hs (a confirmar)
            </p>
          ) : (
            <Link
              href="/inicio/operaciones/solicitud"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90"
            >
              <CalendarClock className="h-4 w-4" />
              Proponer horario de videollamada
            </Link>
          )}
        </Aviso>
      );
    }

    if (estado === "rejected") {
      return (
        <Aviso
          icon={<XCircle className="h-7 w-7" />}
          titulo="Por ahora no podemos avanzar"
          tono="danger"
        >
          <p className="mt-1 max-w-md text-sm text-muted">
            {user.op_rejection_reason ??
              "Tras revisar tu solicitud, por ahora no es el perfil que podemos atender."}
          </p>
          <Link
            href="/inicio/operaciones/solicitud"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-2"
          >
            <ClipboardList className="h-4 w-4" />
            Volver a postular
          </Link>
        </Aviso>
      );
    }

    // estado === "none"
    return (
      <Aviso
        icon={<ClipboardList className="h-7 w-7" />}
        titulo="Antes de operar, conozcámonos"
        tono="accent"
      >
        <p className="mt-1 max-w-md text-sm text-muted">
          El cotizador es libre. Para abrir importaciones y exportaciones con el
          estudio, primero completá un formulario corto de calificación. Si
          encaja, agendamos una videollamada y habilitamos tu cuenta.
        </p>
        <Link
          href="/inicio/operaciones/solicitud"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90"
        >
          <ClipboardList className="h-4 w-4" />
          Completar formulario
        </Link>
      </Aviso>
    );
  }

  // ── Cliente aprobado: lista normal ──
  const ops = await getOperationsByUser(user.id);
  const items: OperacionItem[] = await Promise.all(
    ops.map(async (op) => ({
      op,
      docs: await getDocumentsByOperation(op.id, user.id),
    })),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Mis operaciones
          </h1>
          <p className="mt-1 text-sm text-muted">
            Cargá una nueva importación o exportación y seguí su estado y
            documentación.
          </p>
        </div>
        <Link
          href="/inicio/operaciones/nueva"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <Plus className="h-4 w-4" />
          Nueva impo / expo
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-accent">
            <Ship className="h-7 w-7" />
          </span>
          <p className="mt-4 text-sm font-medium text-foreground">
            Todavía no tenés operaciones
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted">
            ¿Compraste algo afuera? Abrí una nueva operación y, si ya los tenés,
            adjuntá la factura comercial, el packing list y el documento de
            transporte.
          </p>
          <Link
            href="/inicio/operaciones/nueva"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Cargar mi primera operación
          </Link>
        </div>
      ) : (
        <OperacionesLista items={items} />
      )}
    </div>
  );
}

function Aviso({
  icon,
  titulo,
  tono,
  children,
}: {
  icon: React.ReactNode;
  titulo: string;
  tono: "accent" | "danger";
  children: React.ReactNode;
}) {
  const colorIcono =
    tono === "danger"
      ? "bg-red-500/10 text-red-500"
      : "bg-surface-2 text-accent";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Operaciones
      </h1>
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-6 py-16 text-center">
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-2xl ${colorIcono}`}
        >
          {icon}
        </span>
        <p className="mt-4 text-lg font-semibold text-foreground">{titulo}</p>
        {children}
      </div>
    </div>
  );
}
