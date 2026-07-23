"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Calculator,
  Check,
  Download,
  FileText,
  Info,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { TITULO_RESUMEN_FONDOS } from "@/lib/cotizacion-labels";

type Cotiz = {
  flete: number;
  seguro: number;
  cif: number;
  diPct: number;
  di: number;
  tasa: number;
  tasaExenta: boolean;
  iva: number;
  percIva: number;
  percGan: number;
  iibb: number;
  honorarios: number;
  honorariosIva: number;
  recuperable: number;
  noRecuperable: number;
  desembolso: number;
  costoReal: number;
  porUnidad: number | null;
};

type LineaLog = {
  id: string;
  label: string;
  grupo: string;
  etapa: "embarque" | "retiro" | "cierre";
  monto: number;
  reembolsable: boolean;
  nota?: string;
};

type Liquidacion = {
  faltan: string[];
  avisos: string[];
  perfil: string;
  perfilLabel: string;
  destino: "reventa" | "uso_propio";
  certExencion: boolean;
  ncm: string | null;
  diPct: number;
  diFuente: "parquet" | "estimado";
  fleteFuente: "incluido" | "manual" | "estimado";
  ivaPct: number;
  pais: string;
  preferencia: string;
  incoterm: string;
  via: string;
  valor: number;
  valorFuente: string;
  peso: number;
  cantidad: number;
  regimen: {
    percIvaPct: number;
    percGanPct: number;
    iibbPct: number;
    eximido: boolean;
  };
  cotiz: Cotiz;
  tipoContenedor: string | null;
  cantidadContenedores: number;
  logistica: {
    lineas: LineaLog[];
    costoLogistica: number;
    adelanto: number;
    modalidad: string;
    modo: "maritima" | "aerea" | "terrestre" | null;
  };
  costoTotal: number;
  adelanto: number;
};

const MODO_LABEL: Record<string, string> = {
  maritima: "Marítimo/fluvial (BL)",
  aerea: "Aéreo (AWB)",
  terrestre: "Terrestre (CRT)",
};

const LABEL_CONT: Record<string, string> = {
  "20STD": "20' estándar",
  "40STD": "40' estándar",
  "40HC": "40' High Cube",
  "20RF": "20' reefer",
  "40RF": "40' reefer",
  LCL: "Carga suelta (LCL)",
  AEREO: "Carga aérea",
};

const RIESGOS = [
  "Demurrage / detention: USD 50–200+/día por contenedor pasado el forzoso (~7 días DRY, ~3 reefer).",
  "Almacenaje: pasado el forzoso, la terminal cobra por día en USD.",
  "Canal rojo: verificación física ~USD 185 + movimientos y días extra (2–5 días).",
];

function usd(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function Linea({
  label,
  valor,
  nota,
  fuerte,
}: {
  label: string;
  valor: string;
  nota?: string;
  fuerte?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span
        className={`text-[11px] ${fuerte ? "font-semibold text-foreground" : "text-muted"}`}
      >
        {label}
        {nota ? <span className="ml-1 text-[10px] text-muted/70">{nota}</span> : null}
      </span>
      <span
        className={`tabular-nums ${fuerte ? "text-xs font-semibold text-foreground" : "text-[11px] text-foreground/90"}`}
      >
        {valor}
      </span>
    </div>
  );
}

/** Línea con monto EDITABLE inline: se toca el valor, se escribe y se guarda. */
function LineaEditable({
  label,
  monto,
  nota,
  onGuardar,
  fuerte,
}: {
  label: string;
  monto: number;
  nota?: string;
  onGuardar: (monto: number) => void;
  fuerte?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(monto > 0 ? String(Math.round(monto)) : "");

  function guardar() {
    const n = Number(valor.replace(/[^\d.]/g, ""));
    setEditando(false);
    onGuardar(Number.isFinite(n) ? n : 0);
  }

  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span
        className={`text-[11px] ${fuerte ? "font-semibold text-foreground" : "text-muted"}`}
      >
        {label}
        {nota ? <span className="ml-1 text-[10px] text-muted/70">{nota}</span> : null}
      </span>
      {editando ? (
        <input
          autoFocus
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onBlur={guardar}
          onKeyDown={(e) => {
            if (e.key === "Enter") guardar();
            if (e.key === "Escape") setEditando(false);
          }}
          inputMode="decimal"
          placeholder="USD"
          className="w-24 shrink-0 rounded-md border border-accent bg-surface px-1.5 py-0.5 text-right text-[11px] tabular-nums text-foreground outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setValor(monto > 0 ? String(Math.round(monto)) : "");
            setEditando(true);
          }}
          className={`shrink-0 rounded-md border border-dashed px-1.5 py-0.5 tabular-nums transition-colors hover:border-accent hover:text-accent ${
            monto > 0
              ? "border-transparent text-[11px] text-foreground/90"
              : "border-border text-[11px] text-muted"
          }`}
          title="Editar valor"
        >
          {monto > 0 ? usd(monto) : "Cargar"}
        </button>
      )}
    </div>
  );
}

