import type { ReactNode } from "react";
import Link from "next/link";
import {
  Bell,
  Calendar,
  ChevronRight,
  FileText,
  Package,
} from "lucide-react";
import {
  type DocumentRow,
  type OperationRow,
  type OperationWithClient,
} from "@/lib/data";
import { progresoDocs } from "@/lib/docs";
import { rutaOperacion } from "@/lib/ruta-operacion";
import { estadoLabel } from "@/lib/estados";
import { etapaIndex, etapasDe } from "@/lib/workflow";
import { aNumero, formatMoneda, formatNumero } from "@/lib/formato";
import { nombreOperacion } from "@/lib/operacion-display";
import { iconoVia, resolverViaUi, VIA_LABEL } from "@/lib/via-ui";
import { PanelDocumentos } from "@/components/panel-documentos";
import { EstadoOperacion } from "@/components/estado-operacion";

/** Cuántos obligatorios están cargados y el total, a partir de los documentos. */
function progreso(tipo: string, docs: DocumentRow[]) {
  return progresoDocs(
    tipo,
    docs.map((d) => d.doc_type),
  );
}

function viaLabelDe(op: OperationRow | OperationWithClient): string | null {
  const canon = resolverViaUi(op.via, op.medio_transporte);
  if (canon) return VIA_LABEL[canon];
  return op.via;
}

export type OperacionItem = {
  op: OperationRow | OperationWithClient;
  docs: DocumentRow[];
  /** Novedades sin ver por el estudio (documentos/mensajes nuevos). Solo vista interna. */
  novedades?: number;
};

type Campo = { label: string; value: string | null; accent?: boolean };

function money(moneda: string | null, valor: string | null): string | null {
  return formatMoneda(moneda, valor);
}

/** Formatea un número crudo en es-AR; si no es numérico, lo deja tal cual. */
function numero(valor: string | null): string | null {
  if (!valor) return null;
  const n = aNumero(valor);
  return n == null ? valor : formatNumero(n);
}

function mostrarPeso(valor: string | null | undefined): string | null {
  const s = String(valor ?? "").trim();
  if (!s) return null;
  if (
    /\b(mt|mts|m\.?t\.?|kg|kilogram|ton|tons|metric ton|lb|lbs)\b/i.test(s)
  ) {
    return s;
  }
  const n = numero(s);
  return n ? `${n} kg` : s;
}

