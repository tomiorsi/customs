"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Info,
  Loader2,
  Plane,
  Search,
  Send,
  Ship,
  Sparkles,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  claveSubtarea,
  estadoClienteDeEtapa,
  indiceDeEtapa,
  etapasDe,
  gruposDeEtapa,
  parseChecklist,
  progresoEtapa,
} from "@/lib/workflow";
import {
  derivarEstadoExpediente,
  etiquetaEstado,
} from "@/lib/clasificador/estado";
import {
  docsRelevantesIA,
  type DocType,
} from "@/lib/docs";
import { LiquidacionPanel } from "@/components/liquidacion-panel";
import { FichaMalvinaPanel } from "@/components/ficha-malvina-panel";
import { PresimPanel } from "@/components/presim-panel";
import { ProductosCarpeta } from "@/components/productos-carpeta";
import { ncmPareceGeneral } from "@/lib/formato";

export type MesaOp = {
  id: string;
  ref: string;
  titulo: string;
  tipo: string;
  /** Destinación aduanera: define qué etapas tiene el paso a paso. */
  destinacion: string | null;
  via: string | null;
  incoterm: string | null;
  liberacion: string | null;
  formaPago: string | null;
  /** Fecha de emisión de la factura (ISO). */
  fechaFactura: string | null;
  plazoPagoDias: string | null;
  fechaVencimientoPago: string | null;
  /** País de adquisición (quien factura en triangulación). */
  paisAdquisicion: string | null;
  paisOrigen: string | null;
  cliente: string;
  etapa: string;
  estado: string;
  checklist: string | null;
  docs: number;
  ncm: string | null;
  eta: string | null;
  /** Descripción de la mercadería (base para clasificar). */
  mercaderia: string | null;
  /** "si" = primera vez con este producto (clasificar) / "no" = repetido (NCM conocida). */
  primeraVez: string | null;
  /**
   * JSON con los hallazgos automáticos de la IA por documento subido (mapa
   * docType -> { doc, etapa, resumen, at, hallazgos }). Se muestran como alerta
   * fija en el paso correspondiente, sin tocar "Validar documentación".
   */
  hallazgosIA: string | null;
  /**
   * JSON con el resultado de «Validar documentación» por etapa (mapa
   * etapa -> { at, resultado:DocumentacionIA }).
   */
  validacionIA: string | null;
};

const viaIcon: Record<string, LucideIcon> = {
  maritima: Ship,
  aerea: Plane,
  terrestre: Truck,
};

/* ── Resultado de la IA de apertura (espejo cliente de lib/ia-documentos) ── */

type AlertaIA = { nivel: "ok" | "warn" | "error"; texto: string };

/** Hallazgo automático persistido por documento (espejo de lib/data). */
type HallazgoEntry = {
  doc: string;
  etapa: string;
  resumen: string;
  at: string;
  hallazgos: AlertaIA[];
};

/**
 * Hallazgos automáticos (los que dejó la IA al subir cada documento) que
 * corresponde mostrar en el paso `etapaId`: los documentos relevantes de esa
 * etapa que tengan hallazgos o al menos un resumen de lectura. Se ordenan del
 * más nuevo al más viejo.
 */
function hallazgosDelPaso(
  raw: string | null,
  etapaId: string,
): { docType: string; entry: HallazgoEntry }[] {
  if (!raw) return [];
  let mapa: Record<string, HallazgoEntry>;
  try {
    mapa = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!mapa || typeof mapa !== "object") return [];
  const relevantes = docsRelevantesIA(etapaId);
  return Object.entries(mapa)
    .filter(
      ([dt, e]) =>
        e &&
        Array.isArray(e.hallazgos) &&
        e.hallazgos.length > 0 &&
        (e.etapa === etapaId ||
          relevantes.has(dt as DocType) ||
          dt === "otro"),
    )
    .map(([docType, entry]) => ({ docType, entry }))
    .sort((a, b) => (a.entry.at < b.entry.at ? 1 : -1));
}

/** Fusiona resultados de validación IA por etapa en el JSON persistido. */
function mergeValidacionIA(
  current: string | null,
  updates: { etapa: string; resultado: DocumentacionIA }[],
): string {
  let mapa: Record<string, { at: string; resultado: unknown }> = {};
  try {
    const parsed = JSON.parse(current ?? "{}");
    if (parsed && typeof parsed === "object") mapa = parsed;
  } catch {
    /* vacío */
  }
  const at = new Date().toISOString();
  for (const u of updates) {
    mapa[u.etapa] = { at, resultado: u.resultado };
  }
  return JSON.stringify(mapa);
}

/**
 * Caja de alertas FIJAS del paso: lo que la IA detectó automáticamente al subir
 * cada documento (transbordo, marca de agua DRAFT, vencimientos, etc.). Aparece
 * sin tocar «Validar documentación»; ese botón vuelve a analizar todo cruzado.
 */
