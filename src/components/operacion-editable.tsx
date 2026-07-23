"use client";

import { useState } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import type { DocumentRow, EventoRow, OperationRow } from "@/lib/data";
import { OperacionDetalle } from "@/components/operaciones-lista";
import { EditarOperacionForm } from "@/components/editar-operacion-form";
import { OperacionMenu } from "@/components/operacion-menu";
import { SeguimientoOperacion } from "@/components/seguimiento-operacion";

export function OperacionEditable({
  op,
  docs,
  eventos = [],
  completo = false,
  volverHref,
  showClient = false,
  editableEstado = false,
  soloNombre = false,
}: {
  op: OperationRow;
  docs: DocumentRow[];
  eventos?: EventoRow[];
  completo?: boolean;
  volverHref?: string;
  showClient?: boolean;
  editableEstado?: boolean;
  /** Modo cliente: sólo puede editar el nombre (su alias) y no eliminar. */
  soloNombre?: boolean;
}) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <EditarOperacionForm
        op={op}
        completo={completo}
        soloNombre={soloNombre}
        onDone={() => setEditando(false)}
      />
    );
  }

  return (
    <OperacionDetalle
      op={op}
      docs={docs}
      showClient={showClient}
      editableEstado={editableEstado}
      acciones={
        <div className="flex items-center gap-2">
          {/* Solo el estudio (equipo) entra a la mesa de trabajo de la operación. */}
          {editableEstado && (
            <Link
              href={`/admin/operaciones/${op.id}/mesa`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
            >
              <ListChecks className="h-[18px] w-[18px]" />
              <span className="hidden sm:inline">Ir al despacho</span>
            </Link>
          )}
          <OperacionMenu
            operationId={op.id}
            onEditar={() => setEditando(true)}
            volverHref={volverHref}
            soloNombre={soloNombre}
          />
        </div>
      }
      seguimiento={
        <SeguimientoOperacion
          op={op}
          eventos={eventos}
          modo={editableEstado ? "empleado" : "general"}
        />
      }
    />
  );
}