/** Formatea una fecha ISO (YYYY-MM-DD) a algo legible: "15 jul 2026". */
function formatFecha(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Etiqueta de la fecha clave según el tipo: arribo (impo) / embarque (expo). */
function fechaLabel(tipo: string): string {
  return tipo.toLowerCase().startsWith("exp") ? "Embarque" : "Arribo";
}

/**
 * Ordena: primero las de fecha más próxima (arribo/embarque) y al final
 * las que todavía no tienen fecha cargada.
 */
function ordenarPorFecha(items: OperacionItem[]): OperacionItem[] {
  return [...items].sort((a, b) => {
    const fa = a.op.eta ?? "";
    const fb = b.op.eta ?? "";
    if (fa && fb) return fa.localeCompare(fb);
    if (fa) return -1;
    if (fb) return 1;
    return 0;
  });
}

/** Paso interno actual de la operación (índice 1-based, total y etiqueta). */
function pasoDe(op: OperationRow): { n: number; total: number; label: string } {
  const etapas = etapasDe(op.tipo, {
    incoterm: op.incoterm,
    via: op.via,
    liberacion: op.liberacion_doc,
    formaPago: op.forma_pago,
  });
  const i = etapaIndex(op.etapa);
  const etapa = etapas[i] ?? etapas[0];
  return { n: i + 1, total: etapas.length, label: etapa?.label ?? "—" };
}

function clienteDe(
  op: OperationRow | OperationWithClient,
  showClient: boolean,
): string | null {
  if (showClient && "company_name" in op) {
    return op.company_name ?? op.client_email ?? "—";
  }
  return null;
}

/* ─────────────────── Lista compacta (clickeable) ─────────────────── */

export function OperacionesLista({
  items,
  showClient = false,
  interno = false,
  basePath = "/inicio/operaciones",
}: {
  items: OperacionItem[];
  showClient?: boolean;
  /** Vista del estudio: muestra el paso interno + novedades en vez del estado del cliente. */
  interno?: boolean;
  basePath?: string;
}) {
  return (
    <ul className="space-y-3">
      {ordenarPorFecha(items).map(({ op, docs, novedades }) => {
        const Via = iconoVia(op.via, op.medio_transporte);
        const titulo = nombreOperacion(op);
        const cliente = clienteDe(op, showClient);
        const { completos, total } = progreso(op.tipo, docs);
        const docsCompletos = completos === total;
        const fecha = formatFecha(op.eta);
        const paso = interno ? pasoDe(op) : null;
        const hayNovedades = interno && (novedades ?? 0) > 0;

        return (
          <li key={op.id}>
            <Link
              href={`${basePath}/${op.id}`}
              className="group neon-top hover-lift block overflow-hidden rounded-2xl border border-border bg-surface/80 backdrop-blur-sm hover:border-accent/40"
            >
              <div className="flex items-center gap-4 px-5 py-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent ring-1 ring-accent/20">
                  <Via className="h-5 w-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-foreground">
                    {titulo}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                      {op.tipo}
                    </span>
                    {viaLabelDe(op) && (
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                        {viaLabelDe(op)}
                      </span>
                    )}
                    {cliente && (
                      <span className="truncate text-xs font-medium text-foreground">
                        {cliente}
                      </span>
                    )}
                    {fecha && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                        <Calendar className="h-3.5 w-3.5 text-accent" />
                        {fechaLabel(op.tipo)}: {fecha}
                      </span>
                    )}
                  </div>
                </div>

                {interno && paso ? (
                  <div className="flex shrink-0 items-center gap-3">
                    {hayNovedades && (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-500 ring-1 ring-inset ring-red-500/30"
                        title="Novedades sin ver: documentos o mensajes nuevos. Abrí la operación para marcarlas como vistas."
                      >
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/70" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                        </span>
                        {novedades} {novedades === 1 ? "novedad" : "novedades"}
                      </span>
                    )}
                    <div className="hidden flex-col items-end gap-1.5 sm:flex">
                      <div className="flex items-baseline gap-2 leading-none">
                        <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
                          Paso {paso.n}/{paso.total}
                        </span>
                        <span className="max-w-[14rem] truncate text-sm font-semibold text-foreground">
                          {paso.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-[3px]">
                        {Array.from({ length: paso.total }).map((_, i) => (
                          <span
                            key={i}
                            className={`h-1.5 rounded-full transition-all ${
                              i < paso.n
                                ? "w-5 bg-gradient-to-r from-accent/70 to-accent shadow-[0_0_6px_-1px] shadow-accent/60"
                                : "w-2.5 bg-surface-2"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3.5 py-1.5 text-sm font-semibold text-accent sm:inline-flex">
                      <span className="h-2 w-2 rounded-full bg-accent" />
                      {estadoLabel(op.estado)}
                    </span>

                    <span
                      className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        docsCompletos
                          ? "bg-accent-soft text-accent"
                          : "bg-surface-2 text-muted"
                      }`}
                      title={`${completos} de ${total} documentos obligatorios cargados`}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {completos}/{total}
                    </span>
                  </>
                )}

                <ChevronRight className="h-5 w-5 shrink-0 text-muted transition-colors group-hover:text-accent" />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ─────────────────────── Detalle de una operación ─────────────────────── */

function Seccion({ titulo, campos }: { titulo: string; campos: Campo[] }) {
  const visibles = campos.filter((c) => c.value);
  if (visibles.length === 0) return null;
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
          {titulo}
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-3">
        {visibles.map((c) => (
          <div key={c.label} className="max-w-full">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">
              {c.label}
            </dt>
            <dd
              className={`mt-0.5 text-sm break-words ${
                c.accent
                  ? "font-semibold text-accent"
                  : "font-normal text-foreground"
              }`}
              title={c.value!}
            >
              {c.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function OperacionDetalle({
  op,
  docs,
  showClient = false,
  editableEstado = false,
  acciones,
  seguimiento,
}: {
  op: OperationRow | OperationWithClient;
  docs: DocumentRow[];
  showClient?: boolean;
  editableEstado?: boolean;
  acciones?: ReactNode;
  /**
   * Si se pasa, el cuerpo se divide en dos columnas: a la izquierda los datos
   * de la operación y a la derecha este panel de seguimiento (estilo CRM).
   * Cuando se usa, NO se renderiza el seguimiento interno (lo trae el panel).
   */
  seguimiento?: ReactNode;
}) {
  const Via = iconoVia(op.via, op.medio_transporte);
  const titulo = nombreOperacion(op);
  const cliente = clienteDe(op, showClient);
  const esExpo = op.tipo.toLowerCase().startsWith("exp");

  const general: Campo[] = [
    {
      label: esExpo ? "Comprador" : "Proveedor",
      value: op.contraparte,
    },
    { label: "Aduana", value: op.aduana },
    { label: "País de origen", value: op.pais_origen },
    { label: "Procedencia", value: op.pais_procedencia },
    { label: "País de adquisición", value: op.pais_adquisicion },
    { label: "País de destino", value: op.pais_destino },
  ];

  const mercaderia: Campo[] = [
    { label: "Descripción", value: op.mercaderia },
    { label: "NCM", value: op.ncm },
    { label: "Marca", value: op.marca },
    { label: "Estado", value: op.estado_merc },
    {
      label: "Cantidad",
      value: op.cantidad && op.unidad
        ? `${numero(op.cantidad)} ${op.unidad}`
        : numero(op.cantidad),
    },
    { label: "Bultos", value: numero(op.bultos) },
    { label: "Embalaje", value: op.tipo_embalaje },
    { label: "Peso neto", value: mostrarPeso(op.peso_neto) },
    { label: "Peso bruto", value: mostrarPeso(op.peso_bruto) },
  ];

  const valoracion: Campo[] = [
    { label: "Incoterm", value: op.incoterm },
    { label: "Valor factura", value: money(op.moneda, op.valor_factura) },
    { label: "Valor FOB", value: money(op.moneda, op.valor_fob) },
    { label: "Valor CIF", value: money(op.moneda, op.valor_cif), accent: true },
    { label: "Gastos en origen", value: money(op.moneda, op.gastos_origen) },
    { label: "Gastos en destino", value: money(op.moneda, op.gastos_destino) },
    { label: "Flete", value: money(op.moneda, op.flete) },
    { label: "Seguro", value: money(op.moneda, op.seguro) },
    { label: "Forma de pago", value: op.forma_pago },
  ];

  const transporte: Campo[] = [
    { label: "Transporte", value: op.medio_transporte },
    { label: "Transportista", value: op.transportista },
    { label: "N° documento", value: op.transporte_doc_nro },
    { label: "Ruta", value: rutaOperacion(op) },
    { label: "Tipo de carga", value: op.tipo_carga },
    { label: "Contenedor", value: op.contenedor },
    { label: "Paso fronterizo", value: op.paso_frontera },
    { label: "ETA / ETD", value: op.eta },
  ];

  return (
    <div className="neon-top overflow-hidden rounded-2xl border border-border bg-surface/80 backdrop-blur-sm">
      {/* Encabezado */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-surface-2/40 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent ring-1 ring-accent/20">
            <Via className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground sm:text-lg">
              {titulo}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                {op.tipo}
              </span>
              {viaLabelDe(op) && (
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                  {viaLabelDe(op)}
                </span>
              )}
              {cliente && (
                <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground">
                  <span className="text-muted/50">·</span>
                  <span className="truncate">{cliente}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        {acciones && <div className="shrink-0">{acciones}</div>}
      </div>

      {(() => {
        const datos = (
          <>
            <Seccion titulo="General" campos={general} />
            <Seccion titulo="Mercadería" campos={mercaderia} />
            <Seccion titulo="Valoración" campos={valoracion} />
            <Seccion titulo="Transporte" campos={transporte} />

            {op.detalle && (
              <div className="rounded-xl border border-border bg-surface-2/40 px-4 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  Observaciones
                </p>
                <p className="mt-1 text-sm text-foreground">{op.detalle}</p>
              </div>
            )}

            {/* Documentos */}
            <div>
              <div className="mb-2.5 flex items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              Documentos
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
          </div>
              <PanelDocumentos
                operationId={op.id}
                tipo={op.tipo}
                via={op.via}
                docs={docs}
                puedeReclasificar={editableEstado}
              />
            </div>
          </>
        );

        // Layout CRM: datos a la izquierda, seguimiento (pasos + timeline) a la derecha.
        if (seguimiento) {
          return (
            <div className="grid gap-5 px-5 py-4 lg:grid-cols-10 lg:items-start">
              <div className="space-y-4 lg:col-span-4">{datos}</div>
              <div className="space-y-4 lg:col-span-6 lg:sticky lg:top-4">
                {seguimiento}
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-4 px-5 py-4">
            <EstadoOperacion
              operationId={op.id}
              estado={op.estado}
              tipo={op.tipo}
              via={op.via}
              medioTransporte={op.medio_transporte}
              editable={editableEstado}
            />
            {datos}
          </div>
        );
      })()}
    </div>
  );
}
