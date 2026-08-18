"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Calculator,
  Download,
  Info,
  Loader2,
  Plane,
  Ship,
  Sparkles,
  Truck,
  type LucideIcon,
} from "lucide-react";
import {
  DESTINOS,
  HONORARIOS_MIN_DEFAULT,
  HONORARIOS_PCT_DEFAULT,
  PAISES,
  PERFILES,
  VIAS,
  acuerdoLabel,
  cotizar,
  cotizarExportacion,
  incotermsPermitidos,
  notaPais,
  perfilDesdeCondicionIva,
  regimenPercepciones,
  type Categoria,
  type Destino,
  type PerfilFiscal,
  type ExportarResult,
} from "@/lib/cotizador";
import type { EstimacionPdfInput } from "@/lib/estimacion-pdf";
import {
  DESTINACION_POR_DEFECTO,
  destinacionPorId,
  destinacionesDe,
} from "@/lib/destinaciones";
import type {
  ClasificacionResultado,
  Respuesta,
} from "@/lib/clasificador/tipos";
import { consecuenciaParaOpcion } from "@/lib/clasificador/tipos";
import { IntervencionesNcm } from "@/components/intervenciones-ncm";
import { ClasificadorPreguntas } from "@/components/clasificador-preguntas";
import {
  esPreguntaNcmMaquinaPadre,
  normalizarNcmMaquina,
} from "@/lib/clasificador/preguntas-sistema";

/** Cada vía con su ícono: se elige tocando, sin desplegar una lista de tres. */
const ICONO_VIA: Record<string, LucideIcon> = {
  maritima: Ship,
  aerea: Plane,
  terrestre: Truck,
};

const inputCls =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
const labelCls = "text-xs font-medium text-foreground";
const hintCls = "text-[11px] leading-snug text-muted";

type AntidumpingMedida = {
  posicion: string;
  producto: string | null;
  medidaAplicada: string | null;
  tipoMedida: string | null;
  vencimiento: string | null;
  pais: string;
  normativa: string | null;
};

type AntidumpingResultado = {
  ncm: string | null;
  pais: string | null;
  exacto: boolean;
  medidas: AntidumpingMedida[];
};

function num(v: string): number {
  if (!v) return 0;
  const limpio = v.replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, "");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

