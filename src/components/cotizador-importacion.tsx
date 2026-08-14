"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Calculator, Info, Loader2, Sparkles } from "lucide-react";
import {
  DESTINOS,
  HONORARIOS_MIN_DEFAULT,
  HONORARIOS_PCT_DEFAULT,
  PAISES,
  PERFILES_FISCALES,
  VIAS,
  acuerdoLabel,
  cotizar,
  cotizarExportacion,
  gastosExportacionOrigen,
  incotermsPermitidos,
  notaPais,
  perfilDesdeCondicionIva,
  regimenPercepciones,
  type Categoria,
  type Destino,
  type ExportarResult,
} from "@/lib/cotizador";
import type {
  ClasificacionResultado,
  Respuesta,
} from "@/lib/clasificador/tipos";
import { consecuenciaParaOpcion } from "@/lib/clasificador/tipos";
import {
  TIPOS_CONTENEDOR,
  calcularLogistica,
  modalidadDe,
  type TipoContenedor,
} from "@/lib/costos-logistica";
import { UNIDADES } from "@/lib/unidades";
import { IntervencionesNcm } from "@/components/intervenciones-ncm";
import { ClasificadorPreguntas } from "@/components/clasificador-preguntas";
import {
  esPreguntaNcmMaquinaPadre,
  normalizarNcmMaquina,
} from "@/lib/clasificador/preguntas-sistema";

const inputCls =
  "h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
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