function HallazgosPaso({
  items,
  className = "mt-2",
}: {
  items: { docType: string; entry: HallazgoEntry }[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div
      className={`space-y-2 rounded-lg border border-accent/40 bg-surface px-3 py-2 ${className}`}
    >
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
        <Sparkles className="h-3 w-3" />
        Detectado al subir documentos (este paso)
      </p>
      {items.map(({ docType, entry }) => (
        <div key={docType} className="space-y-1">
          <p className="text-[11px] font-semibold text-foreground">{entry.doc}</p>
          {entry.resumen ? (
            <p className="text-[11px] leading-relaxed text-foreground/80">
              {entry.resumen}
            </p>
          ) : null}
          <ul className="space-y-1">
            {entry.hallazgos.map((a, i) => {
              const Icon = ALERTA_ICON[a.nivel] ?? Info;
              return (
                <li key={i} className="flex items-start gap-1.5">
                  <Icon
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${ALERTA_COLOR[a.nivel] ?? "text-muted"}`}
                  />
                  <span className="text-[11px] leading-relaxed text-foreground/90">
                    {a.texto}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

type EstadoComparacion =
  | "igual"
  | "difiere"
  | "solo_cliente"
  | "solo_documento";

type CampoComparado = {
  campo: string;
  label: string;
  cliente: string;
  documento: string;
  estado: EstadoComparacion;
};

type AperturaIA = {
  tipo_documento:
    | "pedido_compra"
    | "proforma"
    | "factura_comercial"
    | "desconocido";
  resumen: string;
  campos: Record<string, string>;
  comparacion?: CampoComparado[];
  cruce_packing?: string | null;
  alertas: AlertaIA[];
};

// Orden y etiquetas legibles para los campos que extrae la IA.
const CAMPO_LABEL: Record<string, string> = {
  contraparte: "Proveedor / Vendedor",
  pais_origen: "País de origen (producción)",
  pais_adquisicion: "País de adquisición (factura)",
  via: "Vía (define el paso a paso)",
  mercaderia: "Mercadería",
  ncm: "NCM (del documento)",
  marca: "Marca",
  cantidad: "Cantidad",
  unidad: "Unidad",
  bultos: "Bultos",
  tipo_embalaje: "Embalaje",
  peso_neto: "Peso neto",
  peso_bruto: "Peso bruto",
  volumen_cbm: "Volumen (m³)",
  incoterm: "Incoterm",
  moneda: "Moneda",
  valor_factura: "Valor factura",
  flete: "Flete",
  seguro: "Seguro",
  forma_pago: "Forma de pago",
  liberacion_doc: "Liberación del transporte",
  contenedor: "Contenedor (nros.)",
  tipo_contenedor: "Tipo de contenedor",
  cantidad_contenedores: "Cant. contenedores",
};

const TIPO_DOC_LABEL: Record<string, string> = {
  pedido_compra: "Pedido / Orden de compra",
  proforma: "Factura proforma",
  factura_comercial: "Factura comercial",
  desconocido: "Documento comercial",
};

/* ── Resultado de la IA de documentación (Paso 2) ── */

type TramiteIA = { nombre: string | null; link: string | null };

type IntervencionIA = {
  organismo: string;
  motivo: string;
  nivel: "requerida" | "verificar";
  resumen?: string | null;
  tramites?: TramiteIA[];
};

type DocumentacionIA = {
  estado: "completa" | "incompleta" | "inconsistente";
  listo_para_oficializar: boolean;
  resumen: string;
  faltantes: { doc: string; motivo: string }[];
  inconsistencias: string[];
  intervenciones: IntervencionIA[];
  regimenes?: IntervencionIA[];
  intervenciones_fuente?: "vuce" | "sin_ncm";
  alertas: AlertaIA[];
  mensaje_cliente: string;
  pago?: {
    forma_pago?: string;
    liberacion_doc?: string;
    fecha_factura?: string;
    plazo_pago_dias?: string;
  } | null;
  logistica?: {
    transbordo?: boolean;
    puerto_transbordo?: string;
  } | null;
};

function aplicarToggle(raw: string | null, clave: string, done: boolean): string {
  let obj: Record<string, { at: string; by: string | null }> = {};
  if (raw) {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = {};
    }
  }
  if (done) obj[clave] = { at: new Date().toISOString(), by: null };
  else delete obj[clave];
  return JSON.stringify(obj);
}

export function MesaTrabajo({
  items,
  solo = false,
  volverHref,
}: {
  items: MesaOp[];
  /** "solo": abre una única operación, sin buscador ni lista (se entra desde Operaciones). */
  solo?: boolean;
  /** Si se pasa, muestra un enlace "Volver" en el header de la operación. */
  volverHref?: string;
}) {
  const [ops, setOps] = useState<MesaOp[]>(items);
  const [selId, setSelId] = useState<string | null>(
    solo && items[0] ? items[0].id : null,
  );

  useEffect(() => {
    setOps(items);
  }, [items]);
  const [busqueda, setBusqueda] = useState("");
  const [listaAbierta, setListaAbierta] = useState(!solo);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return ops;
    return ops.filter((o) =>
      [o.ref, o.titulo, o.cliente].some((c) => c.toLowerCase().includes(q)),
    );
  }, [ops, busqueda]);

  const sel = ops.find((o) => o.id === selId) ?? null;

  // Handlers de estado local compartidos entre el modo lista y el modo "solo".
  const onChecklist = (clave: string, done: boolean) =>
    setOps((prev) =>
      prev.map((o) =>
        o.id === selId
          ? { ...o, checklist: aplicarToggle(o.checklist, clave, done) }
          : o,
      ),
    );
  const onEtapa = (etapaId: string) =>
    setOps((prev) =>
      prev.map((o) =>
        o.id === selId
          ? { ...o, etapa: etapaId, estado: estadoClienteDeEtapa(etapaId) }
          : o,
      ),
    );
  const onCampos = (campos: Record<string, string>) =>
    setOps((prev) =>
      prev.map((o) =>
        o.id === selId
          ? {
              ...o,
              ncm: campos.ncm ?? o.ncm,
              titulo: campos.titulo || o.titulo,
              via: campos.via ?? o.via,
              incoterm: campos.incoterm ?? o.incoterm,
              liberacion: campos.liberacion_doc ?? o.liberacion,
              formaPago: campos.forma_pago ?? o.formaPago,
              fechaFactura: campos.fecha_factura ?? o.fechaFactura,
              plazoPagoDias: campos.plazo_pago_dias ?? o.plazoPagoDias,
              fechaVencimientoPago:
                campos.fecha_vencimiento_pago ?? o.fechaVencimientoPago,
            }
          : o,
      ),
    );
  const onValidacionIA = (validacionIA: string) =>
    setOps((prev) =>
      prev.map((o) => (o.id === selId ? { ...o, validacionIA } : o)),
    );
  const onOpSync = (opId: string, patch: Partial<MesaOp>) =>
    setOps((prev) =>
      prev.map((o) => (o.id === opId ? { ...o, ...patch } : o)),
    );

  // Modo "solo": directo al panel de la operación, sin buscador ni lista.
  if (solo) {
    if (!sel) {
      return (
        <p className="rounded-2xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
          No se encontró la operación.
        </p>
      );
    }
    return (
      <PanelOperacion
        key={sel.id}
        op={sel}
        onChecklist={onChecklist}
        onEtapa={onEtapa}
        onCampos={onCampos}
        onValidacionIA={onValidacionIA}
        onOpSync={onOpSync}
        volverHref={volverHref}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Buscador (siempre visible). Al enfocarlo se despliega la lista. */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setListaAbierta(true);
          }}
          onFocus={() => setListaAbierta(true)}
          placeholder="Buscar ref, título o cliente…"
          className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent"
        />
      </div>

      {/* Lista de operaciones (se cierra al elegir una). */}
      {listaAbierta && (
        <ul className="max-h-[60vh] space-y-1 overflow-y-auto rounded-2xl border border-border bg-surface p-1.5">
          {filtradas.length === 0 ? (
            <li className="px-3 py-8 text-center text-xs text-muted">
              Sin operaciones.
            </li>
          ) : (
            filtradas.map((o) => {
              const Via = (o.via && viaIcon[o.via]) || FileText;
              const etapas = etapasDe(o.tipo, {
                incoterm: o.incoterm,
                via: o.via,
                liberacion: o.liberacion,
                formaPago: o.formaPago,
                destinacion: o.destinacion,
              });
              const idx = indiceDeEtapa(etapas, o.etapa);
              const def = etapas[idx];
              const activa = o.id === selId;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelId(o.id);
                      setListaAbierta(false);
                    }}
                    className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                      activa
                        ? "bg-accent-soft ring-1 ring-accent/30"
                        : "hover:bg-surface-2/60"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        activa
                          ? "bg-accent text-accent-foreground"
                          : "bg-surface-2 text-accent"
                      }`}
                    >
                      <Via className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {o.titulo}
                        </span>
                        <span className="shrink-0 text-[10px] font-medium text-muted">
                          {o.ref}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted">
                        {o.cliente}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5">
                        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted">
                          {idx + 1}/{etapas.length}
                        </span>
                        <span className="truncate text-[10px] font-medium text-accent">
                          {def.label}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}

      {/* Panel de trabajo de la operación elegida (con la lista cerrada). */}
      {!listaAbierta && sel && (
        <PanelOperacion
          key={sel.id}
          op={sel}
          onChecklist={onChecklist}
          onEtapa={onEtapa}
          onCampos={onCampos}
          onValidacionIA={onValidacionIA}
          onOpSync={onOpSync}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Panel de una operación ───────────────────────── */

function PanelOperacion({
  op,
  onChecklist,
  onEtapa,
  onCampos,
  onValidacionIA,
  onOpSync,
  volverHref,
}: {
  op: MesaOp;
  onChecklist: (clave: string, done: boolean) => void;
  onEtapa: (etapaId: string) => void;
  onCampos: (campos: Record<string, string>) => void;
  onValidacionIA: (validacionIA: string) => void;
  onOpSync: (opId: string, patch: Partial<MesaOp>) => void;
  volverHref?: string;
}) {
  const router = useRouter();

  const sincronizarDesdeServidor = useCallback(async () => {
    try {
      const res = await fetch(`/api/operaciones/${op.id}/mesa-sync`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) return;
      onOpSync(op.id, {
        checklist: json.checklist ?? op.checklist,
        hallazgosIA: json.hallazgosIA ?? op.hallazgosIA,
        validacionIA: json.validacionIA ?? op.validacionIA,
        docs: typeof json.docs === "number" ? json.docs : op.docs,
        etapa: json.etapa ?? op.etapa,
        estado: json.estado ?? op.estado,
        ncm: json.ncm ?? op.ncm,
      });
    } catch {
      /* ignorar */
    }
  }, [onOpSync, op]);

  useEffect(() => {
    let detener = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let prevAnalizando: boolean | null = null;

    async function tick() {
      if (detener) return;
      try {
        const res = await fetch(`/api/operaciones/${op.id}/ia/estado`, {
          cache: "no-store",
        });
        if (res.ok) {
          const e = (await res.json()) as {
            analizando: boolean;
            ultimoFin: string | null;
          };
          if (
            prevAnalizando === true &&
            !e.analizando
          ) {
            await sincronizarDesdeServidor();
            router.refresh();
          }
          prevAnalizando = e.analizando;
        }
      } catch {
        /* ignorar */
      }
      timer = setTimeout(tick, prevAnalizando ? 2500 : 8000);
    }

    void tick();
    return () => {
      detener = true;
      if (timer) clearTimeout(timer);
    };
  }, [op.id, router, sincronizarDesdeServidor]);
  const validacionPorEtapa = useMemo(() => {
    if (!op.validacionIA) return {} as Record<string, DocumentacionIA>;
    try {
      const mapa = JSON.parse(op.validacionIA) as Record<
        string,
        { resultado?: unknown } | undefined
      >;
      const out: Record<string, DocumentacionIA> = {};
      for (const [k, v] of Object.entries(mapa)) {
        if (v && typeof v === "object" && v.resultado) {
          out[k] = v.resultado as DocumentacionIA;
        }
      }
      return out;
    } catch {
      return {} as Record<string, DocumentacionIA>;
    }
  }, [op.validacionIA]);

  // Forma de pago / liberación: operación o última validación IA (reordena el retiro).
  const formaPagoEfectiva =
    op.formaPago ??
    validacionPorEtapa.embarque?.pago?.forma_pago ??
    validacionPorEtapa.documentacion?.pago?.forma_pago ??
    null;
  const liberacionEfectiva =
    op.liberacion ??
    validacionPorEtapa.embarque?.pago?.liberacion_doc ??
    validacionPorEtapa.documentacion?.pago?.liberacion_doc ??
    null;

  const etapasBase = useMemo(
    () =>
      etapasDe(op.tipo, {
        incoterm: op.incoterm,
        via: op.via,
        liberacion: liberacionEfectiva,
        formaPago: formaPagoEfectiva,
        destinacion: op.destinacion,
      }),
    [
      op.tipo,
      op.incoterm,
      op.via,
      liberacionEfectiva,
      formaPagoEfectiva,
    ],
  );
  const etapas = etapasBase;
  const checklist = useMemo(() => parseChecklist(op.checklist), [op.checklist]);

  const idxActual = indiceDeEtapa(etapas, op.etapa);
  const [verIdx, setVerIdx] = useState(idxActual);

  const [togglando, setTogglando] = useState<string | null>(null);
  const [avanzando, setAvanzando] = useState(false);
  // Confirmación antes de cambiar de etapa (avanzar / retroceder).
  const [confirmarMov, setConfirmarMov] = useState<"atras" | "adelante" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  // IA: el Paso 1 (apertura) usa el análisis real de documentos; Paso 2/3 validan
  // documentación y muestran pendientes.
  const [iaCargando, setIaCargando] = useState(false);
  const [iaApertura, setIaApertura] = useState<AperturaIA | null>(null);
  const [iaDoc, setIaDoc] = useState<DocumentacionIA | null>(null);
  // Etapa a la que pertenece el `iaDoc` recién corrido (para no mostrar el
  // resultado de un paso al ver otro). Si es null, mostramos el persistido.
  const [iaDocStage, setIaDocStage] = useState<string | null>(null);
  const [iaError, setIaError] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [aplicado, setAplicado] = useState(false);

  // NCM de la operación: se ingresa a mano (la clasificación se hace en el
  // Nomenclador). Reutilizamos clasifError para el feedback al guardarla.
  const [clasifError, setClasifError] = useState<string | null>(null);
  const [aplicandoNcm, setAplicandoNcm] = useState(false);
  const [ncmAplicada, setNcmAplicada] = useState(false);
  // Contador para forzar el recálculo de la cotización (y la composición del CIF)
  // cuando se aplica la IA, se cierra la NCM o se carga el flete, sin refrescar.
  const [recalc, setRecalc] = useState(0);
  const [destinoCotizacion, setDestinoCotizacion] = useState<"reventa" | "uso_propio">(
    "reventa",
  );

  // Al cambiar la etapa actual (avance/retroceso) seguimos viéndola y
  // limpiamos el resultado de IA. Patrón de ajuste de estado en render.
  const [prevIdx, setPrevIdx] = useState(idxActual);
  if (prevIdx !== idxActual) {
    setPrevIdx(idxActual);
    setVerIdx(idxActual);
    setIaApertura(null);
    setIaDoc(null);
    setIaDocStage(null);
    setIaError(null);
    setAplicado(false);
    setClasifError(null);
    setNcmAplicada(false);
  }

  const etapa = etapas[verIdx];
  const Via = (op.via && viaIcon[op.via]) || FileText;
  // Alertas fijas del paso: lo que la IA detectó al subir cada documento.
  const hallazgosPaso = hallazgosDelPaso(op.hallazgosIA, etapa.id);

  async function toggle(subId: string) {
    const clave = claveSubtarea(etapa.id, subId);
    const done = !checklist[clave];
    setTogglando(clave);
    setError(null);
    onChecklist(clave, done);
    try {
      const res = await fetch(`/api/operaciones/${op.id}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave, done }),
      });
      if (!res.ok) {
        setError("No se pudo guardar el cambio.");
        onChecklist(clave, !done);
      }
    } catch {
      setError("Error de conexión.");
      onChecklist(clave, !done);
    } finally {
      setTogglando(null);
    }
  }

  async function moverA(idx: number) {
    if (avanzando) return;
    if (
      op.etapa === "documentacion" &&
      idx > idxActual &&
      ncmPareceGeneral(op.ncm)
    ) {
      setError(
        "Definí una NCM específica (8 dígitos) con el nomenclador antes de avanzar al transporte.",
      );
      setConfirmarMov(null);
      return;
    }
    setAvanzando(true);
    setError(null);
    try {
      const res = await fetch(`/api/operaciones/${op.id}/etapa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapa: etapas[idx].id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "No se pudo cambiar la etapa.");
        return;
      }
      onEtapa(etapas[idx].id);
    } catch {
      setError("Error de conexión.");
    } finally {
      setAvanzando(false);
      setConfirmarMov(null);
    }
  }

  const esApertura = etapa.id === "apertura";
  const esDocumentacion = etapa.id === "documentacion";
  const esEmbarque = etapa.id === "embarque";
  const esLiquidacion = etapa.id === "liquidacion";
  const esOficializacion = etapa.id === "oficializacion";
  const esRetiro = etapa.id === "retiro";
  // La validación de documentación con IA y el aviso al cliente sirven tanto en
  // la etapa documental como en la de transporte/arribo.
  const esDocOEmbarque = esDocumentacion || esEmbarque;

  // Resultado a mostrar: el recién corrido para ESTA etapa, o el persistido (se
  // actualiza automáticamente al subir documentos).
  const validacionPersistida = esDocOEmbarque
    ? (validacionPorEtapa[etapa.id] ?? null)
    : null;
  const iaDocMostrar =
    iaDoc && iaDocStage === etapa.id ? iaDoc : validacionPersistida;

  /** Pendientes de documentación: solo en pasos 2 y 3 (no heredar en liquidación ni posteriores). */
  const pendientesDoc = esDocOEmbarque
    ? (iaDocMostrar ?? validacionPorEtapa[etapa.id] ?? null)
    : null;

  const mostrarClasificacion = esApertura || esDocumentacion;
  const ncmGeneralEnDoc = esDocumentacion && ncmPareceGeneral(op.ncm);

  // Paso 1 (cotizar): la IA lee la proforma / pedido de compra subidos,
  // extrae los datos, cruza la información y sugiere una NCM.
  async function analizarApertura() {
    setIaCargando(true);
    setIaError(null);
    setIaApertura(null);
    setAplicado(false);
    try {
      const res = await fetch(`/api/operaciones/${op.id}/ia/apertura`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIaError(data.error ?? "No se pudo analizar la documentación.");
        return;
      }
      setIaApertura(data.resultado as AperturaIA);
      // El mismo análisis pudo leer y aplicar los costos del forwarder (flete /
      // seguro / gastos): refrescamos el panel de flete y la cotización.
      setRecalc((n) => n + 1);
    } catch {
      setIaError("Error de conexión con la IA.");
    } finally {
      setIaCargando(false);
    }
  }

  // Vuelca los campos (ya revisados/editados por el operador) en la operación.
  async function aplicarCampos(editados: Record<string, string>) {
    // Paso 2+: los datos comerciales del Paso 1 no se reutilizan (mueren al avanzar).
    if (idxActual > 0) {
      setIaError(
        "Los datos de la proforma/pedido no se aplican en el Paso 2. Subí la documentación definitiva: la IA toma FOB, flete y total de cualquier documento que los traiga.",
      );
      return;
    }
    const campos: Record<string, string> = {};
    for (const [k, v] of Object.entries(editados)) {
      if (String(v).trim() !== "") campos[k] = String(v).trim();
    }
    if (Object.keys(campos).length === 0) return;
    setAplicando(true);
    setIaError(null);
    try {
      const res = await fetch(`/api/operaciones/${op.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...campos, _origen: "ia_apertura" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setIaError(data.error ?? "No se pudieron aplicar los datos.");
        return;
      }
      onCampos(campos);
      setAplicado(true);
      setRecalc((n) => n + 1);
    } catch {
      setIaError("Error de conexión al guardar.");
    } finally {
      setAplicando(false);
    }
  }

  // Paso 2: la IA cruza todos los documentos y controla que esté todo para
  // oficializar; sugiere un mensaje para pedirle al cliente lo que falta.
  async function analizarDocumentacion() {
    setIaCargando(true);
    setIaError(null);
    setIaDoc(null);
    try {
      const res = await fetch(`/api/operaciones/${op.id}/ia/documentacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapa: etapa.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setIaError(data.error ?? "No se pudo validar la documentación.");
        return;
      }
      const updates: { etapa: string; resultado: DocumentacionIA }[] = [
        { etapa: etapa.id, resultado: data.resultado as DocumentacionIA },
      ];
      if (data.avanzo && data.resultadoEmbarque) {
        updates.push({
          etapa: "embarque",
          resultado: data.resultadoEmbarque as DocumentacionIA,
        });
      }
      onValidacionIA(mergeValidacionIA(op.validacionIA, updates));
      setIaDoc(data.resultado as DocumentacionIA);
      setIaDocStage(etapa.id);
      if (data.avanzo && data.etapa === "embarque") {
        onEtapa("embarque");
        setVerIdx(indiceDeEtapa(etapas, "embarque"));
        if (data.resultadoEmbarque) {
          setIaDoc(data.resultadoEmbarque as DocumentacionIA);
          setIaDocStage("embarque");
        }
      }
      router.refresh();
    } catch {
      setIaError("Error de conexión con la IA.");
    } finally {
      setIaCargando(false);
    }
  }

  async function aplicarNcm(ncm: string) {
    const valor = ncm.trim();
    if (!valor) return;
    setAplicandoNcm(true);
    setClasifError(null);
    try {
      const res = await fetch(`/api/operaciones/${op.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ncm: valor }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setClasifError(data.error ?? "No se pudo aplicar la NCM.");
        return;
      }
      onCampos({ ncm: valor });
      setNcmAplicada(true);
      setRecalc((n) => n + 1);
      setIaDoc(null);

      const claveNcm = claveSubtarea(etapa.id, "ncm");
      if (
        etapa.id === "documentacion" &&
        !checklist[claveNcm] &&
        !ncmPareceGeneral(valor)
      ) {
        await toggle("ncm");
      }
    } catch {
      setClasifError("Error de conexión al guardar la NCM.");
    } finally {
      setAplicandoNcm(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      {/* Encabezado compacto */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-2/40 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent ring-1 ring-accent/20">
            <Via className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {op.titulo}
            </p>
            <p className="truncate text-[11px] text-muted">
              {op.ref} · {op.tipo} · {op.cliente}
            </p>
          </div>
        </div>
        {volverHref && (
          <Link
            href={volverHref}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-accent"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Volver a la operación
          </Link>
        )}
      </div>

      {/* Stepper horizontal compacto */}
      <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2.5">
        {etapas.map((e, i) => {
          const done = i < idxActual;
          const current = i === idxActual;
          const ver = i === verIdx;
          const p = progresoEtapa(e, checklist);
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setVerIdx(i)}
              title={e.label}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                ver ? "bg-surface-2" : "hover:bg-surface-2/60"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                  done
                    ? "bg-accent text-accent-foreground"
                    : current
                      ? "bg-accent/15 text-accent ring-1 ring-accent"
                      : "border border-border bg-surface text-muted"
                }`}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span
                className={`max-w-[110px] truncate text-[11px] ${
                  current || ver
                    ? "font-semibold text-foreground"
                    : "text-muted"
                }`}
              >
                {e.label}
              </span>
              <span
                className={`text-[9px] font-medium ${
                  p.hechas === p.total && p.total > 0 ? "text-accent" : "text-muted"
                }`}
              >
                {p.hechas}/{p.total}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cuerpo: 1/4 tareas (izquierda) + 3/4 el resto (derecha) */}
      <div className="grid gap-4 p-4 lg:grid-cols-4">
        {/* Columna izquierda: etapa + checklist (1/4) */}
        <div className="space-y-3 lg:col-span-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {etapa.label}
            </h3>
            {verIdx === idxActual && (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                Actual
              </span>
            )}
          </div>

          <div className="space-y-2.5">
            {gruposDeEtapa(etapa).map((grupo, gi) => {
              const total = grupo.subtareas.length;
              const hechas = grupo.subtareas.filter(
                (s) => checklist[claveSubtarea(etapa.id, s.id)],
              ).length;
              return (
                <div key={grupo.label ?? `g${gi}`}>
                  {grupo.label && (
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {grupo.label}
                      </span>
                      <span className="text-[10px] font-medium text-muted/70">
                        {hechas}/{total}
                      </span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <ul className="space-y-1">
                    {grupo.subtareas.map((s) => {
                      const clave = claveSubtarea(etapa.id, s.id);
                      const marca = checklist[clave];
                      const cargando = togglando === clave;
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => toggle(s.id)}
                            disabled={cargando}
                            className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-surface-2/60 disabled:opacity-60"
                          >
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                                marca
                                  ? "border-accent bg-accent text-accent-foreground"
                                  : "border-border text-transparent"
                              }`}
                            >
                              {cargando ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin text-muted" />
                              ) : marca ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Circle className="h-2 w-2" />
                              )}
                            </span>
                            <span
                              className={`text-[12px] ${
                                marca ? "text-muted line-through" : "text-foreground"
                              }`}
                            >
                              {s.label}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>

          {error && <p className="text-[11px] font-medium text-red-500">{error}</p>}
          {ncmGeneralEnDoc && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
              La NCM actual es demasiado general (menos de 8 dígitos). Usá el
              nomenclador para cerrar la posición exacta antes de avanzar.
            </p>
          )}

          <div className="flex flex-col gap-2 border-t border-border pt-3">
            {idxActual > 0 &&
              (confirmarMov === "atras" ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => moverA(idxActual - 1)}
                    disabled={avanzando}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-surface-2 disabled:opacity-60"
                  >
                    {avanzando ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Confirmar retroceso
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmarMov(null)}
                    disabled={avanzando}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-foreground disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmarMov("atras")}
                  disabled={avanzando}
                  className="w-full rounded-lg border border-border px-2.5 py-1.5 text-center text-[11px] font-medium text-muted transition-colors hover:text-foreground disabled:opacity-60"
                >
                  Retroceder
                </button>
              ))}
            {idxActual < etapas.length - 1 ? (
              confirmarMov === "adelante" ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => moverA(idxActual + 1)}
                    disabled={avanzando}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-accent-foreground transition-all hover:opacity-90 disabled:opacity-60"
                  >
                    {avanzando ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Confirmar: {etapas[idxActual + 1].label}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmarMov(null)}
                    disabled={avanzando}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-foreground disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmarMov("adelante")}
                  disabled={avanzando || ncmGeneralEnDoc}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-accent-foreground transition-all hover:opacity-90 disabled:opacity-60"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  Avanzar: {etapas[idxActual + 1].label}
                </button>
              )
            ) : (
              <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent/15 px-2.5 py-1.5 text-[11px] font-semibold text-accent">
                <Check className="h-3.5 w-3.5" /> Última etapa
              </span>
            )}
          </div>
        </div>

        {/* Columna derecha: IA + datos rápidos (3/4) */}
        <div className="space-y-3 lg:col-span-3">
          {esDocOEmbarque && (
            <PendientesDocumentacion data={pendientesDoc} />
          )}

          {!esLiquidacion &&
            !esApertura &&
            (esDocOEmbarque || hallazgosPaso.length > 0) && (
              <div className="rounded-xl border border-accent/30 bg-accent-soft/40 p-3">
                {esDocOEmbarque && (
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Sparkles className="h-3.5 w-3.5 text-accent" />
                      Validación de documentación (IA)
                    </p>
                    <button
                      type="button"
                      onClick={analizarDocumentacion}
                      disabled={iaCargando}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-semibold text-accent-foreground transition-all hover:opacity-90 disabled:opacity-60"
                    >
                      {iaCargando ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      Validar documentación
                    </button>
                  </div>
                )}

                <HallazgosPaso
                  items={hallazgosPaso}
                  className={esDocOEmbarque ? "mt-2" : ""}
                />

                {esDocOEmbarque && iaCargando && (
                  <p className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-3 text-[11px] text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cruzando los
                    documentos…
                  </p>
                )}
                {esDocOEmbarque && iaError && (
                  <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-600 dark:text-red-400">
                    {iaError}
                  </p>
                )}
              </div>
            )}

          {esApertura && (
            <>
              {/* La salida del paso, a la vista.
                  Este primer paso es para cotizar con una proforma. El que ya
                  tiene la factura definitiva no tiene nada que hacer acá, y si
                  no se lo dice algo visible se queda trabado buscando qué subir.
                  Va como barra propia y no como renglón de ayuda adentro de la
                  tarjeta: ahí solo lo veía quien todavía no había analizado
                  nada, que es exactamente al revés de lo que hace falta. */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
                <p className="text-xs text-foreground">
                  ¿Ya tenés la <strong className="font-semibold">factura comercial definitiva</strong>?
                  Este paso es solo para cotizar.
                </p>
                <button
                  type="button"
                  // Avanza derecho, sin pedir confirmación aparte. El botón ya
                  // dice a dónde va y el que lo aprieta es porque tiene la
                  // factura en la mano; mandarlo a confirmar abajo a la
                  // izquierda —lejos de donde hizo clic— es un paso de más
                  // para una decisión que ya tomó. Se puede volver con
                  // «Retroceder», así que no hay nada que proteger.
                  onClick={() => moverA(idxActual + 1)}
                  disabled={avanzando}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-accent px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft disabled:opacity-60"
                >
                  {avanzando ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Saltar al Paso 2
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* 1 · Lectura de documentos con IA */}
              <div className="rounded-xl border border-accent/30 bg-accent-soft/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-base font-semibold text-foreground">
                    <Sparkles className="h-4.5 w-4.5 text-accent" />
                    Leer documentos con IA
                  </p>
                  <button
                    type="button"
                    onClick={analizarApertura}
                    disabled={iaCargando}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90 disabled:opacity-60"
                  >
                    {iaCargando ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Analizar documentos
                  </button>
                </div>
                <HallazgosPaso items={hallazgosPaso} />
                <div className="mt-2 space-y-2">
                  {iaCargando ? (
                    <p className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-3 text-[11px] text-muted">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Leyendo la
                      proforma / pedido…
                    </p>
                  ) : iaError ? (
                    <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-600 dark:text-red-400">
                      {iaError}
                    </p>
                  ) : iaApertura ? (
                    <AperturaResultado
                      data={iaApertura}
                      aplicando={aplicando}
                      aplicado={aplicado}
                      onAplicar={aplicarCampos}
                    />
                  ) : (
                    // Antes acá había un párrafo de seis renglones explicando
                    // qué subir, qué extrae la IA y cuándo saltear el paso. Era
                    // demasiado para lo primero que se ve al abrir una carpeta.
                    // La salida —«ya tengo la factura, salteo»— se fue a su
                    // propia barra, abajo: acá solo la veía quien todavía no
                    // había analizado nada, y es justo al revés.
                    <p className="text-[11px] leading-relaxed text-muted">
                      Para estimar la cotización con la proforma o el pedido de
                      compra.
                    </p>
                  )}
                </div>
              </div>

              {/* 2 · Nomenclatura (NCM) — se ingresa la posición final a mano. */}
              <NcmFinalPanel
                ncmActual={op.ncm}
                aplicando={aplicandoNcm}
                aplicada={ncmAplicada}
                error={clasifError}
                onAplicar={aplicarNcm}
              />

              {/* La carpeta puede tener varias mercaderías y no se sabe
                  cuántas hasta clasificarlas: la lista se arma de a una,
                  debajo de la posición principal. */}
              <ProductosCarpeta
                opId={op.id}
                sugerencia={
                  op.ncm && op.mercaderia
                    ? { mercaderia: op.mercaderia, ncm: op.ncm }
                    : null
                }
              />

              {/* 3 · Cotización — el flete y el seguro se editan acá mismo,
                  tocando cada valor en «Costos de la operación». */}
              <LiquidacionPanel
                opId={op.id}
                checklistInicial={checklist}
                recalcKey={recalc}
                destinoExterno={destinoCotizacion}
                onDestinoChange={setDestinoCotizacion}
              />

              {/* 5 · Enviar cotización al cliente */}
              <EnviarCotizacionPanel
                opId={op.id}
                cliente={op.cliente}
                recalcKey={recalc}
                destino={destinoCotizacion}
                onAvanzo={() => onEtapa(etapas[1].id)}
              />
            </>
          )}

          {!esApertura && mostrarClasificacion && (
            <>
              <NcmFinalPanel
                ncmActual={op.ncm}
                aplicando={aplicandoNcm}
                aplicada={ncmAplicada}
                error={clasifError}
                onAplicar={aplicarNcm}
              />

              {/* El mismo problema que en apertura: la carpeta puede tener
                  varias mercaderías y recién se sabe cuántas al clasificarlas.
                  Acá importa más, porque es lo que se declara. */}
              <ProductosCarpeta
                opId={op.id}
                sugerencia={
                  op.ncm && op.mercaderia
                    ? { mercaderia: op.mercaderia, ncm: op.ncm }
                    : null
                }
              />
            </>
          )}

          {esLiquidacion && (
            <LiquidacionPanel
              opId={op.id}
              checklistInicial={checklist}
              vista="liquidacion"
            />
          )}

          {esOficializacion && (
            <FichaMalvinaPanel
              opId={op.id}
              checklistKey={JSON.stringify(checklist)}
              despachoCargado={Boolean(checklist[claveSubtarea("oficializacion", "despacho")])}
              onDocumentoSubido={() => void sincronizarDesdeServidor()}
            />
          )}

          {/* La ficha sirve para cargar a mano; esto arma el archivo que el Kit
              importa. Es el mismo momento del trabajo, así que van juntos. */}
          {esOficializacion && <PresimPanel opId={op.id} />}

          {esEmbarque && (
            <LiquidacionPanel
              opId={op.id}
              checklistInicial={checklist}
              soloEtapa="embarque"
            />
          )}

          {esRetiro && (
            <LiquidacionPanel
              opId={op.id}
              checklistInicial={checklist}
              soloEtapa="retiro"
            />
          )}

        </div>
      </div>
    </div>
  );
}


function EnviarCotizacionPanel({
  opId,
  cliente,
  recalcKey,
  destino,
  onAvanzo,
}: {
  opId: string;
  cliente: string;
  recalcKey: number;
  destino: "reventa" | "uso_propio";
  /** Se llama cuando el envío cerró el Paso 1 y avanzó al Paso 2. */
  onAvanzo?: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [enviadoA, setEnviadoA] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qs = new URLSearchParams({ destino }).toString();
  const pdfHref = `/api/operaciones/${opId}/cotizacion?${qs}`;
  const pdfDlHref = `${pdfHref}&dl=1`;

  // Si cambian los números (NCM, flete, IA), limpiamos el "enviado" para que el
  // operador sepa que la cotización vigente cambió respecto de la que mandó.
  useEffect(() => {
    setEnviadoA(null);
    setError(null);
  }, [recalcKey, destino]);

  async function enviar() {
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/operaciones/${opId}/cotizacion?${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "No se pudo enviar la cotización.");
        return;
      }
      setEnviadoA(json.to ?? "el cliente");
      // El backend cierra el Paso 1 y pasa al Paso 2 cuando manda la cotización:
      // reflejamos el avance en el stepper sin recargar.
      if (json.avanzo) onAvanzo?.();
    } catch {
      setError("Error de conexión al enviar la cotización.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-2/30 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Send className="h-3.5 w-3.5 text-accent" />
        5 · Enviar cotización al cliente
      </p>
      <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
        Genera el PDF con el detalle de costos y lo envía al mail de{" "}
        <span className="font-medium text-foreground/80">{cliente}</span>. Es una
        cotización preliminar: revisá los números arriba antes de mandarla.
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <a
          href={pdfHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-foreground"
        >
          <FileText className="h-3.5 w-3.5" />
          Ver PDF
        </a>
        <a
          href={pdfDlHref}
          download
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" />
          Descargar
        </a>
        <button
          type="button"
          onClick={enviar}
          disabled={enviando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {enviando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {enviadoA ? "Reenviar al cliente" : "Enviar al cliente"}
        </button>
      </div>

      {enviadoA && !error && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Cotización enviada a {enviadoA}.
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

/* ───────────────────── NCM final (ingreso manual) ─────────────────────
 * La clasificación se hace en el Nomenclador (herramienta completa). Acá el
 * despachante sólo pega/edita la NCM final de la operación; no se llama al
 * clasificador desde la mesa de trabajo para no dar lugar a dudas. */

function NcmFinalPanel({
  ncmActual,
  aplicando,
  aplicada,
  error,
  onAplicar,
}: {
  ncmActual: string | null;
  aplicando: boolean;
  aplicada: boolean;
  error: string | null;
  onAplicar: (ncm: string) => void;
}) {
  const [valor, setValor] = useState(ncmActual ?? "");
  // Reflejamos la NCM guardada (ej. la cargada en el Paso 1) cuando cambia, sin
  // perder la edición: el operador puede sobrescribirla y volver a guardar.
  useEffect(() => {
    setValor(ncmActual ?? "");
  }, [ncmActual]);
  const limpio = valor.trim();
  const sinCambios = limpio === (ncmActual ?? "").trim();

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Search className="h-4 w-4 text-accent" />
          NCM final
        </p>
        {ncmActual && (
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted">
            Actual {ncmActual}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">
        Sacá la posición con el Nomenclador y pegá acá la NCM final (8 dígitos).
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && limpio && !aplicando) onAplicar(limpio);
          }}
          placeholder="Ej. 7202.29.00"
          inputMode="numeric"
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        />
        <button
          type="button"
          disabled={aplicando || limpio.length < 4 || sinCambios}
          onClick={() => onAplicar(limpio)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {aplicando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Guardar NCM
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      {aplicada && !error && (
        <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
          NCM guardada.
        </p>
      )}
    </div>
  );
}

/* ───────────────────── Resultado de la IA de apertura ───────────────────── */

const ALERTA_ICON: Record<AlertaIA["nivel"], LucideIcon> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
};

const ALERTA_COLOR: Record<AlertaIA["nivel"], string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-red-600 dark:text-red-400",
};

function AperturaResultado({
  data,
  aplicando,
  aplicado,
  onAplicar,
}: {
  data: AperturaIA;
  aplicando: boolean;
  aplicado: boolean;
  onAplicar: (campos: Record<string, string>) => void;
}) {
  // Valores iniciales = lo que devolvió la IA (solo campos conocidos).
  const inicial = useMemo(() => {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.campos)) {
      if (CAMPO_LABEL[k] && String(v ?? "").trim() !== "") {
        o[k] = String(v);
      }
    }
    return o;
  }, [data]);

  // Estado editable; se reinicia si llega un análisis nuevo (ajuste en render).
  const [edit, setEdit] = useState<Record<string, string>>(inicial);
  const [prev, setPrev] = useState(data);
  if (prev !== data) {
    setPrev(data);
    setEdit(inicial);
  }

  const set = (k: string, v: string) =>
    setEdit((p) => ({ ...p, [k]: v }));

  // Mostramos los campos en el orden de CAMPO_LABEL, los que tengan valor.
  const keys = (Object.keys(CAMPO_LABEL) as string[]).filter((k) => k in edit);
  const hayCampos = keys.length > 0;

  // Comparación cliente vs documento, indexada por campo.
  const comparacion = data.comparacion ?? [];
  const compMap = new Map(comparacion.map((c) => [c.campo, c]));
  const difieren = comparacion.filter((c) => c.estado === "difiere");
  const nuevos = comparacion.filter((c) => c.estado === "solo_documento");

  return (
    <div className="space-y-2.5">
      {/* Tipo de documento + resumen */}
      <div className="rounded-lg border border-border bg-surface px-3 py-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
          <FileText className="h-3 w-3" />
          {TIPO_DOC_LABEL[data.tipo_documento] ?? "Documento"}
        </span>
        {data.resumen && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/90">
            {data.resumen}
          </p>
        )}
      </div>

      {/* Comparación: solo mostramos lo que DIFIERE o lo que aporta el documento.
          Los datos que coinciden no se listan (no aportan nada). La IA no cambia
          nada sola; el operador da el OK al tocar «Aplicar». */}
      {(difieren.length > 0 || nuevos.length > 0) && (
        <div className="rounded-lg border border-border bg-surface px-3 py-2">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            <Info className="h-3 w-3" />
            Cliente vs. documento
          </p>
          <ul className="space-y-1.5">
            {comparacion
              .filter(
                (c) => c.estado === "difiere" || c.estado === "solo_documento",
              )
              .map((c) => {
                if (c.estado === "difiere") {
                  return (
                    <li
                      key={c.campo}
                      className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-relaxed"
                    >
                      <p className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {c.label} · difiere
                      </p>
                      <p className="mt-0.5 text-foreground/90">
                        Cliente cargó: <span className="font-medium">{c.cliente}</span>
                      </p>
                      <p className="text-foreground/90">
                        Documento dice:{" "}
                        <span className="font-medium">{c.documento}</span>
                      </p>
                    </li>
                  );
                }
                return (
                  <li
                    key={c.campo}
                    className="flex items-start gap-1.5 text-[11px] leading-relaxed"
                  >
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                    <span className="text-foreground/80">
                      <span className="font-medium">{c.label}:</span>{" "}
                      {c.documento}{" "}
                      <span className="text-muted">
                        · lo aporta el documento (el cliente no lo cargó)
                      </span>
                    </span>
                  </li>
                );
              })}
          </ul>
          <p className="mt-2 border-t border-border pt-1.5 text-[10px] leading-relaxed text-muted">
            {difieren.length > 0
              ? `Hay ${difieren.length} dato(s) que no coinciden. Abajo quedan ` +
                "precargados los valores del documento; revisalos, corregí lo que " +
                "haga falta y recién con «Aplicar a la operación» se guardan. El OK final es tuyo."
              : "Revisá los datos del documento abajo y aplicalos cuando estés conforme."}
          </p>
        </div>
      )}

      {/* Cruce con packing list */}
      {data.cruce_packing && (
        <div className="rounded-lg border border-border bg-surface px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Cruce con packing list
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-foreground/90">
            {data.cruce_packing}
          </p>
        </div>
      )}

      {/* Datos extraídos (editables: la IA puede equivocarse) */}
      {hayCampos && (
        <div className="rounded-lg border border-border bg-surface px-3 py-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Datos extraídos · revisá y corregí
          </p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {keys.map((k) => {
              const comp = compMap.get(k);
              const difiere = comp?.estado === "difiere";
              return (
                <label key={k} className="min-w-0 block">
                  <span className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wide text-muted">
                    {CAMPO_LABEL[k]}
                    {difiere && (
                      <span className="rounded-full bg-amber-500/15 px-1 py-0.5 text-[8px] font-semibold text-amber-700 dark:text-amber-400">
                        difiere
                      </span>
                    )}
                  </span>
                  <input
                    value={edit[k] ?? ""}
                    onChange={(e) => set(k, e.target.value)}
                    className={`mt-0.5 w-full rounded-md border bg-surface-2/40 px-2 py-1 text-[11px] text-foreground outline-none transition-colors focus:border-accent ${
                      difiere ? "border-amber-500/50" : "border-border"
                    }`}
                  />
                  {difiere && comp && (
                    <span className="mt-0.5 block text-[9px] text-muted">
                      Cliente cargó:{" "}
                      <span className="font-medium text-foreground/80">
                        {comp.cliente}
                      </span>
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Acción: aplicar a la operación */}
      {hayCampos && (
        <button
          type="button"
          onClick={() => onAplicar(edit)}
          disabled={aplicando || aplicado}
          className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition-all disabled:opacity-60 ${
            aplicado
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-accent text-accent-foreground hover:opacity-90"
          }`}
        >
          {aplicando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : aplicado ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <ArrowRight className="h-3.5 w-3.5" />
          )}
          {aplicado ? "Datos cargados en la operación" : "Aplicar a la operación"}
        </button>
      )}
    </div>
  );
}

/* ─────────────── Pendientes de documentación (Paso 2 / 3) ─────────────── */

/** Solo faltantes e inconsistencias del cruce documental (pasos 2 y 3). */
function PendientesDocumentacion({
  data,
}: {
  data: DocumentacionIA | null;
}) {
  if (!data) return null;
  const faltantes = data.faltantes ?? [];
  const inconsistencias = data.inconsistencias ?? [];
  if (faltantes.length === 0 && inconsistencias.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {faltantes.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Documentación faltante
          </p>
          <ul className="space-y-1">
            {faltantes.map((f, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="text-[11px] leading-relaxed text-foreground/90">
                  <span className="font-semibold">{f.doc}</span>
                  {f.motivo ? ` — ${f.motivo}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {inconsistencias.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
            Inconsistencias
          </p>
          <ul className="space-y-1">
            {inconsistencias.map((t, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
                <span className="text-[11px] leading-relaxed text-foreground/90">
                  {t}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