function fmt(n: number, moneda: string): string {
  return `${moneda} ${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Describe la medida con su unidad: USD/kg (FOB mínimo) o % (ad valorem). */
function descMedidaAntidumping(
  tipo: string | null,
  valor: string | null,
): string {
  const t = (tipo ?? "").toLowerCase();
  const v = (valor ?? "").trim().replace(".", ",");
  if (!v) return tipo ?? "Medida vigente";
  if (t.includes("ad valorem")) return `derecho ${v}% (ad valorem)`;
  if (t.includes("fob") || t.includes("mínimo") || t.includes("minimo")) {
    return `valor FOB mínimo USD ${v}/kg`;
  }
  return `${tipo ?? ""} ${v}`.trim();
}

function textoMedidaAntidumping(m: AntidumpingMedida): string {
  const partes = [
    descMedidaAntidumping(m.tipoMedida, m.medidaAplicada),
    m.normativa,
  ].filter(Boolean);
  return partes.join(" · ");
}

function esFobMinimo(tipo: string | null): boolean {
  const t = (tipo ?? "").toLowerCase();
  return t.includes("fob") || t.includes("mínimo") || t.includes("minimo");
}

function hayFobMinimo(medidas: { tipoMedida: string | null }[]): boolean {
  return medidas.some((m) => esFobMinimo(m.tipoMedida));
}

function parseNumMedida(v: string | null): number | null {
  if (!v) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Quita medidas repetidas: las aperturas SIM de una misma NCM devuelven la misma
 * medida muchas veces. Deduplicamos por los campos visibles (país, tipo, valor,
 * normativa) para no listar lo mismo decenas de veces.
 */
function dedupMedidas(medidas: AntidumpingMedida[]): AntidumpingMedida[] {
  const vistos = new Map<string, AntidumpingMedida>();
  for (const m of medidas) {
    const k = [m.pais, m.tipoMedida, m.medidaAplicada, m.normativa].join("|");
    if (!vistos.has(k)) vistos.set(k, m);
  }
  return [...vistos.values()];
}

/**
 * Estima el impacto de una medida de FOB mínimo.
 *
 * Fórmula oficial (RG 2326/2007): Du = Qd × Vn − FOB, calculada SOBRE EL FOB
 * (no sobre CIF). Acá Qd = peso en kg y Vn = mínimo por kg, ASUMIENDO que la
 * resolución fija el mínimo en USD/kg (lo más común, pero algunas medidas usan
 * USD por unidad/par/docena: en ese caso este número no aplica y hay que mirar
 * la resolución). Solo estimamos en USD y con FOB ≈ valor declarado.
 *
 * Para ad valorem devolvemos null: el % ya figura en la descripción.
 */
function impactoFobMinimo(
  m: AntidumpingMedida,
  ctx: { fobTotal: number; peso: number; moneda: string },
): string | null {
  if (!esFobMinimo(m.tipoMedida)) return null;
  const minimo = parseNumMedida(m.medidaAplicada);
  if (minimo == null) return null;

  const n2 = (n: number) =>
    n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

  if (ctx.moneda !== "USD" || ctx.fobTotal <= 0 || ctx.peso <= 0) {
    return `aplica si tu FOB es menor a USD ${n2(minimo)}/kg (verificá la unidad en la resolución)`;
  }
  const fobKg = ctx.fobTotal / ctx.peso;
  if (fobKg >= minimo) {
    return `tu FOB ≈ USD ${n2(fobKg)}/kg supera el mínimo: no aplicaría`;
  }
  // Du = Qd·Vn − FOB (sobre FOB), asumiendo Vn en USD/kg.
  const extra = minimo * ctx.peso - ctx.fobTotal;
  const pctFob = (extra / ctx.fobTotal) * 100;
  return `tu FOB ≈ USD ${n2(fobKg)}/kg < mínimo: ≈ +USD ${n2(extra)} de antidumping (≈ +${n2(pctFob)}% sobre el FOB, asumiendo USD/kg)`;
}

/**
 * Descarga la estimación como PDF de una página.
 *
 * Manda los números que están en pantalla, así el PDF dice exactamente lo mismo
 * que el usuario está viendo — incluidos los ajustes finos que haya hecho a
 * mano (flete, seguro, gastos). Un respaldo que no coincide con la pantalla es
 * peor que no tener respaldo.
 */
function BotonDescargarEstimacion({ payload }: { payload: EstimacionPdfInput }) {
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function bajar() {
    setBajando(true);
    setError(null);
    try {
      const res = await fetch("/api/cotizador/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setError("No se pudo generar el PDF.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Estimacion-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Error de conexión.");
    } finally {
      setBajando(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={bajar}
        disabled={bajando}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent-soft px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-[var(--accent-foreground)] disabled:opacity-60"
      >
        {bajando ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Descargar estimación (PDF)
      </button>
      {error && (
        <p className="mt-1.5 text-center text-xs font-medium text-red-500">{error}</p>
      )}
    </div>
  );
}

export function CotizadorImportacion({
  ivaCondition,
  certExencion,
}: {
  ivaCondition?: string | null;
  certExencion?: string | null;
}) {
  // Condición del IMPORTADOR de esta operación, no de quien está usando la
  // calculadora. Un despachante cotiza para clientes con perfiles distintos, y
  // el perfil cambia el total: un responsable inscripto recupera el IVA y las
  // percepciones (son pago a cuenta), y un monotributista, un exento o un
  // consumidor final NO presentan DDJJ de IVA, así que todo eso es costo puro.
  // Dejarlo fijo en «responsable inscripto» mostraba SIEMPRE el número más
  // bajo, que es el error caro: cotizar de menos.
  const [perfil, setPerfil] = useState<PerfilFiscal>(
    perfilDesdeCondicionIva(ivaCondition),
  );

  // El certificado es del IMPORTADOR de esta operación, no de quien está usando
  // la calculadora: rara vez se importa a nombre propio. Por eso es un dato de
  // la operación y se puede cambiar acá; el perfil solo fija el valor inicial.
  const [certExencionOp, setCertExencionOp] = useState(
    (certExencion ?? "").toLowerCase() === "si" ? "si" : "no",
  );
  const certExencionActiva = certExencionOp === "si";

  // Importación o exportación: define qué campos y qué tributos aplican.
  const [modo, setModo] = useState<"importacion" | "exportacion">(
    "importacion",
  );
  const esExport = modo === "exportacion";

  // Destino de la mercadería: específico de cada despacho (reventa vs uso propio).
  const [destino, setDestino] = useState<Destino>("reventa");

  // Datos que carga el cliente
  const [paisNombre, setPaisNombre] = useState(PAISES[0].nombre);
  const [incotermValue, setIncotermValue] = useState("FOB");
  const [viaValue, setViaValue] = useState("maritima");
  // Destinación: en un régimen suspensivo los tributos se garantizan en vez de
  // pagarse, así que cambia el total. Arranca en «a consumo», que es el caso
  // normal, y se resetea al cambiar de importación a exportación.
  // Los supuestos arrancan cerrados: el usuario viene a ver el total.
  const [verSupuestos, setVerSupuestos] = useState(false);
  const [destinacion, setDestinacion] = useState<string>(
    DESTINACION_POR_DEFECTO.importacion,
  );
  const regimenElegido = destinacionPorId(destinacion);
  // En comercio exterior el valor de referencia es el dólar y el cotizador no
  // hace conversión de divisas: fijamos USD en todo el cálculo.
  const moneda = "USD";
  const [valor, setValor] = useState("");
  // Tipo de carga: define el flete (FCL por contenedor) y los gastos locales.
  // Volumen en m³ (CBM): para LCL el flete y la terminal se cobran por W/M.

  // Clasificador con IA (única fuente del derecho/IVA)
  const [producto, setProducto] = useState("");
  const [clasificando, setClasificando] = useState(false);
  const [clasif, setClasif] = useState<ClasificacionResultado | null>(null);
  const [errorClasif, setErrorClasif] = useState<string | null>(null);
  const [antidumping, setAntidumping] = useState<AntidumpingResultado | null>(
    null,
  );
  const [cargandoAntidumping, setCargandoAntidumping] = useState(false);
  // Opciones elegidas para precisar (pregunta -> opción)
  const [sel, setSel] = useState<Record<string, string>>({});
  const [textoLibre, setTextoLibre] = useState<Record<string, string>>({});
  // Historial acumulado de respuestas (todas las rondas) para que el motor converja.
  const [respuestasAcum, setRespuestasAcum] = useState<Respuesta[]>([]);

  // Flete/seguro cuando el Incoterm no los incluye.
  const [fleteOverride, setFleteOverride] = useState("");
  const [seguroOverride, setSeguroOverride] = useState("");

  // Servicios del despacho: honorarios (% sobre CIF, con mínimo) y gastos de terminal.
  const [honorariosPct, setHonorariosPct] = useState(
    HONORARIOS_PCT_DEFAULT.toLocaleString("es-AR", { minimumFractionDigits: 1 }),
  );
  const [honorariosMin, setHonorariosMin] = useState(String(HONORARIOS_MIN_DEFAULT));
  const [gastosTerminal, setGastosTerminal] = useState("");
  // Exportación: gastos en origen (terminal, consolidación, certificados, flete interno).
  const [gastosOrigen, setGastosOrigen] = useState("");
  const [gastosOrigenImp, setGastosOrigenImp] = useState("");

  // Aranceles oficiales por NCM: di (importación), de (exportación) y reintegro.
  const [arancel, setArancel] = useState<{
    di: number;
    de: number;
    reintegro: number;
    iva: number;
  } | null>(null);

  function contextoDesdeRespuestas(respuestas: Respuesta[]) {
    let ncmMaquina: string | undefined;
    let equipoReferencia: string | undefined;
    for (const r of respuestas) {
      if (!esPreguntaNcmMaquinaPadre(r.pregunta)) continue;
      const ncm = normalizarNcmMaquina(r.opcion);
      if (ncm) ncmMaquina = ncm;
      else if (r.opcion.trim()) equipoReferencia = r.opcion.trim();
    }
    if (!ncmMaquina && !equipoReferencia) return undefined;
    return { ncmMaquina, equipoReferencia };
  }

  async function pedirClasificacion(q: string, respuestas?: Respuesta[]) {
    setClasificando(true);
    setErrorClasif(null);
    try {
      const ctx = respuestas?.length
        ? contextoDesdeRespuestas(respuestas)
        : undefined;
      const res = await fetch("/api/clasificar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          producto: q,
          respuestas,
          ncmMaquina: ctx?.ncmMaquina,
          equipoReferencia: ctx?.equipoReferencia,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorClasif(data.error ?? "No se pudo clasificar.");
      } else {
        setClasif(data.resultado as ClasificacionResultado);
      }
    } catch {
      setErrorClasif("Error de conexión. Probá de nuevo.");
    } finally {
      setClasificando(false);
    }
  }

  function clasificarProducto() {
    const q = producto.trim();
    if (q.length < 2 || clasificando) return;
    setClasif(null);
    setSel({});
    setTextoLibre({});
    setRespuestasAcum([]);
    void pedirClasificacion(q);
  }

  function afinarClasificacion() {
    const q = producto.trim();
    if (!clasif?.preguntas || clasificando) return;
    const mapa = new Map(respuestasAcum.map((r) => [r.pregunta, r.opcion]));
    for (const pregunta of clasif.preguntas) {
      const libre = (textoLibre[pregunta.pregunta] ?? "").trim();
      if (libre) {
        mapa.set(pregunta.pregunta, libre);
        continue;
      }
      const op = sel[pregunta.pregunta];
      if (op) mapa.set(pregunta.pregunta, op);
    }
    const respuestas: Respuesta[] = [];
    for (const [pregunta, opcion] of mapa) {
      const qDef = clasif.preguntas?.find((p) => p.pregunta === pregunta);
      respuestas.push({
        pregunta,
        opcion,
        consecuencia: qDef ? consecuenciaParaOpcion(qDef, opcion) : undefined,
      });
    }
    if (respuestas.length === 0) return;
    setRespuestasAcum(respuestas);
    setSel({});
    setTextoLibre({});
    void pedirClasificacion(q, respuestas);
  }

  useEffect(() => {
    const ncm = clasif?.ncm;
    if (!ncm) {
      setArancel(null);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/arancel?ncm=${encodeURIComponent(ncm)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok && data.resultado) {
          setArancel(data.resultado as typeof arancel);
        } else {
          setArancel(null);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setArancel(null);
      });
    return () => controller.abort();
  }, [clasif?.ncm]);

  useEffect(() => {
    const ncm = clasif?.ncm;
    if (!ncm) {
      setAntidumping(null);
      setCargandoAntidumping(false);
      return;
    }

    const controller = new AbortController();
    setCargandoAntidumping(true);
    const qs = new URLSearchParams({ ncm, pais: paisNombre });

    fetch(`/api/vuce/antidumping?${qs.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ok) {
          setAntidumping(data.resultado as AntidumpingResultado);
        } else {
          setAntidumping(null);
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAntidumping(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargandoAntidumping(false);
      });

    return () => controller.abort();
  }, [clasif?.ncm, paisNombre]);

  const categoria = useMemo<Categoria>(
    () => ({
      id: clasif?.ncm ?? "sin-clasificar",
      label: clasif?.descripcion ?? "Sin clasificar",
      di: clasif?.derecho ?? 0,
      iva: clasif?.iva ?? 21,
    }),
    [clasif],
  );
  const pais = PAISES.find((p) => p.nombre === paisNombre) ?? PAISES[0];
  const via = VIAS.find((v) => v.value === viaValue) ?? VIAS[0];
  const seguroPctLabel = `${(via.tasaSeguro * 100).toLocaleString("es-AR", {
    maximumFractionDigits: 2,
  })}%`;

  // Régimen de percepciones y recuperabilidad según perfil fiscal + destino.
  const regimen = useMemo(
    () =>
      regimenPercepciones({
        perfil,
        destino,
        ivaPct: categoria.iva,
        certExclusion: certExencionActiva,
      }),
    [perfil, destino, categoria.iva, certExencionActiva],
  );

  // Incoterms admitidos según el tipo de operación y la vía (Incoterms 2020):
  // - Marítima/vía navegable: todos. Aérea/terrestre: sólo multimodales.
  // - Exportación: además se excluye EXW (no aplica en exportación argentina).
  const incotermsValidos = useMemo(
    () => incotermsPermitidos(esExport, viaValue),
    [esExport, viaValue],
  );
  const incoterm =
    incotermsValidos.find((x) => x.value === incotermValue) ??
    incotermsValidos[0];

  // Si la vía o el modo dejan inválido el Incoterm elegido, lo reseteamos.
  useEffect(() => {
    if (!incotermsValidos.some((i) => i.value === incotermValue)) {
      setIncotermValue(incotermsValidos[0]?.value ?? "");
    }
  }, [incotermsValidos, incotermValue]);

  function cambiarVia(value: string) {
    setViaValue(value);
  }

  const valorNum = num(valor);
  const tieneValorMercaderia = valorNum > 0;
  // Flete/seguro: en importación se muestran cuando el Incoterm NO los incluye
  // (los paga el importador); en exportación, cuando SÍ los incluye (para
  // restarlos del valor de venta y reconstruir el FOB).
  const mostrarFlete = esExport
    ? incoterm.incluyeFlete
    : !incoterm.incluyeFlete;
  const mostrarSeguro = esExport
    ? incoterm.incluyeSeguro
    : !incoterm.incluyeSeguro;
  /**
   * Incoterms donde el tramo de origen queda del lado del comprador: EXW parte
   * de la fábrica, FCA entrega al transportista y FAS al costado del buque. De
   * FOB en adelante el vendedor ya cubrió origen y carga.
   */
  const origenACargoDelComprador =
    !esExport && ["EXW", "FCA", "FAS"].includes(incoterm.value);


  const r = useMemo(
    () =>
      cotizar({
        valor: valorNum,
        peso: 0,
        cantidad: 0,
        destinacion,
        categoria,
        pais,
        incoterm,
        via,
        diPctOverride: null,
        ivaPctOverride: null,
        percIvaPct: regimen.percIvaPct,
        percGanPct: regimen.percGanPct,
        iibbPct: regimen.iibbPct,
        recIva: regimen.recIva,
        recPercIva: regimen.recPercIva,
        recPercGan: regimen.recPercGan,
        recIibb: regimen.recIibb,
        recHonorariosIva: regimen.recHonorariosIva,
        // El flete se carga a mano (vacío es cero). El seguro, si no se
        // declara, es el presunto del 1% sobre CFR que toma la aduana.
        fleteOverride: num(fleteOverride),
        seguroOverride: seguroOverride ? num(seguroOverride) : null,
        gastosOrigenImport: num(gastosOrigenImp),
        estimarFlete: false,
        honorariosPct: num(honorariosPct),
        honorariosMin: num(honorariosMin),
        gastosTerminal: num(gastosTerminal),
        tipoCambio: null,
        otrosArs: 0,
      }),
    [
      valorNum,
      categoria,
      destinacion,
      pais,
      incoterm,
      via,
      regimen,
      fleteOverride,
      seguroOverride,
      gastosOrigenImp,
      honorariosPct,
      honorariosMin,
      gastosTerminal,
    ],
  );

  // Exportación: derecho de exportación (DE), reintegro y neto sobre FOB.
  const rx = useMemo(
    () =>
      cotizarExportacion({
        destinacion,
        valor: valorNum,
        pesoKg: 0,
        cantidad: 0,
        dePct: arancel?.de ?? 0,
        reintegroPct: arancel?.reintegro ?? 0,
        incoterm,
        via,
        fleteOverride: num(fleteOverride),
        seguroOverride: seguroOverride ? num(seguroOverride) : null,
        honorariosPct: num(honorariosPct),
        honorariosMin: num(honorariosMin),
        gastosOrigen: num(gastosOrigen),
      }),
    [
      valorNum,
      arancel,
      destinacion,
      incoterm,
      via,
      fleteOverride,
      seguroOverride,
      honorariosPct,
      honorariosMin,
      gastosOrigen,
    ],
  );

  // Banda de incertidumbre: dentro de la partida puede haber posiciones con
  // distinto derecho. Calculamos el total con el mínimo y el máximo de la partida.
  const aranceles = clasif?.aranceles ?? [];
  const posDiMin = aranceles.length ? Math.min(...aranceles) : categoria.di;
  const posDiMax = aranceles.length ? Math.max(...aranceles) : categoria.di;
  const banda = useMemo(() => {
    const base = {
      valor: valorNum,
      peso: 0,
      cantidad: 0,
      categoria,
      pais,
      incoterm,
      via,
      ivaPctOverride: null,
      percIvaPct: regimen.percIvaPct,
      percGanPct: regimen.percGanPct,
      iibbPct: regimen.iibbPct,
      recIva: regimen.recIva,
      recPercIva: regimen.recPercIva,
      recPercGan: regimen.recPercGan,
      recIibb: regimen.recIibb,
      recHonorariosIva: regimen.recHonorariosIva,
      fleteOverride: num(fleteOverride),
      seguroOverride: seguroOverride ? num(seguroOverride) : null,
      gastosOrigenImport: num(gastosOrigenImp),
      estimarFlete: false,
      honorariosPct: num(honorariosPct),
      honorariosMin: num(honorariosMin),
      gastosTerminal: num(gastosTerminal),
      tipoCambio: null,
      otrosArs: 0,
    };
    return {
      lo: cotizar({ ...base, diPctOverride: posDiMin }),
      hi: cotizar({ ...base, diPctOverride: posDiMax }),
    };
  }, [
    valorNum,
    categoria,
    pais,
    incoterm,
    via,
    regimen,
    fleteOverride,
    seguroOverride,
    gastosOrigenImp,
    honorariosPct,
    honorariosMin,
    gastosTerminal,
    posDiMin,
    posDiMax,
  ]);

  const hayBanda = banda != null && banda.hi.desembolso !== banda.lo.desembolso;

  // Subtotales para el desglose en 3 bloques (CIF / impuestos / despacho+locales).
  const totalImpuestos =
    r.di + r.tasa + r.iva + r.percIva + r.percGan + r.iibb;
  // Desembolso del grupo: el IVA de honorarios se paga aunque después se
  // recupere. El honorario ya viene con el IVA adentro: no se suma aparte, y
  // que la parte de IVA vuelva se dice en el «recuperás» del total.
  const totalGastos = r.honorarios + r.gastosTerminal;

  // Costo final según el perfil fiscal: el modelo ya descuenta del costo real lo
  // recuperable (RI) y deja como costo el IVA/percepciones no recuperables
  // (monotributo, exento, consumidor final).
  const derechoNcmPct = categoria.di;
  const derechoPreferencial = clasif != null && derechoNcmPct !== r.diPct;
  const medidasAntidumping = dedupMedidas(antidumping?.medidas ?? []);
  const hayAntidumping = medidasAntidumping.length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      {/* Datos */}
      <div className="space-y-4">
        <Bloque titulo="¿Qué querés cotizar?">
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-2/40 p-1">
            {(
              [
                ["importacion", "Importación"],
                ["exportacion", "Exportación"],
              ] as const
            ).map(([value, label]) => {
              const activo = modo === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setModo(value);
                    setDestinacion(DESTINACION_POR_DEFECTO[value]);
                  }}
                  className={`h-9 rounded-lg text-sm font-semibold transition-colors ${
                    activo
                      ? "bg-accent text-[var(--accent-foreground)]"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Bloque>

        <Bloque titulo={esExport ? "¿Qué vas a exportar?" : "¿Qué vas a importar?"}>
          <div className="mt-2 flex gap-2">
            <input
              className={inputCls}
              placeholder="Describí el producto, o escribí la posición: 6403.99.90"
              value={producto}
              onChange={(e) => setProducto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") clasificarProducto();
              }}
            />
            <button
              type="button"
              onClick={clasificarProducto}
              disabled={clasificando || producto.trim().length < 2}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-semibold text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {clasificando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Clasificar
            </button>
          </div>
          {errorClasif && (
            <p className="mt-2 text-[11px] text-red-500">{errorClasif}</p>
          )}
          {clasif && (
            <ResultadoClasif
              r={clasif}
              sel={sel}
              textoLibre={textoLibre}
              onSelect={(pregunta, opcion) =>
                setSel((s) => ({ ...s, [pregunta]: opcion }))
              }
              onTextoLibre={(pregunta, texto) =>
                setTextoLibre((s) => ({ ...s, [pregunta]: texto }))
              }
              onAfinar={afinarClasificacion}
              afinando={clasificando}
            />
          )}
        </Bloque>

        <Bloque titulo="Origen y transporte">
          {/* La destinación va primero y sola: es lo que decide si los tributos
              se pagan o se garantizan, o sea si el total de abajo es una salida
              de caja o una garantía a constituir. */}
          <Campo label="Destinación aduanera" className="mb-4">
            <select
              className={inputCls}
              value={destinacion}
              onChange={(e) => setDestinacion(e.target.value)}
            >
              {destinacionesDe(modo).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
            {regimenElegido && regimenElegido.familia === "suspensiva" && (
              <p className={`${hintCls} mt-1.5`}>
                Régimen suspensivo ({regimenElegido.norma}): los tributos no se
                pagan, se garantizan.
                {regimenElegido.plazo
                  ? ` Hay ${regimenElegido.plazo.dias} días desde ${regimenElegido.plazo.desde} para cancelarlo.`
                  : " El plazo lo fija la autorización."}
              </p>
            )}
          </Campo>

          {/* Los tres datos definen una sola cosa —de dónde viene y en qué
              condición— así que van juntos en un renglón. */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            {!esExport && (
              <Campo label="País de origen" className="min-w-0 flex-1">
                <select
                  className={inputCls}
                  value={paisNombre}
                  onChange={(e) => setPaisNombre(e.target.value)}
                >
                  {PAISES.map((p) => (
                    <option key={p.nombre} value={p.nombre}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
            )}

            <Campo label="Vía" className="shrink-0">
              <div className="flex h-10 items-center gap-1 rounded-lg border border-border bg-surface p-1">
                {VIAS.map((v) => {
                  const Icono = ICONO_VIA[v.value] ?? Ship;
                  const activa = viaValue === v.value;
                  return (
                    <button
                      key={v.value}
                      type="button"
                      onClick={() => cambiarVia(v.value)}
                      title={v.label}
                      aria-label={v.label}
                      aria-pressed={activa}
                      className={`flex h-8 w-10 items-center justify-center rounded-md transition-colors ${
                        activa
                          ? "bg-accent text-[var(--accent-foreground)]"
                          : "text-muted hover:bg-surface-2 hover:text-foreground"
                      }`}
                    >
                      <Icono className="h-[18px] w-[18px]" />
                    </button>
                  );
                })}
              </div>
            </Campo>

            <Campo label="Incoterm" className="min-w-0 flex-1">
              <select
                className={inputCls}
                value={incoterm?.value ?? ""}
                onChange={(e) => setIncotermValue(e.target.value)}
              >
                {incotermsValidos.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

        </Bloque>

        <Bloque titulo="Valor de la operación">
          <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
            <Campo label="Valor de la mercadería" full>
              <div className="flex gap-2">
                <span className="inline-flex h-10 shrink-0 items-center rounded-lg border border-border bg-surface-2/60 px-3 text-sm font-semibold text-muted">
                  USD
                </span>
                <input
                  className={inputCls}
                  inputMode="decimal"
                  placeholder="0"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                />
              </div>
            </Campo>

            {mostrarFlete && (
              <Campo
                label={`Flete internacional (${moneda})`}
                hint={
                  esExport
                    ? `Tu precio ${incoterm.value} lo incluye: se resta para llegar al FOB, que es la base de la retención.`
                    : `Tu precio ${incoterm.value} no lo incluye y hace falta para armar el CIF.`
                }
              >
                <input
                  className={inputCls}
                  inputMode="decimal"
                  placeholder="0"
                  value={fleteOverride}
                  onChange={(e) => setFleteOverride(e.target.value)}
                />
              </Campo>
            )}

            {origenACargoDelComprador && (
              <Campo
                label={`Gastos en origen (${moneda})`}
                hint={`Con ${incoterm.value} los paga el comprador: transporte hasta el puerto, despacho de exportación y terminal de origen. Integran el valor en aduana.`}
              >
                <input
                  className={inputCls}
                  inputMode="decimal"
                  placeholder="0"
                  value={gastosOrigenImp}
                  onChange={(e) => setGastosOrigenImp(e.target.value)}
                />
              </Campo>
            )}

            {mostrarSeguro && (
              <Campo
                label={`Seguro internacional (${moneda})`}
                hint={
                  esExport
                    ? `Incluido en ${incoterm.value}: se resta para llegar al FOB.`
                    : "Si no lo declarás se toma el 1% sobre valor + flete, que es el seguro presunto de la aduana."
                }
              >
                <input
                  className={inputCls}
                  inputMode="decimal"
                  placeholder={`1% · ${fmt(esExport ? rx.seguroIntl : r.seguro, moneda)}`}
                  value={seguroOverride}
                  onChange={(e) => setSeguroOverride(e.target.value)}
                />
              </Campo>
            )}
          </div>

        </Bloque>

        {!esExport && (
          <Bloque titulo="Perfil del importador">
            <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
              <Campo
                label="Condición del importador frente al IVA"
                hint={PERFILES.find((p) => p.value === perfil)?.desc}
              >
                <select
                  className={inputCls}
                  value={perfil}
                  onChange={(e) => setPerfil(e.target.value as PerfilFiscal)}
                >
                  {PERFILES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Campo>

              <Campo
                label="¿Para qué traés esta mercadería?"
                hint={DESTINOS.find((d) => d.value === destino)?.desc}
              >
                <select
                  className={inputCls}
                  value={destino}
                  onChange={(e) => setDestino(e.target.value as Destino)}
                >
                  {DESTINOS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </Campo>

              <Campo
                label="¿El importador tiene Certificado MiPyME o de exclusión?"
                hint="El MiPyME (RG 5501/5807) o el de exclusión (RG 5655/2025) eximen las percepciones de IVA y Ganancias. La exclusión para bienes esenciales e insumos MiPyME rige hasta el 31/12/2026 (RG 5868/2026). Es del importador de esta operación, no de quien cotiza."
              >
                <select
                  className={inputCls}
                  value={certExencionOp}
                  onChange={(e) => setCertExencionOp(e.target.value)}
                >
                  <option value="no">No</option>
                  <option value="si">Sí, vigente</option>
                </select>
              </Campo>
            </div>
          </Bloque>
        )}

        <Bloque titulo="Servicios del despacho">
          <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-3">
            <Campo label="Honorarios despachante (IVA incluido)">
              <input
                className={inputCls}
                inputMode="decimal"
                placeholder={`${HONORARIOS_PCT_DEFAULT.toLocaleString("es-AR", {
                  minimumFractionDigits: 1,
                })}%`}
                value={honorariosPct}
                onChange={(e) => setHonorariosPct(e.target.value)}
              />
            </Campo>
            <Campo label={`Mínimo con IVA (${moneda})`}>
              <input
                className={inputCls}
                inputMode="decimal"
                placeholder={String(HONORARIOS_MIN_DEFAULT)}
                value={honorariosMin}
                onChange={(e) => setHonorariosMin(e.target.value)}
              />
            </Campo>
            {esExport ? (
              <Campo
                label={`Gastos de exportación (${moneda})`}
                hint="Estimado según la carga: terminal/THC de origen, consolidación, certificados y flete interno a puerto. Ajustalo si tenés el dato real."
              >
                <input
                  className={inputCls}
                  inputMode="decimal"
                  placeholder="0"
                  value={gastosOrigen}
                  onChange={(e) => setGastosOrigen(e.target.value)}
                />
              </Campo>
            ) : (
              <Campo
                label={`Gastos locales (${moneda})`}
                hint="Estimado automático según la carga: naviera/agente, terminal o depósito fiscal y gastos de despacho. Ajustalo si tenés el dato real."
              >
                <input
                  className={inputCls}
                  inputMode="decimal"
                  placeholder="0"
                  value={gastosTerminal}
                  onChange={(e) => setGastosTerminal(e.target.value)}
                />
              </Campo>
            )}
          </div>
        </Bloque>
      </div>

      {/* Resultados */}
      <div className="panel-fijo sin-scrollbar">
        <div className="borde-girando rounded-xl border border-border glass p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-sky-800 dark:text-sky-300">
              <Calculator className="h-4 w-4" />
              Estimación
            </p>
            {/* Los supuestos no cambian el número: lo explican. Ocupaban un
                tercio del panel antes de llegar a la primera cifra, así que
                viven acá y se abren cuando hacen falta. */}
            <div className="flex shrink-0 items-center gap-1.5">
            <IntervencionesNcm ncm={clasif?.ncm} esExport={esExport} />
            <button
              type="button"
              onClick={() => setVerSupuestos((v) => !v)}
              aria-expanded={verSupuestos}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                verSupuestos
                  ? "border-accent bg-accent-soft text-sky-800 dark:text-sky-300"
                  : "border-border text-foreground/75 hover:border-accent/60 hover:text-foreground"
              }`}
            >
              <Info className="h-3.5 w-3.5" />
              Supuestos
            </button>
            </div>
          </div>

          {verSupuestos && (
          <div className="mb-3 space-y-2 rounded-lg border border-border bg-surface-2/40 p-3">
          <div className="flex flex-wrap gap-1.5">
            {clasif?.ncm && <Chip texto={`NCM ${clasif.ncm}`} />}
            {esExport ? (
              <>
                <Chip texto={`Retención (DE) ${rx.dePct}%`} />
                <Chip texto={`Reintegro ${rx.reintegroPct}%`} />
                <Chip texto="IVA exportación 0%" />
                <Chip texto="Origen: Argentina" />
              </>
            ) : (
              <>
                <Chip texto={`Derecho NCM ${derechoNcmPct}%`} />
                {derechoPreferencial && <Chip texto={`Aplicado ${r.diPct}%`} />}
                <Chip texto={`IVA ${categoria.iva}%`} />
                <Chip texto={r.tasaExenta ? "Tasa exenta" : "Tasa 3%"} />
                <Chip texto={acuerdoLabel(pais)} />
              </>
            )}
          </div>
          {!clasif && (
            <p className="text-[11px] leading-snug text-foreground/75">
              {esExport
                ? "Clasificá tu producto arriba para estimar el derecho de exportación (retención) y el reintegro."
                : "Clasificá tu producto arriba para estimar el derecho de importación y el IVA."}
            </p>
          )}
          {!esExport && notaPais(pais) && (
            <p className="text-[11px] leading-snug text-foreground/75">
              {notaPais(pais)}
            </p>
          )}
          </div>
          )}
          {!esExport && cargandoAntidumping && clasif?.ncm && (
            <p className="mb-4 rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-[11px] leading-snug text-muted">
              Verificando antidumping vigente para este origen...
            </p>
          )}
          {!esExport && hayAntidumping && (
            <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-foreground">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-700 dark:text-amber-300">
                    Posible antidumping para {pais.nombre}
                  </p>
                  <p>
                    VUCE informa medidas para esta NCM/origen. Puede subir mucho
                    el costo real y conviene confirmarlo antes de comprarle al
                    proveedor.
                  </p>
                  <ul className="space-y-0.5">
                    {medidasAntidumping.map((m, i) => {
                      const impacto = impactoFobMinimo(m, {
                        fobTotal: num(valor),
                        peso: 0,
                        moneda,
                      });
                      return (
                        <li
                          key={`${m.pais}-${m.tipoMedida}-${m.medidaAplicada}-${i}`}
                        >
                          <span className="font-semibold">{m.pais}</span>
                          {` · ${textoMedidaAntidumping(m)}`}
                          {impacto && (
                            <span className="font-medium text-amber-700 dark:text-amber-300">
                              {" "}
                              · {impacto}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {hayFobMinimo(medidasAntidumping) && (
                    <p className="text-muted">
                      Valor FOB mínimo: precio de referencia en USD por kg. Si el
                      FOB declarado es menor, se paga un derecho antidumping por la
                      diferencia.
                    </p>
                  )}
                  {!antidumping?.exacto && (
                    <p className="text-muted">
                      Alerta orientativa por partida: la posición exacta puede
                      cambiar el resultado.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {esExport && (
            <ExportPanel
              rx={rx}
              moneda={moneda}
              tieneArancel={arancel != null}
              tieneClasif={clasif != null}
              tieneValor={tieneValorMercaderia}
              fleteManual={!!fleteOverride}
              seguroManual={!!seguroOverride}
              gastosManual={!!gastosOrigen}
            />
          )}

          {!esExport && (
          <>
          <dl className="space-y-2 text-sm">
            {/* 1) Mercadería puesta a bordo + flete + seguro = CIF */}
            <Grupo titulo="Mercadería (CIF)" total={fmt(r.cif, moneda)}>
              <Linea
                label="Valor de la mercadería"
                valor={fmt(r.cif - r.flete - r.seguro, moneda)}
                sub
              />
              {r.flete > 0 && (
                <Linea
                  label="Flete"
                  valor={fmt(r.flete, moneda)}
                  sub
                />
              )}
              {r.seguro > 0 && (
                <Linea
                  label="Seguro"
                  valor={fmt(r.seguro, moneda)}
                  sub
                  nota={seguroOverride ? undefined : `(${seguroPctLabel} est.)`}
                />
              )}
            </Grupo>

            {/* 2) Tributos de nacionalización */}
            <Grupo titulo="Impuestos y tributos" total={fmt(totalImpuestos, moneda)}>
              <Linea
                label={`Derecho de importación (${r.diPct}%)`}
                valor={fmt(r.di, moneda)}
                sub
                nota={
                  derechoPreferencial
                    ? `(NCM ${derechoNcmPct}% · ${acuerdoLabel(pais)})`
                    : undefined
                }
              />
              <Linea label="Tasa de estadística" valor={fmt(r.tasa, moneda)} sub />
              <Linea
                label="IVA"
                valor={fmt(r.iva, moneda)}
                sub
                nota={regimen.recIva ? "(crédito fiscal)" : "(costo)"}
              />
              {regimen.percIvaPct > 0 && (
                <Linea
                  label={`Percepción IVA (${regimen.percIvaPct}%)`}
                  valor={fmt(r.percIva, moneda)}
                  sub
                  nota={regimen.recPercIva ? "(a cuenta)" : "(costo)"}
                />
              )}
              {regimen.percGanPct > 0 && (
                <Linea
                  label={`Percepción Ganancias (${regimen.percGanPct}%)`}
                  valor={fmt(r.percGan, moneda)}
                  sub
                  nota={regimen.recPercGan ? "(a cuenta)" : "(costo)"}
                />
              )}
              {regimen.iibbPct > 0 && (
                <Linea
                  label={`Percepción IIBB (${regimen.iibbPct}%)`}
                  valor={fmt(r.iibb, moneda)}
                  sub
                  nota={
                    regimen.recIibb ? "(a cuenta · SIRPEI)" : "(costo · SIRPEI)"
                  }
                />
              )}
            </Grupo>

            {/* 3) Honorarios del despacho + gastos locales de nacionalización */}
            <Grupo
              titulo="Despacho y gastos locales"
              total={fmt(totalGastos, moneda)}
            >
              {/* El IVA de honorarios va en la MISMA línea, no en una aparte.
                  Para un responsable inscripto no es costo —lo computa como
                  crédito fiscal—, así que darle un renglón propio dentro de
                  «gastos» lo hace parecer un gasto más y engorda la lista.
                  Para quien NO lo recupera sí es costo, y ahí se muestra
                  directamente el honorario con IVA incluido: es lo que le va a
                  salir. */}
              <Linea
                label="Honorarios despachante"
                valor={fmt(r.honorarios, moneda)}
                sub
              />
              {r.gastosTerminal > 0 && (
                <Linea
                  label="Gastos locales (naviera, terminal, despacho)"
                  valor={fmt(r.gastosTerminal, moneda)}
                  sub
                  nota={gastosTerminal ? undefined : "(estimado)"}
                />
              )}
            </Grupo>
          </dl>

          <div className="mt-3 space-y-2 border-t border-border pt-3">
            <Total
              label={`Total a desembolsar (${moneda})`}
              valor={fmt(r.desembolso, moneda)}
              accent
            />
            {r.garantia != null && (
              <>
                <Linea
                  label="Garantía a constituir (no se paga)"
                  valor={fmt(r.garantia, moneda)}
                />
                <p className="text-[11px] leading-snug text-muted">
                  Derechos, IVA y percepciones quedan suspendidos y se
                  garantizan: no salen de la caja. Si el régimen vence sin
                  cancelarse, la garantía se ejecuta y ahí sí se pagan.
                </p>
              </>
            )}
            {r.recuperable > 0 && (
              <Linea
                label="Recuperás (crédito fiscal / pago a cuenta)"
                valor={`- ${fmt(r.recuperable, moneda)}`}
                sub
              />
            )}
            {hayBanda && banda && (
              <p className="text-[11px] leading-snug text-muted">
                Según cómo clasifique exactamente el NCM, el total puede ir de{" "}
                <span className="font-semibold text-foreground">
                  {fmt(banda.lo.desembolso, moneda)}
                </span>{" "}
                a{" "}
                <span className="font-semibold text-foreground">
                  {fmt(banda.hi.desembolso, moneda)}
                </span>
                .
              </p>
            )}
          </div>

          <BotonDescargarEstimacion
            payload={{
              modo,
              destinacion,
              descripcion: clasif?.descripcion ?? null,
              ncm: clasif?.ncm ?? null,
              pais: pais.nombre,
              via: via.label,
              incoterm: incoterm?.value ?? "—",
              moneda,
              cantidad: null,
              unidad: null,
              perfilLabel:
                PERFILES.find((p) => p.value === perfil)?.label ?? "Responsable inscripto",
              destinoLabel: destino === "reventa" ? "Reventa" : "Uso propio",
              cifra: {
                valor: r.cif - r.flete - r.seguro,
                flete: r.flete,
                seguro: r.seguro,
                cif: r.cif,
                diPct: r.diPct,
                di: r.di,
                tasa: r.tasa,
                tasaExenta: r.tasaExenta,
                ivaPct: categoria.iva,
                iva: r.iva,
                percIva: r.percIva,
                percGan: r.percGan,
                iibb: r.iibb,
                honorarios: r.honorarios,
                honorariosIva: r.honorariosIva,
                gastosTerminal: r.gastosTerminal,
                recuperable: r.recuperable,
                desembolso: r.desembolso,
                costoReal: r.costoReal,
                porUnidad: r.porUnidad,
                garantia: r.garantia,
                suspensiva: r.suspensiva,
              },
            }}
          />
          </>
          )}
        </div>
      </div>
    </div>
  );
}

function Bloque({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-3 w-0.5 rounded-full bg-accent" />
        <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-sky-800 dark:text-sky-300">
          {titulo}
        </h3>
      </div>
      {children}
    </section>
  );
}

function Campo({
  label,
  hint,
  full,
  className = "",
  children,
}: {
  label: string;
  /** Se muestra como tooltip del rótulo, no como renglón debajo del campo. */
  hint?: string;
  full?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${full ? "col-span-2 sm:col-span-2" : ""} ${className}`}>
      <label
        className={`${labelCls} ${hint ? "cursor-help decoration-dotted underline-offset-2 hover:underline" : ""}`}
        title={hint}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Chip({ texto }: { texto: string }) {
  return (
    <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[10px] font-medium text-muted">
      {texto}
    </span>
  );
}

function Grupo({
  titulo,
  total,
  children,
}: {
  titulo: string;
  total: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-foreground/80">
          {titulo}
        </span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {total}
        </span>
      </div>
      {children}
    </div>
  );
}

function Linea({
  label,
  valor,
  sub,
  nota,
}: {
  label: ReactNode;
  valor: string;
  sub?: boolean;
  nota?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={sub ? "text-foreground/75" : "text-foreground"}>
        {label}
        {nota && (
          <span className="ml-1 text-[10px] text-foreground/60">{nota}</span>
        )}
      </dt>
      <dd
        className={`tabular-nums ${
          sub ? "text-muted" : "font-medium text-foreground"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}

function Total({
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
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span
        className={`text-lg font-bold tabular-nums ${
          accent ? "text-accent" : "text-foreground"
        }`}
      >
        {valor}
      </span>
    </div>
  );
}

function ExportPanel({
  rx,
  moneda,
  tieneArancel,
  tieneClasif,
  tieneValor,
  fleteManual,
  seguroManual,
  gastosManual,
}: {
  rx: ExportarResult;
  moneda: string;
  tieneArancel: boolean;
  tieneClasif: boolean;
  tieneValor: boolean;
  fleteManual: boolean;
  seguroManual: boolean;
  gastosManual: boolean;
}) {
  const costoPctLabel = rx.costoPct.toLocaleString("es-AR", {
    maximumFractionDigits: 1,
  });
  return (
    <>
      <dl className="space-y-2 text-sm">
        {/* Base FOB (sólo para mostrar de dónde sale, si hay que despejarlo) */}
        {(rx.fleteIntl > 0 || rx.seguroIntl > 0) && (
          <Grupo titulo="Base FOB" total={fmt(rx.fob, moneda)}>
            {rx.fleteIntl > 0 && (
              <Linea
                label="(−) Flete internacional"
                valor={`- ${fmt(rx.fleteIntl, moneda)}`}
                sub
                nota={fleteManual ? undefined : "(estimado)"}
              />
            )}
            {rx.seguroIntl > 0 && (
              <Linea
                label="(−) Seguro internacional"
                valor={`- ${fmt(rx.seguroIntl, moneda)}`}
                sub
                nota={seguroManual ? undefined : "(estimado)"}
              />
            )}
            <Linea label="= FOB (base imponible)" valor={fmt(rx.fob, moneda)} />
          </Grupo>
        )}

        {/* 1) Derecho de exportación (retención) */}
        <Grupo titulo="Derecho de exportación" total={fmt(rx.de, moneda)}>
          <Linea
            label={`Retención (${rx.dePct}% del FOB)`}
            valor={fmt(rx.de, moneda)}
            sub
            nota="(la cobra Aduana)"
          />
        </Grupo>

        {/* 2) Nuestro servicio y gastos hasta a bordo */}
        <Grupo
          titulo="Servicio y gastos (hasta a bordo)"
          total={fmt(rx.honorarios + rx.gastosOrigen, moneda)}
        >
          <Linea
            label="Honorarios despachante"
            valor={fmt(rx.honorarios, moneda)}
            sub
          />
          {rx.gastosOrigen > 0 && (
            <Linea
              label={
                <>
                  Gastos en origen{" "}
                  <span className="text-[10px] text-muted">(varios)</span>
                </>
              }
              valor={fmt(rx.gastosOrigen, moneda)}
              sub
              nota={gastosManual ? undefined : "(estimado)"}
            />
          )}
        </Grupo>
      </dl>

      <div className="mt-3 space-y-2 border-t border-border pt-3">
        <Total
          label={`Costo de exportar (${moneda})`}
          valor={fmt(rx.costoExportacion, moneda)}
          accent
        />
        {rx.fob > 0 && (
          <Linea
            label="Costo sobre el FOB"
            valor={`${costoPctLabel}%`}
            sub
          />
        )}
      </div>


      {rx.reintegro > 0 && (
        <p className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] leading-snug text-foreground">
          Aparte, te corresponde un{" "}
          <span className="font-semibold">
            reintegro de exportación de ~{fmt(rx.reintegro, moneda)}
          </span>{" "}
          ({rx.reintegroPct}% del FOB), que el Estado paga DESPUÉS del cumplido de
          embarque. No lo descontamos del costo: es un recupero posterior.
        </p>
      )}

      {tieneClasif && !tieneArancel && (
        <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-foreground">
          No encontramos el derecho de exportación oficial para esta posición:
          afiná la clasificación hasta la NCM exacta para tomar el valor del
          nomenclador.
        </p>
      )}
      {!tieneValor && (
        <p className="mt-3 rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-[11px] leading-snug text-muted">
          Cargá el valor de venta para estimar el costo de exportar.
        </p>
      )}
    </>
  );
}

function ResultadoClasif({
  r,
  sel,
  textoLibre,
  onSelect,
  onTextoLibre,
  onAfinar,
  afinando,
}: {
  r: ClasificacionResultado;
  sel: Record<string, string>;
  textoLibre: Record<string, string>;
  onSelect: (pregunta: string, opcion: string) => void;
  onTextoLibre: (pregunta: string, texto: string) => void;
  onAfinar: () => void;
  afinando: boolean;
}) {
  if (r.decision === "SIN_RESULTADO") {
    return (
      <div className="mt-3 rounded-xl border border-border bg-surface-2/40 px-4 py-3 text-[11px] leading-snug text-muted">
        No pudimos clasificarlo automáticamente. Probá con otra descripción o
        escribinos y lo clasificamos nosotros.
      </div>
    );
  }

  const preguntas = r.preguntas ?? [];

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-accent/30 bg-surface-2/40 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {r.ncm && (
          <span className="rounded-md bg-accent/15 px-2 py-0.5 font-mono text-xs font-semibold text-accent">
            NCM {r.ncm}
          </span>
        )}
        {r.derecho != null && <Chip texto={`Derecho ${r.derecho}%`} />}
        {r.iva != null && (
          <Chip texto={`IVA ${r.iva}%${r.ivaEstimado ? " est." : ""}`} />
        )}
      </div>

      {r.descripcion && (
        <p className="text-xs font-medium leading-snug text-foreground">
          {r.descripcion}
        </p>
      )}
      {r.justificacion && (
        <p className="text-[11px] leading-snug text-muted">{r.justificacion}</p>
      )}

      {preguntas.length > 0 && (
        <ClasificadorPreguntas
          preguntas={preguntas}
          fasePartida={r.fasePregunta === "partida"}
          sel={sel}
          textoLibre={textoLibre}
          onSelect={onSelect}
          onTextoLibre={onTextoLibre}
          onAfinar={onAfinar}
          afinando={afinando}
          className="px-3 py-3"
        />
      )}

      <p className="text-[10px] leading-snug text-muted">
        Estimación orientativa. El costo depende de la clasificación (NCM): una
        clasificación distinta puede cambiar el derecho y el costo final de forma
        importante. La NCM definitiva la confirma el estudio antes de operar.
      </p>
    </div>
  );
}
