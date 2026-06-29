import type { LucideIcon } from "lucide-react";

export function Proximamente({
  icon: Icon,
  titulo,
  descripcion,
}: {
  icon: LucideIcon;
  titulo: string;
  descripcion: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {titulo}
        </h1>
        <p className="mt-1 text-sm text-muted">{descripcion}</p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-20 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-accent">
          <Icon className="h-7 w-7" />
        </span>
        <p className="mt-4 text-sm font-medium text-foreground">
          Módulo en construcción
        </p>
        <p className="mt-1 max-w-xs text-xs text-muted">
          Esta sección es parte del MVP de Fase 1 y se habilitará próximamente.
        </p>
      </div>
    </div>
  );
}
