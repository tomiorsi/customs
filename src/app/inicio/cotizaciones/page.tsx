import { CotizadorImportacion } from "@/components/cotizador-importacion";
import { getCurrentUser } from "@/lib/auth-server";

export default async function CotizacionesPage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Cotizador de comercio exterior
        </h1>
        <p className="mt-1 text-sm text-muted">
          Elegí importación o exportación, cargá los datos de la operación y
          estimá el costo de nacionalizar o el neto de exportar.
        </p>
      </div>

      <CotizadorImportacion
        ivaCondition={user?.iva_condition ?? null}
        certExencion={user?.cert_exencion ?? null}
      />
    </div>
  );
}