export function CotizadorImportacion({
  ivaCondition,
  certExencion,
}: {
  ivaCondition?: string | null;
  certExencion?: string | null;
}) {
  // Datos GENERALES del perfil del cliente (se cargan en el registro y se toman
  // de acá automáticamente): condición fiscal y certificado de exención.
  const perfil = perfilDesdeCondicionIva(ivaCondition);
  const certExencionActiva = (certExencion ?? "").toLowerCase() === "si";
  const perfilActual = PERFILES_FISCALES.find((p) => p.value === perfil);
  const sinPerfil = !ivaCondition;

  // Importación o exportación: define qué campos y qué tributos aplican.
  const [modo, setModo] = useState<"importacion" | "exportacion">(
    "importacion",
  );
  const esExport = modo === "exportacion";

  // Destino de la mercadería: específico de cada despacho (reventa vs uso propio).
  const [destino, setDestino] = useState<Destino>("reventa");

  const recuperaIva = perfil === "responsable_inscripto";

  // Datos que carga el cliente
  const [paisNombre, setPaisNombre] = useState(PAISES[0].nombre);
  const [incotermValue, setIncotermValue] = useState("FOB");
  const [viaValue, setViaValue] = useState("maritima");
  // En comercio exterior el valor de referencia es el dólar y el cotizador no
  // hace conversión de divisas: fijamos USD en todo el cálculo.
  const moneda = "USD";
  const [valor, setValor] = useState("");
  const [peso, setPeso] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [unidad, setUnidad] = useState("Unidades");
  // Tipo de carga: define el flete (FCL por contenedor) y los gastos locales.
  const [tipoCarga, setTipoCarga] = useState<TipoContenedor>("20STD");
  const [cantContenedores, setCantContenedores] = useState("1");
  // Volumen en m³ (CBM): para LCL el flete y la terminal se cobran por W/M.
  const [cbm, setCbm] = useState("");

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
    // Ajustamos el tipo de carga por defecto según la vía.
    if (value === "aerea") setTipoCarga("AEREO");
    else if (tipoCarga === "AEREO") setTipoCarga("20STD");
  }

  // Tipo de carga efectivo (aéreo siempre AEREO; marítimo/terrestre, el elegido).
  const tipoCargaEf: TipoContenedor =
    viaValue === "aerea" ? "AEREO" : tipoCarga === "AEREO" ? "20STD" : tipoCarga;
  const modalidadCarga = modalidadDe(tipoCargaEf);
  const cantCont = Math.max(1, Math.floor(num(cantContenedores) || 1));
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

  // Opciones de tipo de carga según la vía.
  const opcionesCarga = useMemo(() => {
    if (viaValue === "aerea") {
      return TIPOS_CONTENEDOR.filter((t) => t.modalidad === "AEREO");
    }
    // Marítima y terrestre: contenedores (FCL) o carga suelta (LCL).
    return TIPOS_CONTENEDOR.filter((t) => t.modalidad !== "AEREO");
  }, [viaValue]);

  // Gastos locales de nacionalización estimados (naviera/terminal/despacho).
  const logistica = useMemo(
    () =>
      calcularLogistica({
        tipo: tipoCargaEf,
        cantidad: cantCont,
        via: viaValue,
        pesoKg: num(peso),
        cbm: num(cbm),
      }),
    [tipoCargaEf, cantCont, viaValue, peso, cbm],
  );
  const gastosLocalesEst = tieneValorMercaderia ? logistica.costoLogistica : 0;
  // Exportación: gastos de origen estimados según la carga.
  const gastosOrigenEst = tieneValorMercaderia
    ? gastosExportacionOrigen(tipoCargaEf, cantCont)
    : 0;

  const r = useMemo(
    () =>
      cotizar({
        valor: valorNum,
        peso: num(peso),
        cantidad: num(cantidad),
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
        fleteOverride: fleteOverride ? num(fleteOverride) : null,
        seguroOverride: seguroOverride ? num(seguroOverride) : null,
        tipoContenedor: tipoCargaEf,
        cantContenedores: cantCont,
        cbm: num(cbm),
        honorariosPct: num(honorariosPct),
        honorariosMin: num(honorariosMin),
        gastosTerminal: gastosTerminal ? num(gastosTerminal) : gastosLocalesEst,
        tipoCambio: null,
        otrosArs: 0,
      }),
    [
      valorNum,
      peso,
      cantidad,
      categoria,
      pais,
      incoterm,
      via,
      regimen,
      fleteOverride,
      seguroOverride,
      tipoCargaEf,
      cantCont,
      cbm,
      honorariosPct,
      honorariosMin,
      gastosTerminal,
      gastosLocalesEst,
    ],
  );

  // Exportación: derecho de exportación (DE), reintegro y neto sobre FOB.
  const rx = useMemo(
    () =>
      cotizarExportacion({
        valor: valorNum,
        pesoKg: num(peso),
        cantidad: num(cantidad),
        dePct: arancel?.de ?? 0,
        reintegroPct: arancel?.reintegro ?? 0,
        incoterm,
        via,
        fleteOverride: fleteOverride ? num(fleteOverride) : null,
        seguroOverride: seguroOverride ? num(seguroOverride) : null,
        honorariosPct: num(honorariosPct),
        honorariosMin: num(honorariosMin),
        gastosOrigen: gastosOrigen ? num(gastosOrigen) : gastosOrigenEst,
        tipoContenedor: tipoCargaEf,
        cantContenedores: cantCont,
        cbm: num(cbm),
      }),
    [
      valorNum,
      peso,
      cantidad,
      arancel,
      incoterm,
      via,
      fleteOverride,
      seguroOverride,
      honorariosPct,
      honorariosMin,
      gastosOrigen,
      gastosOrigenEst,
      tipoCargaEf,
      cantCont,
      cbm,
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
      peso: num(peso),
      cantidad: num(cantidad),
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
      fleteOverride: fleteOverride ? num(fleteOverride) : null,
      seguroOverride: seguroOverride ? num(seguroOverride) : null,
      tipoContenedor: tipoCargaEf,
      cantContenedores: cantCont,
      cbm: num(cbm),
      honorariosPct: num(honorariosPct),
      honorariosMin: num(honorariosMin),
      gastosTerminal: gastosTerminal ? num(gastosTerminal) : gastosLocalesEst,
      tipoCambio: null,
      otrosArs: 0,
    };
    return {
      lo: cotizar({ ...base, diPctOverride: posDiMin }),
      hi: cotizar({ ...base, diPctOverride: posDiMax }),
    };
  }, [
    valorNum,
    peso,
    cantidad,
    categoria,
    pais,
    incoterm,
    via,
    regimen,
    fleteOverride,
    seguroOverride,
    tipoCargaEf,
    cantCont,
    cbm,
    honorariosPct,
    honorariosMin,
    gastosTerminal,
    gastosLocalesEst,
    posDiMin,
    posDiMax,
  ]);

  const hayBanda = banda != null && banda.hi.desembolso !== banda.lo.desembolso;

  // Subtotales para el desglose en 3 bloques (CIF / impuestos / despacho+locales).
  const totalImpuestos =
    r.di + r.tasa + r.iva + r.percIva + r.percGan + r.iibb;
  const totalGastos = r.honorarios + r.honorariosIva + r.gastosTerminal;

  // Costo final según el perfil fiscal: el modelo ya descuenta del costo real lo
  // recuperable (RI) y deja como costo el IVA/percepciones no recuperables
  // (monotributo, exento, consumidor final).
  const cant = num(cantidad);
  const costoFinal = r.costoReal;
  const porUnidadFinal = cant > 0 ? costoFinal / cant : null;
  const derechoNcmPct = categoria.di;
  const derechoPreferencial = clasif != null && derechoNcmPct !== r.diPct;
  const medidasAntidumping = dedupMedidas(antidumping?.medidas ?? []);
  const hayAntidumping = medidasAntidumping.length > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
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
                  onClick={() => setModo(value)}
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
          <p className={`mt-2 ${hintCls}`}>
            {esExport
              ? "Exportación: estimamos el derecho de exportación (retención), el reintegro y el neto sobre el FOB."
              : "Importación: estimamos el derecho de importación, el IVA, las percepciones y el costo de nacionalizar."}
          </p>
        </Bloque>

        <Bloque titulo={esExport ? "¿Qué vas a exportar?" : "¿Qué vas a importar?"}>
          <p className={hintCls}>
            Describí lo que vas a traer y te sugerimos la posición NCM con su
            derecho de importación e IVA. Si hace falta precisar, te hacemos un
            par de preguntas.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              className={inputCls}
              placeholder="Ej.: zapatillas de cuero, notebook, vino tinto…"
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
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-semibold text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
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
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
            {!esExport && (
              <Campo label="País de origen">
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
            <Campo label="Vía de transporte">
              <select
                className={inputCls}
                value={viaValue}
                onChange={(e) => cambiarVia(e.target.value)}
              >
                {VIAS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo
              label="Incoterm (condición de compra)"
              hint={
                viaValue === "maritima"
                  ? undefined
                  : "Por aérea/terrestre solo aplican Incoterms multimodales (no FOB/CFR/CIF/FAS)."
              }
            >
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

        <Bloque titulo="Valor y volumen">
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
            <Campo label="Valor de la mercadería" full>
              <div className="flex gap-2">
                <span className="inline-flex h-11 shrink-0 items-center rounded-lg border border-border bg-surface-2/60 px-3 text-sm font-semibold text-muted">
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
            <p className={`${hintCls} -mt-2 sm:col-span-2`}>
              {esExport
                ? `Tu precio de venta en la condición ${incoterm.value}. La retención y el reintegro se calculan sobre el FOB.`
                : `Valor en la condición ${incoterm.value}. Lo llevamos al CIF para liquidar los tributos.`}
            </p>
            <Campo label="Peso total (kg)" full>
              <input
                className={inputCls}
                inputMode="decimal"
                placeholder="0"
                value={peso}
                onChange={(e) => setPeso(e.target.value)}
              />
            </Campo>
            <Campo label="Unidad">
              <select
                className={inputCls}
                value={unidad}
                onChange={(e) => setUnidad(e.target.value)}
              >
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Cantidad">
              <input
                className={inputCls}
                inputMode="decimal"
                placeholder="0"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </Campo>
            <Campo
              label="Tipo de carga"
              hint="Define el flete (en contenedor se cobra por contenedor) y los gastos de terminal."
            >
              <select
                className={inputCls}
                value={tipoCargaEf}
                onChange={(e) => setTipoCarga(e.target.value as TipoContenedor)}
                disabled={viaValue === "aerea"}
              >
                {opcionesCarga.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Campo>
            {modalidadCarga === "FCL" && (
              <Campo label="Cantidad de contenedores">
                <input
                  className={inputCls}
                  inputMode="numeric"
                  placeholder="1"
                  value={cantContenedores}
                  onChange={(e) => setCantContenedores(e.target.value)}
                />
              </Campo>
            )}
            {modalidadCarga === "LCL" && (
              <Campo
                label="Volumen total (m³)"
                hint="En carga suelta el flete se cobra por W/M: la mayor entre el peso (en toneladas) y el volumen (m³)."
              >
                <input
                  className={inputCls}
                  inputMode="decimal"
                  placeholder="0"
                  value={cbm}
                  onChange={(e) => setCbm(e.target.value)}
                />
              </Campo>
            )}
          </div>
          {(mostrarFlete || mostrarSeguro) && (
            <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
              {mostrarFlete && (
                <Campo
                  label={`Flete internacional (${moneda})`}
                  hint={
                    !tieneValorMercaderia
                      ? esExport
                        ? `Tu precio ${incoterm.value} incluye flete. Lo estimamos cuando cargues el valor.`
                        : `Tu precio ${incoterm.value} no incluye flete. Lo estimamos cuando cargues el valor.`
                      : esExport
                        ? `Tu precio ${incoterm.value} incluye el flete: lo restamos para llegar al FOB (base de la retención). Si no lo sabés: ${fmt(rx.fleteIntl, moneda)}.`
                        : `Tu precio ${incoterm.value} no incluye flete y lo necesitamos para armar el CIF. Si no lo sabés, lo estimamos: ${fmt(r.flete, moneda)}.`
                  }
                >
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    placeholder={
                      tieneValorMercaderia
                        ? `auto · ${fmt(esExport ? rx.fleteIntl : r.flete, moneda)}`
                        : "auto al completar"
                    }
                    value={fleteOverride}
                    onChange={(e) => setFleteOverride(e.target.value)}
                  />
                </Campo>
              )}
              {mostrarSeguro && (
                <Campo
                  label={`Seguro internacional (${moneda})`}
                  hint={
                    !tieneValorMercaderia
                      ? esExport
                        ? `Incluido en ${incoterm.value}. Lo estimamos cuando cargues el valor.`
                        : `No incluido en ${incoterm.value}. Lo estimamos cuando cargues el valor.`
                      : esExport
                        ? `Incluido en ${incoterm.value}: lo restamos para llegar al FOB. Si no lo sabés: ${fmt(rx.seguroIntl, moneda)}.`
                        : `No incluido en ${incoterm.value}. Si no lo sabés, estimamos ${seguroPctLabel}: ${fmt(r.seguro, moneda)}.`
                  }
                >
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    placeholder={
                      tieneValorMercaderia
                        ? `auto · ${fmt(esExport ? rx.seguroIntl : r.seguro, moneda)}`
                        : "auto al completar"
                    }
                    value={seguroOverride}
                    onChange={(e) => setSeguroOverride(e.target.value)}
                  />
                </Campo>
              )}
            </div>
          )}
          {esExport && (mostrarFlete || mostrarSeguro) && (
            <p className="mt-3 rounded-lg border border-accent/30 bg-accent-soft/40 px-3 py-2 text-[11px] leading-snug text-foreground">
              La retención y el reintegro se calculan sobre el{" "}
              <span className="font-semibold">FOB</span>. Como tu Incoterm (
              {incoterm.value}) incluye{" "}
              {mostrarFlete && mostrarSeguro
                ? "flete y seguro"
                : mostrarFlete
                  ? "el flete"
                  : "el seguro"}
              , los restamos del valor de venta para reconstruir el FOB (o con un
              estimado si los dejás vacíos).
            </p>
          )}
          {!esExport && (!incoterm.incluyeFlete || !incoterm.incluyeSeguro) && (
            <p className="mt-3 rounded-lg border border-accent/30 bg-accent-soft/40 px-3 py-2 text-[11px] leading-snug text-foreground">
              Para nacionalizar siempre se calcula sobre el{" "}
              <span className="font-semibold">CIF</span> (valor + flete + seguro).
              Como tu Incoterm ({incoterm.value}) no incluye{" "}
              {!incoterm.incluyeFlete && !incoterm.incluyeSeguro
                ? "flete ni seguro"
                : !incoterm.incluyeFlete
                  ? "el flete"
                  : "el seguro"}
              , lo reconstruimos con esos valores (o con un estimado si los dejás
              vacíos).
            </p>
          )}
        </Bloque>

        {!esExport && (
          <Bloque titulo="Destino de la mercadería">
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
          </Bloque>
        )}

        <Bloque titulo="Servicios del despacho">
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-3">
            <Campo
              label="Honorarios despachante"
              hint={
                esExport
                  ? "Sobre el FOB. Se cobra el mayor entre este % y el mínimo."
                  : "Sobre el CIF. Se cobra el mayor entre este % y el mínimo."
              }
            >
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
            <Campo label={`Honorarios mínimo (${moneda})`}>
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
                  placeholder={
                    tieneValorMercaderia
                      ? `auto · ${fmt(gastosOrigenEst, moneda)}`
                      : "auto al completar"
                  }
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
                  placeholder={
                    tieneValorMercaderia
                      ? `auto · ${fmt(gastosLocalesEst, moneda)}`
                      : "auto al completar"
                  }
                  value={gastosTerminal}
                  onChange={(e) => setGastosTerminal(e.target.value)}
                />
              </Campo>
            )}
          </div>
        </Bloque>
      </div>

      {/* Resultados */}
      <div className="space-y-4 lg:sticky lg:top-4">
        <div className="neon-top rounded-2xl border border-border glass p-5">
          <div className="mb-4 flex items-center gap-2">
            <Calculator className="h-4 w-4 text-accent" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              Estimación
            </p>
          </div>

          {/* Resumen de supuestos */}
          <div className="mb-3 flex flex-wrap gap-1.5">
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
            <p className="mb-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-[11px] leading-snug text-muted">
              {esExport
                ? "Clasificá tu producto arriba para estimar el derecho de exportación (retención) y el reintegro."
                : "Clasificá tu producto arriba para estimar el derecho de importación y el IVA."}
            </p>
          )}
          {!esExport && notaPais(pais) && (
            <p className="mb-4 rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-[11px] leading-snug text-muted">
              {notaPais(pais)}
            </p>
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
                        peso: num(peso),
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

          <IntervencionesNcm ncm={clasif?.ncm} esExport={esExport} />

          {esExport && (
            <ExportPanel
              rx={rx}
              moneda={moneda}
              unidad={unidad}
              cantidad={cant}
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
          <dl className="space-y-3 text-sm">
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
                  nota={
                    fleteOverride
                      ? undefined
                      : viaValue === "maritima" && modalidadCarga === "FCL"
                        ? "(est. x contenedor)"
                        : viaValue === "maritima" && modalidadCarga === "LCL"
                          ? "(est. x volumen W/M)"
                          : "(estimado)"
                  }
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
              <Linea
                label="Honorarios despachante"
                valor={fmt(r.honorarios, moneda)}
                sub
                nota={
                  r.honorarios > (r.cif * num(honorariosPct)) / 100
                    ? "(mínimo)"
                    : `(${num(honorariosPct)}% s/ CIF)`
                }
              />
              <Linea
                label="IVA honorarios"
                valor={fmt(r.honorariosIva, moneda)}
                sub
                nota={regimen.recHonorariosIva ? "(crédito fiscal)" : "(costo)"}
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

          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <Total
              label={`Total a desembolsar (${moneda})`}
              valor={fmt(r.desembolso, moneda)}
              accent
            />
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

          <div className="mt-4 rounded-xl border border-border bg-surface-2/40 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-medium text-muted">
                Costo final real estimado{" "}
                <span className="text-[10px]">
                  {recuperaIva
                    ? "(neto de IVA y percepciones)"
                    : "(IVA y percepciones incluidos)"}
                </span>
              </span>
              <span className="text-sm font-semibold text-foreground">
                {fmt(costoFinal, moneda)}
              </span>
            </div>
            {porUnidadFinal != null && (
              <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border/60 pt-2">
                <span className="text-xs font-medium text-muted">
                  Costo por {unidad.toLowerCase()}
                </span>
                <span className="text-sm font-semibold text-accent">
                  {fmt(porUnidadFinal, moneda)}
                </span>
              </div>
            )}
          </div>
          </>
          )}
        </div>

        <div className="flex gap-2 rounded-xl border border-border bg-surface-2/40 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p className="text-[11px] leading-relaxed text-muted">
            Cálculo <span className="font-semibold">estimado</span>. En la
            práctica el número puede variar un poco según la clasificación exacta
            (NCM) y otros detalles de la operación, pero en líneas generales esto
            es lo que te va a salir. Los honorarios del despachante son
            orientativos, no el valor final.{" "}
            <span className="font-semibold text-foreground">
              Por cualquier consulta, completá el formulario en Operaciones.
            </span>
          </p>
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
    <section className="rounded-2xl border border-border bg-surface/80 p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="h-3.5 w-1 rounded-full bg-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-accent">
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
  children,
}: {
  label: string;
  hint?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${full ? "col-span-2 sm:col-span-2" : ""}`}>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className={hintCls}>{hint}</p>}
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
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
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
      <dt className={sub ? "text-muted" : "text-foreground"}>
        {label}
        {nota && <span className="ml-1 text-[10px] text-muted">{nota}</span>}
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
  unidad,
  cantidad,
  tieneArancel,
  tieneClasif,
  tieneValor,
  fleteManual,
  seguroManual,
  gastosManual,
}: {
  rx: ExportarResult;
  moneda: string;
  unidad: string;
  cantidad: number;
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
      <dl className="space-y-3 text-sm">
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
          <Linea
            label="IVA honorarios"
            valor={fmt(rx.honorariosIva, moneda)}
            sub
            nota="(recuperable)"
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

      <div className="mt-4 space-y-3 border-t border-border pt-4">
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

      {cantidad > 0 && rx.porUnidad != null && (
        <div className="mt-4 rounded-xl border border-border bg-surface-2/40 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium text-muted">
              Costo por {unidad.toLowerCase()}
            </span>
            <span className="text-sm font-semibold text-accent">
              {fmt(rx.porUnidad, moneda)}
            </span>
          </div>
        </div>
      )}

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