function Grupo({
  titulo,
  total,
  children,
}: {
  titulo: string;
  total?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          {titulo}
        </span>
        {total != null && (
          <span className="text-[13px] font-semibold tabular-nums text-foreground">
            {total}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function TotalLinea({
  label,
  valor,
  accent,
}: {
  label: string;
  valor: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13px] font-semibold text-foreground">{label}</span>
      <span
        className={`text-base font-bold tabular-nums ${
          accent ? "text-accent" : "text-foreground"
        }`}
      >
        {valor}
      </span>
    </div>
  );
}

export function LiquidacionPanel({
  opId,
  checklistInicial,
  soloEtapa,
  recalcKey = 0,
  vista = "cotizacion",
  destinoExterno,
  onDestinoChange,
}: {
  opId: string;
  checklistInicial?: Record<string, unknown>;
  /** Si se indica, muestra solo los pagos de esa etapa (modo compacto). */
  soloEtapa?: "embarque" | "retiro" | "cierre";
  /** Cambia para forzar el recálculo (NCM aplicada, IA, flete) sin refrescar. */
  recalcKey?: number;
  vista?: "cotizacion" | "liquidacion";
  destinoExterno?: "reventa" | "uso_propio";
  onDestinoChange?: (destino: "reventa" | "uso_propio") => void;
}) {
  const esVistaLiquidacion = vista === "liquidacion";
  const [destinoInterno, setDestinoInterno] = useState<"reventa" | "uso_propio">("reventa");
  const destino = destinoExterno ?? destinoInterno;
  const [data, setData] = useState<Liquidacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagados, setPagados] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const k of Object.keys(checklistInicial ?? {})) {
      if (k.startsWith("costo.")) s.add(k.slice("costo.".length));
    }
    return s;
  });

  function cambiarDestino(next: "reventa" | "uso_propio") {
    if (destinoExterno == null) setDestinoInterno(next);
    onDestinoChange?.(next);
  }

  const calcular = useCallback(
    async (d: "reventa" | "uso_propio") => {
      setCargando(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/operaciones/${opId}/liquidacion?destino=${d}`,
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.error ?? "No se pudo calcular la liquidación.");
          return;
        }
        setData(json.resultado as Liquidacion);
      } catch {
        setError("Error de conexión.");
      } finally {
        setCargando(false);
      }
    },
    [opId],
  );

  useEffect(() => {
    calcular(destino);
  }, [calcular, destino, recalcKey]);

  // Guarda el monto REAL de una línea de logística. Las líneas especiales van a
  // su propio campo de la operación; el resto, al mapa costos_override (que se
  // reconstruye desde los valores actuales para no perder los ya cargados).
  async function guardarMonto(id: string, valor: number) {
    if (!data) return;
    const monto = Number.isFinite(valor) && valor > 0 ? valor : 0;
    let body: Record<string, string>;
    if (id === "gastos_destino_real") {
      body = { gastos_destino: monto > 0 ? String(monto) : "" };
    } else if (id === "transporte_interno") {
      body = { transporte_interno: monto > 0 ? String(monto) : "" };
    } else {
      const ov: Record<string, number> = {};
      for (const l of data.logistica.lineas) {
        if (l.id === "gastos_destino_real" || l.id === "transporte_interno") continue;
        if (l.monto > 0) ov[l.id] = l.monto;
      }
      if (monto > 0) ov[id] = monto;
      else delete ov[id];
      body = { costos_override: Object.keys(ov).length > 0 ? JSON.stringify(ov) : "" };
    }
    try {
      await fetch(`/api/operaciones/${opId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await calcular(destino);
    } catch {
      setError("No se pudo guardar el gasto.");
    }
  }

  // Guarda uno o más campos de la operación y recalcula. Vacío = limpiar el dato.
  async function guardarCampos(body: Record<string, string>) {
    try {
      await fetch(`/api/operaciones/${opId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await calcular(destino);
    } catch {
      setError("No se pudo guardar el cambio.");
    }
  }

  // Campo donde se persiste el VALOR de la mercadería según su fuente (FOB / CIF
  // / factura), para que al editarlo el motor lo tome del mismo lugar.
  function campoValor(fuente: string): string {
    if (fuente === "CIF") return "valor_cif";
    if (fuente === "FOB") return "valor_fob";
    return "valor_factura";
  }

  async function togglePago(id: string) {
    const done = !pagados.has(id);
    setPagados((prev) => {
      const n = new Set(prev);
      if (done) n.add(id);
      else n.delete(id);
      return n;
    });
    try {
      await fetch(`/api/operaciones/${opId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: `costo.${id}`, done }),
      });
    } catch {
      // Revertir si falla.
      setPagados((prev) => {
        const n = new Set(prev);
        if (done) n.delete(id);
        else n.add(id);
        return n;
      });
    }
  }

  // ── Modo compacto: solo los pagos de una etapa ──
  if (soloEtapa) {
    const lineas = (data?.logistica.lineas ?? []).filter(
      (l) => l.etapa === soloEtapa,
    );
    if (cargando && !data) {
      return (
        <div className="rounded-xl border border-border bg-surface-2/30 p-3">
          <p className="flex items-center gap-2 text-[11px] text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando pagos…
          </p>
        </div>
      );
    }
    if (!data) return null;
    const subtotal = lineas.reduce((s, l) => s + l.monto, 0);
    const modo = data.logistica.modo;
    const modoLabel = modo ? MODO_LABEL[modo] : null;
    // Modo real: no hay valores inventados. Hay datos si ya se cargó algún gasto
    // (de la factura/cotización del forwarder o a mano); si no, queda "a cargar".
    const hayDatos = subtotal > 0;
    if (lineas.length === 0 && !hayDatos) {
      if (soloEtapa !== "embarque") return null;
    }
    return (
      <div className="rounded-xl border border-border bg-surface-2/30 p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Wallet className="h-3.5 w-3.5 text-accent" />
          Pagos de esta etapa
          {modoLabel && (
            <span className="rounded-full bg-surface px-2 py-0.5 text-[9px] font-medium text-muted">
              {modoLabel}
            </span>
          )}
          <span
            className={
              "ml-auto rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide " +
              (hayDatos
                ? "bg-emerald-500/15 text-emerald-600"
                : "bg-amber-500/15 text-amber-600")
            }
          >
            {hayDatos ? "Datos reales" : "A cargar"}
          </span>
        </p>
        {lineas.length > 0 && (
          <div className="mt-2 space-y-1">
            {lineas.map((l) => (
              <PagoItem
                key={l.id}
                linea={l}
                pagado={pagados.has(l.id)}
                onToggle={() => togglePago(l.id)}
                editable
                onGuardar={(n) => guardarMonto(l.id, n)}
              />
            ))}
          </div>
        )}
        {hayDatos && (
          <div className="mt-2 border-t border-border pt-2">
            <Linea label="Subtotal etapa" valor={usd(subtotal)} fuerte />
          </div>
        )}
        {soloEtapa === "embarque" && hayDatos && (
          <p className="mt-2 rounded-lg bg-accent-soft/40 px-2.5 py-1.5 text-[10px] leading-snug text-foreground/80">
            Logística a cargo del cliente:{" "}
            <span className="font-semibold">{usd(data.adelanto)}</span>. Los tributos
            los paga aparte por VEP.
          </p>
        )}
      </div>
    );
  }

  // ── Modo completo: liquidación + logística + timeline ──
  const c = data?.cotiz;
  // Valores derivados para la presentación agrupada (estilo cotizador del cliente).
  const valorMercaderia = c ? c.cif - c.flete - c.seguro : 0;
  const totalTributos = c
    ? c.di + (c.tasaExenta ? 0 : c.tasa) + c.iva + c.percIva + c.percGan + c.iibb
    : 0;
  const gastosLocales = data?.logistica.costoLogistica ?? 0;

  return (
    <div className="rounded-xl border border-accent/30 bg-accent-soft/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Calculator className="h-3.5 w-3.5 text-accent" />
          {esVistaLiquidacion ? TITULO_RESUMEN_FONDOS : "Costos de la operación"}
        </p>
        <button
          type="button"
          onClick={() => calcular(destino)}
          disabled={cargando}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-foreground disabled:opacity-60"
        >
          {cargando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Recalcular
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
          Cliente
        </span>
        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
          {data?.perfilLabel ?? "—"}
        </span>
        {data?.certExencion && (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
            Cert. MiPyME / exclusión
          </span>
        )}
        {data?.tipoContenedor && (
          <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-foreground/80">
            {data.cantidadContenedores > 1
              ? `${data.cantidadContenedores}× `
              : ""}
            {LABEL_CONT[data.tipoContenedor] ?? data.tipoContenedor}
          </span>
        )}
      </div>

      <div className="mt-2">
        <label className="text-[10px] font-medium uppercase tracking-wider text-muted">
          Destino
        </label>
        <select
          value={destino}
          onChange={(e) => cambiarDestino(e.target.value as "reventa" | "uso_propio")}
          className="mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] text-foreground focus:border-accent focus:outline-none"
        >
          <option value="reventa">Reventa / comercialización</option>
          <option value="uso_propio">Uso o consumo propio</option>
        </select>
      </div>

      {!soloEtapa && esVistaLiquidacion && (
        <div className="mt-2 rounded-lg border border-border bg-surface-2/30 p-2.5">
          <p className="text-[10.5px] leading-relaxed text-muted">
            Generá el PDF con tributos (VEP), adelanto logístico y base CIF de
            referencia. No incluye mercadería ni pagos al proveedor / forwarder.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              href={`/api/operaciones/${opId}/cotizacion?destino=${destino}&vista=liquidacion`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-foreground"
            >
              <FileText className="h-3.5 w-3.5" />
              Ver resumen
            </a>
            <a
              href={`/api/operaciones/${opId}/cotizacion?destino=${destino}&vista=liquidacion&dl=1`}
              download
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              Descargar resumen
            </a>
          </div>
        </div>
      )}

      {cargando && !data ? (
        <p className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-3 text-[11px] text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando con el NCM, el
          contenedor y el perfil del cliente…
        </p>
      ) : error ? (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : data && c ? (
        <div className="mt-3 space-y-2">
          {data.faltan.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              {data.faltan.map((f, i) => (
                <p
                  key={i}
                  className="flex items-start gap-1.5 text-[10.5px] leading-snug text-amber-700 dark:text-amber-400"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {f}
                </p>
              ))}
            </div>
          )}

          {data.avisos.length > 0 && (
            <div className="space-y-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2">
              {data.avisos.map((a, i) => (
                <p
                  key={i}
                  className="flex items-start gap-1.5 text-[10.5px] leading-snug text-sky-700 dark:text-sky-300"
                >
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  {a}
                </p>
              ))}
            </div>
          )}

          {esVistaLiquidacion && (
            <div className="rounded-lg border border-accent/30 bg-accent-soft/40 px-3 py-2">
              <p className="flex items-start gap-1.5 text-[10.5px] leading-snug text-foreground/85">
                <Info className="mt-0.5 h-3 w-3 shrink-0 text-accent" />
                El <span className="font-semibold">CIF</span> se usa solo como base
                aduanera para liquidar tributos. La mercadería, el flete
                internacional y el seguro se pagan aparte según la factura del
                proveedor y/o del forwarder; este panel separa eso del VEP y del
                adelanto logístico al estudio.
              </p>
            </div>
          )}

          {/* Resumen base de la operación (legible, estilo cotizador). */}
          <div className="rounded-lg border border-border bg-surface px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-accent">
                {data.ncm ?? "NCM s/d"}
              </span>
              <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted">
                DI {data.diPct}%{" "}
                {data.diFuente === "parquet" ? "· nomenclador" : "· estimado"}
              </span>
              <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted">
                IVA {data.ivaPct}%
              </span>
              <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted">
                {data.incoterm}
              </span>
            </div>
            <p className="mt-1.5 text-[10.5px] leading-snug text-muted">
              {data.pais} ({data.preferencia}) · valor {usd(data.valor)} (
              {data.valorFuente})
            </p>
          </div>

          {/* Desglose agrupado: qué vale cada cosa y por qué. */}
          <dl className="space-y-3 rounded-lg border border-border bg-surface px-3 py-3">
            {/* 1) CIF / base aduanera */}
            <Grupo
              titulo={
                esVistaLiquidacion
                  ? "Base aduanera de referencia (CIF)"
                  : "Mercadería (CIF)"
              }
              total={usd(c.cif)}
            >
              <LineaEditable
                label={
                  esVistaLiquidacion
                    ? `Mercadería / valor base (${data.valorFuente})`
                    : `Valor de la mercadería (${data.valorFuente})`
                }
                monto={valorMercaderia}
                onGuardar={(n) =>
                  guardarCampos({ [campoValor(data.valorFuente)]: n > 0 ? String(n) : "" })
                }
              />
              {data.fleteFuente === "incluido" ? (
                <Linea label="Flete" valor="Incluido en el valor" />
              ) : (
                <LineaEditable
                  label="Flete"
                  monto={c.flete}
                  nota={data.fleteFuente === "manual" ? "del forwarder" : "a cargar"}
                  onGuardar={(n) => guardarCampos({ flete: n > 0 ? String(n) : "" })}
                />
              )}
              {data.fleteFuente !== "incluido" && c.flete <= 0 && (
                <p className="flex items-start gap-1.5 text-[10px] leading-snug text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  Falta el flete real (del forwarder): hasta cargarlo, el CIF va
                  sin flete. No se estima.
                </p>
              )}
              <LineaEditable
                label="Seguro"
                monto={c.seguro}
                nota="1% estimado · editable"
                onGuardar={(n) => guardarCampos({ seguro: n > 0 ? String(n) : "" })}
              />
              {esVistaLiquidacion && (
                <Linea
                  label="Uso del CIF"
                  valor="Base para tributos"
                  nota="no es cobro del estudio"
                />
              )}
            </Grupo>

            {/* 2) Tributos de nacionalización (los paga el cliente por VEP) */}
            <Grupo titulo="Impuestos y tributos (VEP)" total={usd(totalTributos)}>
              <Linea
                label={`Derecho de importación (${c.diPct}%)`}
                valor={usd(c.di)}
              />
              <Linea
                label="Tasa de estadística"
                valor={c.tasaExenta ? "Exenta" : usd(c.tasa)}
              />
              <Linea
                label={`IVA (${data.ivaPct}%)`}
                valor={usd(c.iva)}
                nota={
                  data.perfil === "responsable_inscripto"
                    ? "crédito fiscal"
                    : "costo"
                }
              />
              {c.percIva > 0 && (
                <Linea
                  label={`Percepción IVA (${data.regimen.percIvaPct}%)`}
                  valor={usd(c.percIva)}
                />
              )}
              {c.percGan > 0 && (
                <Linea
                  label={`Percepción Ganancias (${data.regimen.percGanPct}%)`}
                  valor={usd(c.percGan)}
                />
              )}
              {c.iibb > 0 && (
                <Linea
                  label={`Percepción IIBB (${data.regimen.iibbPct}%)`}
                  valor={usd(c.iibb)}
                />
              )}
            </Grupo>

            {/* 3) Despacho + gastos locales de nacionalización (editables acá) */}
            <Grupo
              titulo={
                esVistaLiquidacion
                  ? "Adelanto logístico y despacho"
                  : "Despacho y gastos locales"
              }
              total={usd(gastosLocales)}
            >
              <Linea
                label="Honorarios despachante"
                valor="Acordados con la dirección"
                nota="se suman aparte"
              />
              {data.logistica.lineas.map((l) => (
                <LineaEditable
                  key={l.id}
                  label={l.label}
                  monto={l.monto}
                  nota={l.reembolsable ? "reembolsable" : undefined}
                  onGuardar={(n) => guardarMonto(l.id, n)}
                />
              ))}
            </Grupo>
          </dl>

          {/* Totales */}
          <div className="space-y-2 rounded-lg border border-accent/30 bg-surface px-3 py-3">
            {esVistaLiquidacion ? (
              <>
                <Linea label="Tributos por VEP" valor={usd(totalTributos)} />
                <Linea
                  label="Adelanto logístico al estudio"
                  valor={data.adelanto > 0 ? usd(data.adelanto) : "A cargar"}
                />
                <Linea
                  label="Mercadería / flete / seguro"
                  valor="Se pagan aparte"
                  nota="proveedor / forwarder"
                />
              </>
            ) : (
              <Linea
                label="Logística (gastos locales)"
                valor={gastosLocales > 0 ? usd(gastosLocales) : "A cargar"}
              />
            )}
            <div className="border-t border-border pt-2">
              <TotalLinea
                label={
                  esVistaLiquidacion
                    ? "Fondos a prever para la operación"
                    : "Total a desembolsar (con IVA y percepciones)"
                }
                valor={usd(esVistaLiquidacion ? totalTributos + data.adelanto : c.desembolso + gastosLocales)}
                accent
              />
              <p className="mt-0.5 text-[10px] leading-snug text-muted">
                {esVistaLiquidacion
                  ? "Incluye el VEP de tributos y el adelanto logístico. No incluye mercadería, flete internacional, seguro ni honorarios."
                  : "Incluye tributos, IVA, percepciones y gastos locales. Honorarios del despachante aparte."}
              </p>
            </div>
            {c.recuperable > 0 && (
              <div className="mt-1 space-y-1 border-t border-border pt-2">
                <Linea
                  label={
                    esVistaLiquidacion
                      ? "Del VEP recuperás después (crédito fiscal / pago a cuenta)"
                      : "Recuperás después (crédito fiscal / pago a cuenta)"
                  }
                  valor={`- ${usd(c.recuperable)}`}
                />
                {!esVistaLiquidacion && (
                  <Linea
                    label="Costo real final (neto de lo que recuperás)"
                    valor={usd(data.costoTotal)}
                    fuerte
                  />
                )}
              </div>
            )}
            {!esVistaLiquidacion && c.porUnidad != null && data.cantidad > 1 && (
              <Linea
                label={`Costo real por unidad (${data.cantidad})`}
                valor={usd(c.porUnidad)}
              />
            )}
          </div>

          <details className="rounded-lg border border-border bg-surface-2/40 px-3 py-2">
            <summary className="cursor-pointer text-[10.5px] font-medium text-muted">
              Riesgos que pueden sumar costos
            </summary>
            <ul className="mt-1.5 space-y-1">
              {RIESGOS.map((r, i) => (
                <li key={i} className="text-[10px] leading-snug text-muted">
                  • {r}
                </li>
              ))}
            </ul>
          </details>

          <p className="text-[10px] leading-snug text-muted">
            {data.perfil === "responsable_inscripto"
              ? "Como Responsable Inscripto, el IVA y las percepciones son crédito fiscal / pago a cuenta."
              : "Para este perfil, el IVA y las percepciones son costo real."}{" "}
            {esVistaLiquidacion
              ? "Los importes del VEP salen de la base aduanera (CIF) y los gastos locales del forwarder / terminal o de carga manual. El seguro (1%) es la única estimación. Importes en USD."
              : "Valores REALES: el flete y los gastos locales salen de la factura / cotización del forwarder o se cargan a mano (tocá cualquier valor para editarlo). El seguro (1%) es la única estimación. Importes en USD."}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function PagoItem({
  linea,
  pagado,
  onToggle,
  editable = false,
  onGuardar,
}: {
  linea: LineaLog;
  pagado: boolean;
  onToggle: () => void;
  /** Permite editar el monto real de la línea (Paso 1 / operación). */
  editable?: boolean;
  onGuardar?: (monto: number) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(linea.monto > 0 ? String(Math.round(linea.monto)) : "");

  function guardar() {
    const n = Number(valor.replace(/[^\d.]/g, ""));
    setEditando(false);
    if (onGuardar) onGuardar(Number.isFinite(n) ? n : 0);
  }

  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
      >
        <span
          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
            pagado
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-border bg-surface"
          }`}
        >
          {pagado && <Check className="h-2.5 w-2.5" />}
        </span>
        <span
          className={`truncate text-[10.5px] leading-tight ${pagado ? "text-muted line-through" : "text-foreground/90"}`}
        >
          {linea.label}
          {linea.reembolsable && (
            <span className="ml-1 text-[9px] text-emerald-600 dark:text-emerald-400">
              reembolsable
            </span>
          )}
        </span>
      </button>
      {editable ? (
        editando ? (
          <input
            autoFocus
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onBlur={guardar}
            onKeyDown={(e) => {
              if (e.key === "Enter") guardar();
              if (e.key === "Escape") setEditando(false);
            }}
            inputMode="decimal"
            placeholder="USD"
            className="w-20 shrink-0 rounded-md border border-accent bg-surface px-1.5 py-0.5 text-right text-[10.5px] tabular-nums text-foreground outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setValor(linea.monto > 0 ? String(Math.round(linea.monto)) : "");
              setEditando(true);
            }}
            className={`shrink-0 rounded-md border border-dashed px-1.5 py-0.5 text-[10.5px] tabular-nums transition-colors hover:border-accent hover:text-accent ${
              linea.monto > 0
                ? "border-transparent text-foreground/80"
                : "border-border text-muted"
            }`}
            title="Editar gasto real"
          >
            {linea.monto > 0 ? usd(linea.monto) : "Cargar"}
          </button>
        )
      ) : (
        <span className="shrink-0 text-[10.5px] tabular-nums text-foreground/80">
          {usd(linea.monto)}
        </span>
      )}
    </div>
  );
}
