"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  FileUp,
  Loader2,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import type {
  ClasificacionResultado,
  PosicionEnMira,
  Respuesta,
  PartidaEvaluada,
  SubpartidaNcm,
  SufijoNcm,
  NotaNcm,
} from "@/lib/clasificador/tipos";
import { consecuenciaParaOpcion } from "@/lib/clasificador/tipos";
import {
  normalizarNcmMaquina,
  esPreguntaNcmMaquinaPadre,
} from "@/lib/clasificador/preguntas-sistema";
import { siguienteEnPlan } from "@/lib/clasificador/plan-cuestionario";
import {
  derivarEstadoExpediente,
  etiquetaEstado,
} from "@/lib/clasificador/estado";
import { ClasificadorPreguntas } from "@/components/clasificador-preguntas";
import { NomencladorManual } from "@/components/nomenclador-manual";

type TramiteVuce = { nombre: string | null; link: string | null };

type IntervencionVuce = {
  organismo: string;
  clase: "intervencion_previa" | "regimen_opcional";
  regimen: string | null;
  resumen: string | null;
  estados: string[];
  validada: boolean;
  tramites: TramiteVuce[];
};

type AntidumpingVuce = {
  posicion: string;
  producto: string | null;
  medidaAplicada: string | null;
  tipoMedida: string | null;
  vencimiento: string | null;
  pais: string;
  normativa: string | null;
};

type TributoVuce = { concepto: string; valores: number[] };

/** Aranceles aplicables por NCM (VUCE + nomenclador ARCA). */
type ArancelNcm = {
  codigo?: string;
  /** DIE extrazona aplicable en Argentina. */
  di: number;
  diNominal?: number;
  aec?: number | null;
  dii?: number | null;
  te?: number | null;
  bk?: boolean;
  dieRegimen?: string | null;
  /** ar1: Derecho de Exportación (DE / retención). */
  de: number;
  /** ar2: Reintegro a la exportación (extrazona). */
  reintegro: number;
  /** ar4: Reintegro a la exportación (intrazona). */
  reintegroIntra: number;
  /** ar5: Derecho adicional (sectores sensibles). */
  adicional: number;
  iva: number;
  ivaAdicional?: number | null;
  ganancias?: number | null;
  iibb?: number | null;
  ivaEstimado?: boolean;
};

type FichaPosicion = {
  ncm8: string | null;
  intervenciones: IntervencionVuce[];
  regimenes: IntervencionVuce[];
  antidumping: AntidumpingVuce[];
  antidumpingPaises: string[];
  tributos: TributoVuce[];
};

const inputCls =
  "h-12 w-full rounded-lg border border-border bg-surface px-4 text-base text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

const ACCEPT_CATALOGO =
  "application/pdf,image/jpeg,image/png,image/gif,image/webp";

/**
 * Describe una medida antidumping de forma legible, con su unidad:
 * - "FOB Mínimo" → valor FOB mínimo de referencia en USD por kilogramo.
 * - "Ad Valorem" → derecho expresado como porcentaje sobre el valor.
 */
function descMedidaAntidumping(
  tipo: string | null,
  valor: string | null,
): string {
  const t = (tipo ?? "").toLowerCase();
  const v = (valor ?? "").trim().replace(".", ",");
  if (!v) return tipo ?? "Medida vigente";
  if (t.includes("ad valorem")) return `Derecho antidumping ${v}% (ad valorem)`;
  if (t.includes("fob") || t.includes("mínimo") || t.includes("minimo")) {
    return `Valor FOB mínimo USD ${v} por kg`;
  }
  return `${tipo ?? ""} ${v}`.trim();
}

/** ¿Hay alguna medida de tipo "FOB mínimo" en la lista? (para mostrar la ayuda). */
function hayFobMinimo(medidas: { tipoMedida: string | null }[]): boolean {
  return medidas.some((m) =>
    (m.tipoMedida ?? "").toLowerCase().includes("fob") ||
    (m.tipoMedida ?? "").toLowerCase().includes("mínimo") ||
    (m.tipoMedida ?? "").toLowerCase().includes("minimo"),
  );
}

/** Parsea una fecha "D/M/AAAA" (formato VUCE) a Date, o null si no es válida. */
function parseFechaVuce(s: string | null): Date | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Una medida está vencida si su fecha de vencimiento ya pasó (con fecha válida). */
function medidaVencida(vencimiento: string | null): boolean {
  const f = parseFechaVuce(vencimiento);
  if (!f) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return f.getTime() < hoy.getTime();
}

/**
 * Buscador de posición NCM: solo el clasificador con IA, en grande. Pensado para
 * que el equipo consulte rápido la posición correcta de un producto.
 */
export function NomencladorClasificador() {
  // Importación o exportación: define qué datos se muestran de la posición.
  const [modo, setModo] = useState<"importacion" | "exportacion" | "manual">(
    "importacion",
  );
  const esExport = modo === "exportacion";
  const esManual = modo === "manual";
  const [consulta, setConsulta] = useState("");
  const [catalogoNombre, setCatalogoNombre] = useState<string | null>(null);
  const [catalogoResumen, setCatalogoResumen] = useState<string | null>(null);
  const [mostrarEntradaCatalogo, setMostrarEntradaCatalogo] = useState(true);
  const [clasificando, setClasificando] = useState(false);
  const [clasif, setClasif] = useState<ClasificacionResultado | null>(null);
  const [errorClasif, setErrorClasif] = useState<string | null>(null);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [textoLibre, setTextoLibre] = useState<Record<string, string>>({});
  const [respuestasAcum, setRespuestasAcum] = useState<Respuesta[]>([]);
  const [ficha, setFicha] = useState<FichaPosicion | null>(null);
  const [fichaCargando, setFichaCargando] = useState(false);
  const [arancel, setArancel] = useState<ArancelNcm | null>(null);
  const clasifSeq = useRef(0);

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

  async function ejecutarClasificacion(
    q: string,
    respuestas?: Respuesta[],
    sesion?: ClasificacionResultado | null,
  ) {
    const seq = ++clasifSeq.current;
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
      if (seq !== clasifSeq.current) return;
      if (!res.ok || !data.ok) {
        setErrorClasif(data.error ?? "No se pudo clasificar.");
        return;
      }
      setClasif(data.resultado as ClasificacionResultado);
    } catch {
      if (seq !== clasifSeq.current) return;
      setErrorClasif("Error de conexión. Probá de nuevo.");
    } finally {
      if (seq === clasifSeq.current) setClasificando(false);
    }
  }

  function reiniciarSesion() {
    setClasif(null);
    setFicha(null);
    setSel({});
    setTextoLibre({});
    setRespuestasAcum([]);
    setErrorClasif(null);
  }

  function clasificar() {
    const q = consulta.trim();
    if (q.length < 2 || clasificando) return;
    setMostrarEntradaCatalogo(false);
    reiniciarSesion();
    void ejecutarClasificacion(q);
  }

  async function subirCatalogo(file: File) {
    if (clasificando) return;
    setMostrarEntradaCatalogo(false);
    reiniciarSesion();
    setErrorClasif(null);
    setClasificando(true);
    let texto = "";
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/clasificar/catalogo", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorClasif(data.error ?? "No se pudo leer el catálogo.");
        return;
      }
      texto = String(data.texto ?? "").trim();
      if (texto.length < 2) {
        setErrorClasif("El archivo no tiene texto utilizable para clasificar.");
        return;
      }
      setCatalogoNombre(String(data.archivo ?? file.name));
      setCatalogoResumen(String(data.resumen ?? "").trim() || null);
      setConsulta(texto);
    } catch {
      setErrorClasif("Error de conexión. Probá de nuevo.");
      return;
    } finally {
      if (!texto) setClasificando(false);
    }
    await ejecutarClasificacion(texto);
  }

  function afinarClasificacion() {
    const q = consulta.trim();
    if (!clasif?.preguntas || clasificando || q.length < 2) return;
    const mapa = new Map(respuestasAcum.map((r) => [r.pregunta, r.opcion]));
    for (const p of clasif.preguntas ?? []) {
      const libre = (textoLibre[p.pregunta] ?? "").trim();
      if (libre) {
        mapa.set(p.pregunta, libre);
        continue;
      }
      const op = sel[p.pregunta];
      if (op) mapa.set(p.pregunta, op);
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
    const plan = clasif.planPreguntas ?? [];
    const next = plan.length ? siguienteEnPlan(plan, respuestas) : "listo";
    if (next !== "listo" && next !== null) {
      setRespuestasAcum(respuestas);
      setSel({});
      setTextoLibre({});
      setClasif({
        ...clasif,
        producto: q,
        via: "ia",
        decision: "NEEDS_AI",
        preguntas: [next],
        planPreguntas: plan,
        provisional: undefined,
        hipotesisNcm: undefined,
        hipotesisPartida: undefined,
        justificacion: undefined,
      });
      return;
    }
    setRespuestasAcum(respuestas);
    setSel({});
    setTextoLibre({});
    void ejecutarClasificacion(q, respuestas);
  }

  // Ficha VUCE solo con NCM definitiva; arancel también para la hipótesis en curso.
  const ncmDefinitivo = clasif?.ncm ?? null;
  const ncmArancel = ncmDefinitivo ?? clasif?.provisional?.ncm ?? null;
  useEffect(() => {
    if (!ncmDefinitivo) {
      setFicha(null);
      return;
    }
    const controller = new AbortController();
    setFichaCargando(true);
    fetch(`/api/vuce/ficha?ncm=${encodeURIComponent(ncmDefinitivo)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setFicha(data?.ok ? (data.ficha as FichaPosicion) : null))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFicha(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setFichaCargando(false);
      });
    return () => controller.abort();
  }, [ncmDefinitivo]);

  // Aranceles oficiales (DI, DE, reintegro) de las 5 columnas del nomenclador.
  useEffect(() => {
    if (!ncmArancel) {
      setArancel(null);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/arancel?ncm=${encodeURIComponent(ncmArancel)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) =>
        setArancel(data?.ok ? (data.resultado as ArancelNcm | null) : null),
      )
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setArancel(null);
      });
    return () => controller.abort();
  }, [ncmArancel]);

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-border bg-surface/80 p-6 backdrop-blur-sm sm:p-8">
        <div className="mb-4 flex items-center gap-2">
          <ScanSearch className="h-5 w-5 text-accent" />
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            Buscar posición NCM
          </p>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface-2/40 p-1">
          {(
            [
              ["importacion", "Importación"],
              ["exportacion", "Exportación"],
              ["manual", "Manual"],
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

        {esManual && <NomencladorManual esExport={esExport} />}

        {!esManual && (
        <p className="text-sm leading-snug text-muted">
          Describí el producto con el mayor detalle posible (material, uso,
          características técnicas). Cuanto más preciso, mejor engancha la
          posición exacta y{" "}
          {esExport
            ? "sus derechos de exportación (retención) y reintegros."
            : "su derecho de importación."}
        </p>
        )}

        {!esManual && (
        <>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            className={inputCls}
            placeholder="Descripción del producto: material, uso, función…"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") clasificar();
            }}
          />
          <button
            type="button"
            onClick={clasificar}
            disabled={clasificando || consulta.trim().length < 2}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent px-6 text-sm font-semibold text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {clasificando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Clasificar
          </button>
        </div>

        {mostrarEntradaCatalogo && (
          <>
            <div className="relative mt-8 mb-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                o catálogo / ficha
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <p className="text-sm leading-snug text-muted">
              Subí un PDF o imagen: lo leemos, completamos la descripción arriba y
              clasificamos con el mismo flujo.
            </p>

            <div className="mt-3">
              <label
                className={`inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface-2/30 px-4 text-sm font-medium text-muted transition-colors hover:border-accent/50 hover:text-foreground ${
                  clasificando ? "pointer-events-none opacity-50" : ""
                }`}
              >
                <FileUp className="h-4 w-4 shrink-0" />
                Elegir PDF o imagen
                <input
                  type="file"
                  accept={ACCEPT_CATALOGO}
                  className="sr-only"
                  disabled={clasificando}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    if (f) void subirCatalogo(f);
                  }}
                />
              </label>
            </div>

            {catalogoNombre && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2.5 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">
                    Catálogo: {catalogoNombre}
                  </p>
                  {catalogoResumen && (
                    <p className="mt-1 line-clamp-3 leading-snug text-muted">
                      {catalogoResumen}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCatalogoNombre(null);
                    setCatalogoResumen(null);
                  }}
                  className="shrink-0 rounded p-1 text-muted hover:text-foreground"
                  title="Quitar referencia al archivo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}

        {clasificando && (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            Procesando…
          </p>
        )}

        {errorClasif && (
          <p className="mt-3 text-xs text-red-500">{errorClasif}</p>
        )}

        {clasif && (
          <div className="mt-5">
            <ResultadoClasif
            r={clasif}
            sel={sel}
            textoLibre={textoLibre}
            onSelect={(pregunta, opcion) => {
              if (!opcion) {
                setSel((s) => {
                  const next = { ...s };
                  delete next[pregunta];
                  return next;
                });
              } else {
                setSel((s) => ({ ...s, [pregunta]: opcion }));
              }
            }}
            onTextoLibre={(pregunta, texto) =>
              setTextoLibre((s) => ({ ...s, [pregunta]: texto }))
            }
            onAfinar={afinarClasificacion}
            afinando={clasificando}
            ficha={ficha}
            fichaCargando={fichaCargando}
            arancel={arancel}
            esExport={esExport}
          />
          </div>
        )}
        </>
        )}

      </div>
    </div>
  );
}

function ArancelDato({
  label,
  valor,
  sufijo = "",
}: {
  label: string;
  valor: number;
  sufijo?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">
        {valor.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%
        {sufijo}
      </span>
    </div>
  );
}

function FilaAlternativa({
  a,
  compacto = false,
}: {
  a: { codigo: string; descripcion: string; di: number; ruta?: string };
  compacto?: boolean;
}) {
  return (
    <li
      className={`flex items-baseline justify-between gap-3 ${
        compacto ? "text-xs text-foreground/85" : "text-xs"
      }`}
    >
      <span className="min-w-0 text-foreground">
        <span className="font-mono text-accent">{a.codigo}</span>{" "}
        {a.descripcion}
      </span>
      <span className="shrink-0 tabular-nums text-muted">{a.di}%</span>
    </li>
  );
}

function BloquePosicionesEnMira({ items }: { items: PosicionEnMira[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-surface/60 px-3 py-2.5">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
        Otras posiciones evaluadas en el cruce legal
      </p>
      <p className="mb-2.5 text-[11px] leading-snug text-muted">
        Líneas que el cruce legal evaluó y descartó frente a la elegida (RGI y
        notas). Pueden ser de la misma partida u otra rama del nomenclador.
      </p>
      <ul className="space-y-3">
        {items.map((p) => (
          <li
            key={p.ncm}
            className="border-l-2 border-muted/40 pl-2.5 text-[11px] leading-snug"
          >
            <p className="font-medium text-foreground/90">
              <span className="font-mono text-accent">{p.ncm}</span>
              {p.di != null && (
                <span className="ml-2 tabular-nums text-muted">DI {p.di}%</span>
              )}
            </p>
            {p.descripcion && (
              <p className="mt-0.5 text-foreground/85">{p.descripcion}</p>
            )}
            {p.motivo && (
              <p className="mt-1 text-muted">
                <span className="font-semibold text-foreground/70">
                  Por qué no:
                </span>{" "}
                {p.motivo}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chip({ texto }: { texto: string }) {
  return (
    <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
      {texto}
    </span>
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
  ficha,
  fichaCargando,
  arancel,
  esExport,
}: {
  r: ClasificacionResultado;
  sel: Record<string, string>;
  textoLibre: Record<string, string>;
  onSelect: (pregunta: string, opcion: string) => void;
  onTextoLibre: (pregunta: string, texto: string) => void;
  onAfinar: () => void;
  afinando: boolean;
  ficha: FichaPosicion | null;
  fichaCargando: boolean;
  arancel: ArancelNcm | null;
  esExport: boolean;
}) {
  if (r.decision === "SIN_RESULTADO") {
    const prov = r.provisional;
    const hayHipotesis = Boolean(
      prov?.ncm ||
        prov?.partida ||
        prov?.descripcion ||
        r.partida ||
        r.descripcion ||
        (r.alternativas?.length ?? 0) > 0,
    );
    return (
      <div className="mt-5 space-y-4">
        <div className="rounded-xl border border-border bg-surface-2/40 px-5 py-4 text-sm leading-snug text-muted">
          {r.justificacion ??
            "No pudimos cerrar la posición automáticamente. Agregá detalle arriba (material, uso, partes) y volvé a clasificar."}
        </div>
        {hayHipotesis && (
          <div className="rounded-xl border border-dashed border-border bg-surface/40 px-5 py-4 text-sm">
            <p className="text-xs font-semibold text-foreground">
              Última hipótesis
            </p>
            {(prov?.ncm || r.partida) && (
              <p className="mt-1 font-mono text-sm text-foreground">
                {prov?.ncm ?? `Partida ${r.partida}`}
              </p>
            )}
            {(prov?.partidaDesc || r.partidaDesc) && (
              <p className="mt-1 text-xs text-muted">
                {prov?.partidaDesc ?? r.partidaDesc}
              </p>
            )}
            {(prov?.descripcion || r.descripcion) && (
              <p className="mt-2 text-xs leading-snug text-muted">
                {prov?.descripcion ?? r.descripcion}
              </p>
            )}
          </div>
        )}
        {(r.alternativas?.length ?? 0) > 0 && (
          <p className="text-xs text-muted">
            {r.alternativas!.length} posiciones de la partida en alternativas —
            reintentá la clasificación o refiná la descripción.
          </p>
        )}
      </div>
    );
  }

  const preguntas = r.preguntas ?? [];
  const hayPreguntas = preguntas.length > 0;
  const esDefinitivo =
    r.decision === "DIRECTO" || (Boolean(r.ncm) && !hayPreguntas);
  const fasePartida = r.fasePregunta === "partida";
  const prov = r.provisional;
  const hayHipotesis = Boolean(
    prov?.ncm ||
      prov?.partida ||
      prov?.descripcion ||
      prov?.justificacion ||
      r.partida ||
      r.descripcion ||
      r.justificacion ||
      (r.alternativas?.length ?? 0) > 0,
  );
  const alternativas = r.alternativas ?? [];
  const codigoOrientativo =
    fasePartida && (prov?.partida || r.partida)
      ? `Hipótesis partida ${prov?.partida ?? r.partida} (no confirmada)`
      : prov?.ncm
        ? `NCM ${prov.ncm}`
        : prov?.partida || r.partida
          ? `Partida ${prov?.partida ?? r.partida}`
          : null;
  const estadoExp = derivarEstadoExpediente(r);
  const etiquetaExp = etiquetaEstado(estadoExp);

  const bloquePreguntas = hayPreguntas ? (
    <ClasificadorPreguntas
      preguntas={preguntas}
      fasePartida={fasePartida}
      sel={sel}
      textoLibre={textoLibre}
      onSelect={onSelect}
      onTextoLibre={onTextoLibre}
      onAfinar={onAfinar}
      afinando={afinando}
      className="px-4 py-4"
    />
  ) : null;

  return (
    <div className="mt-5 space-y-4 rounded-xl border border-accent/30 bg-surface-2/40 p-5">

      {bloquePreguntas}

      {hayPreguntas && !hayHipotesis && (
        <div className="rounded-lg border border-dashed border-muted/40 bg-surface/50 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Nomenclatura en curso
          </p>
          <p className="mt-1 text-sm text-foreground/80">
            Todavía no hay una posición fija — respondé para afinar la clasificación.
          </p>
        </div>
      )}

      {hayPreguntas && hayHipotesis && (
        <div className="rounded-lg border border-dashed border-muted/40 bg-surface/50 px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
            {fasePartida
              ? "Partida en evaluación (puede cambiar)"
              : "Nomenclatura en curso (orientativa)"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {codigoOrientativo && (
              <span className="rounded-md border border-border bg-surface px-3 py-1 font-mono text-sm font-medium text-foreground/80">
                {codigoOrientativo}
              </span>
            )}
            {!esDefinitivo && (
              <Chip texto={etiquetaExp} />
            )}
            {prov?.derecho != null && !esExport && (
              <Chip texto={`Derecho ~${prov.derecho}%`} />
            )}
          </div>
          {(prov?.partidaDesc || r.partidaDesc) && (
            <p className="mt-2 text-[11px] uppercase tracking-wide text-muted">
              {fasePartida ? "Hipótesis: " : "Partida "}
              {prov?.partida ?? r.partida}:{" "}
              {prov?.partidaDesc ?? r.partidaDesc}
            </p>
          )}
          {fasePartida && (
            <p className="mt-2 text-xs leading-snug text-muted">
              La partida no está cerrada hasta responder. Si tus respuestas apuntan
              a otro capítulo, el resultado final puede ser distinto.
            </p>
          )}
          {(prov?.descripcion || r.descripcion) && (
            <p className="mt-1.5 text-sm leading-snug text-foreground/90">
              {prov?.descripcion ?? r.descripcion}
            </p>
          )}
          {(prov?.justificacion || r.justificacion) && (
            <p className="mt-1.5 text-xs leading-snug text-muted">
              {prov?.justificacion ?? r.justificacion}
            </p>
          )}
          {!esExport && arancel && prov?.ncm && (
            <p className="mt-2 text-[10px] leading-snug text-muted">
              Tributación estimada según posición probable — puede cambiar al
              responder.
            </p>
          )}
          {alternativas.length > 0 && hayPreguntas && (
            <div className="mt-3 space-y-1 border-t border-border/60 pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                Otras posiciones posibles
              </p>
              <ul className="space-y-1">
                {alternativas.map((a) => (
                  <FilaAlternativa key={a.codigo} a={a} compacto />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {esDefinitivo && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {r.ncm && (
              <span className="rounded-md bg-accent/15 px-3 py-1 font-mono text-base font-semibold text-accent">
                NCM {r.ncm}
              </span>
            )}
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              Posición definitiva
            </span>
            {esExport ? (
              <>
                {arancel && (
                  <Chip texto={`Retención (DE) ${arancel.de}%`} />
                )}
                {arancel && <Chip texto={`Reintegro ${arancel.reintegro}%`} />}
                <Chip texto="IVA exportación 0%" />
              </>
            ) : (
              <>
                {r.derecho != null && <Chip texto={`Derecho ${r.derecho}%`} />}
                {r.iva != null && (
                  <Chip texto={`IVA ${r.iva}%${r.ivaEstimado ? " est." : ""}`} />
                )}
              </>
            )}
          </div>

          {r.ncm && arancel && (
            <div className="rounded-lg border border-border bg-surface/60 px-3 py-2.5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {esExport
                  ? "Aranceles de exportación (nomenclador)"
                  : "Tributación aplicable (Argentina)"}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                {esExport ? (
                  <>
                    <ArancelDato
                      label="Derecho exportación (DE)"
                      valor={arancel.de}
                    />
                    <ArancelDato
                      label="Reintegro extrazona"
                      valor={arancel.reintegro}
                    />
                    <ArancelDato
                      label="Reintegro intrazona"
                      valor={arancel.reintegroIntra}
                    />
                    {arancel.adicional > 0 && (
                      <ArancelDato
                        label="Derecho adicional"
                        valor={arancel.adicional}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <ArancelDato
                      label="Derecho importación (DIE)"
                      valor={arancel.di}
                    />
                    {arancel.aec != null && arancel.aec !== arancel.di && (
                      <ArancelDato label="AEC (referencia)" valor={arancel.aec} />
                    )}
                    {arancel.dii != null && (
                      <ArancelDato label="DII (Mercosur)" valor={arancel.dii} />
                    )}
                    {arancel.te != null && (
                      <ArancelDato label="Tasa estadística" valor={arancel.te} />
                    )}
                    <ArancelDato
                      label="IVA"
                      valor={arancel.iva}
                      sufijo={arancel.ivaEstimado ? " est." : ""}
                    />
                    {arancel.ivaAdicional != null && (
                      <ArancelDato
                        label="IVA adicional (percepción)"
                        valor={arancel.ivaAdicional}
                      />
                    )}
                    {arancel.ganancias != null && (
                      <ArancelDato
                        label="Ganancias (percepción)"
                        valor={arancel.ganancias}
                      />
                    )}
                    {arancel.iibb != null && (
                      <ArancelDato label="Ingresos Brutos" valor={arancel.iibb} />
                    )}
                    {arancel.adicional > 0 && (
                      <ArancelDato
                        label="Derecho adicional"
                        valor={arancel.adicional}
                      />
                    )}
                  </>
                )}
              </div>
              {!esExport && arancel.te === 0 && (
                <p className="mt-2 text-[10px] leading-snug text-muted">
                  La tasa estadística general es 3%. VUCE publica esta posición
                  en 0%: es una exención por régimen (bienes de capital,
                  informática y telecomunicaciones), no depende del país de
                  origen. Confirmala antes de liquidar.
                </p>
              )}
              {!esExport && arancel.dieRegimen && (
                <p className="mt-2 text-[10px] leading-snug text-muted">
                  Régimen: {arancel.dieRegimen}
                  {arancel.bk ? " · Bien de capital (BK)" : ""}
                </p>
              )}
              {!esExport &&
                arancel.diNominal != null &&
                arancel.diNominal !== arancel.di && (
                  <p className="mt-1 text-[10px] leading-snug text-muted">
                    Tarifa nominal del nomenclador: {arancel.diNominal}% (no es la
                    alícuota aplicable).
                  </p>
                )}
              {esExport && (
                <p className="mt-2 text-[10px] leading-snug text-muted">
                  La retención (DE) y el reintegro se calculan sobre el FOB. El IVA
                  de exportación es 0% y el de los servicios es recuperable.
                </p>
              )}
            </div>
          )}

          {r.partidaDesc && (
            <p className="text-[11px] uppercase tracking-wide text-muted">
              Partida {r.partida}: {r.partidaDesc}
            </p>
          )}

          {r.descripcion && (
            <p className="text-sm font-medium leading-snug text-foreground">
              {r.descripcion}
            </p>
          )}
          {r.justificacion && (
            <p className="text-xs leading-snug text-muted">{r.justificacion}</p>
          )}

          {!esExport && r.aranceles && r.aranceles.length > 1 && (
            <p className="rounded-lg border border-border bg-surface/60 px-3 py-2 text-[11px] leading-snug text-muted">
              Dentro de esta partida hay posiciones con distinto derecho (
              {r.aranceles.map((a) => `${a}%`).join(", ")}). Precisá el producto
              para fijar la posición exacta.
            </p>
          )}
        </>
      )}

      {/* Dónde cayó la posición a la izquierda; qué exige el Estado, a la derecha. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-4">
          {(r.subpartidas?.length ?? 0) > 0 && (
            <BloqueSubpartidas
              partida={r.partida ?? prov?.partida ?? ""}
              items={r.subpartidas!}
              ncmElegida={r.ncm ?? prov?.ncm}
            />
          )}

          {(r.partidasEvaluadas?.length ?? 0) > 1 && (
            <BloquePartidasEvaluadas items={r.partidasEvaluadas!} />
          )}

          {esDefinitivo && (r.posicionesEnMira?.length ?? 0) > 0 && (
            <BloquePosicionesEnMira items={r.posicionesEnMira!} />
          )}

          {alternativas.length > 0 && esDefinitivo && (
            <div className="space-y-1.5 border-t border-border pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Otras posiciones posibles
              </p>
              <ul className="space-y-1">
                {alternativas.map((a) => (
                  <FilaAlternativa key={a.codigo} a={a} />
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {esDefinitivo && (r.unidad || (r.sufijos?.length ?? 0) > 0) && (
            <BloqueDeclaracion unidad={r.unidad} sufijos={r.sufijos ?? []} />
          )}

          {esDefinitivo && (r.notas?.length ?? 0) > 0 && (
            <BloqueNotas notas={r.notas!} />
          )}

          {esDefinitivo && r.ncm && !esExport && (
            <FichaVuce ficha={ficha} cargando={fichaCargando} />
          )}

          {esDefinitivo && r.ncm && esExport && (
            <p className="rounded-lg border border-border bg-surface/60 px-3 py-2 text-[11px] leading-snug text-muted">
              El antidumping y las intervenciones de VUCE son del lado importador
              (no aplican a la exportación argentina). Para exportar regís por la
              retención y el reintegro de arriba; las intervenciones de
              exportación (SENASA, INV, INAL, etc.) dependen del producto.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Cómo se declara la cantidad y qué detalle exige el Arancel además del código. */
function BloqueDeclaracion({
  unidad,
  sufijos,
}: {
  unidad?: string | null;
  sufijos: SufijoNcm[];
}) {
  return (
    <div className="rounded-lg border border-border bg-surface/60 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
        Cómo se declara
      </p>
      {unidad && (
        <p className="mt-1.5 text-sm text-foreground">
          Unidad estadística:{" "}
          <span className="font-medium">{unidad}</span>
        </p>
      )}
      {sufijos.length > 0 && (
        <>
          <p className="mt-3 text-[11px] text-muted">
            Sufijos de valor: además del código hay que declarar cuál de estas
            variantes es la mercadería.
          </p>
          <ul className="mt-1.5 space-y-1">
            {sufijos.map((s) => (
              <li key={s.sufijo} className="flex gap-2 text-xs leading-snug">
                <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-accent">
                  {s.sufijo}
                </span>
                <span className="min-w-0 text-muted">
                  {s.descripcion.replace(/\.$/, "")}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Notas de sección y capítulo: son las que excluyen mercadería de la partida. */
function BloqueNotas({ notas }: { notas: NotaNcm[] }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <div className="rounded-lg border border-border bg-surface/60 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
        Notas legales
      </p>
      <p className="mt-1 text-[11px] leading-snug text-muted">
        Deciden qué entra y qué queda excluido de esta partida. Mandan sobre el
        texto de la posición.
      </p>
      <ul className="mt-2 space-y-1">
        {notas.map((n) => {
          const activa = abierta === n.referencia;
          return (
            <li key={n.referencia}>
              <button
                type="button"
                onClick={() => setAbierta(activa ? null : n.referencia)}
                aria-expanded={activa}
                className="w-full text-left"
              >
                <p className="text-xs font-medium text-foreground hover:text-accent">
                  {n.referencia}
                </p>
                <p className="text-[11px] leading-snug text-muted">{n.titulo}</p>
              </button>
              {activa && (
                <p className="mt-1.5 max-h-72 overflow-y-auto whitespace-pre-line border-l border-border pl-3 text-[11px] leading-relaxed text-muted">
                  {n.texto}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Dentro de qué rama de la partida cayó la posición, y cuáles son las hermanas. */
function BloqueSubpartidas({
  partida,
  items,
  ncmElegida,
}: {
  partida: string;
  items: SubpartidaNcm[];
  ncmElegida?: string;
}) {
  const digitos = (s: string) => (s ?? "").replace(/\D/g, "");
  const elegida = digitos(ncmElegida ?? "").slice(0, 6);
  return (
    <div className="space-y-1.5 border-t border-border pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        Subpartidas de la partida {partida}
      </p>
      <ul className="space-y-0.5">
        {items.map((s) => {
          const activa = digitos(s.codigo) === elegida;
          return (
            <li
              key={s.codigo}
              className={`flex gap-2 rounded-md px-2 py-1 text-xs leading-snug ${
                activa
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-muted"
              }`}
            >
              <span className="shrink-0 font-mono">{s.codigo}</span>
              <span className="min-w-0">{s.descripcion}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Las partidas que el motor evaluó: si la elegida no encaja, la buena suele estar acá. */
function BloquePartidasEvaluadas({ items }: { items: PartidaEvaluada[] }) {
  return (
    <div className="space-y-1.5 border-t border-border pt-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        Partidas evaluadas
      </p>
      <ul className="space-y-0.5">
        {items.map((p) => (
          <li
            key={p.partida}
            className={`flex gap-2 rounded-md px-2 py-1 text-xs leading-snug ${
              p.elegida ? "bg-accent-soft font-medium text-accent" : "text-muted"
            }`}
          >
            <span className="shrink-0 font-mono">{p.partida}</span>
            <span className="min-w-0">{p.descripcion}</span>
          </li>
        ))}
      </ul>
      <p className="px-2 text-[10px] leading-snug text-muted">
        Si la posición elegida no encaja con tu mercadería, revisá estas: son las
        que el nomenclador puso a consideración.
      </p>
    </div>
  );
}

/* ───────────────── Datos oficiales de VUCE para la posición ───────────────── */

function recortar(texto: string, max: number): string {
  const limpio = texto.trim();
  if (limpio.length <= max) return limpio;
  return limpio.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

/**
 * Agrupa intervenciones por condición de mercadería para mostrar
 * "Si es nueva → trámite X", "Si es usada → trámite Y".
 */
function agruparPorCondicion(items: IntervencionVuce[]): {
  clave: string;
  titulo: string;
  items: IntervencionVuce[];
}[] {
  const buckets = new Map<string, IntervencionVuce[]>();
  const titulos: Record<string, string> = {
    nueva: "Si la mercadería es nueva",
    usada: "Si la mercadería es usada",
    residuos: "Si son residuos",
    otros: "Si la mercadería es de otro tipo",
    general: "Sin importar si es nueva o usada",
  };

  for (const iv of items) {
    const limpios = iv.estados.filter((e) => e && e !== "Todos");
    let clave: string;
    if (limpios.length === 0) clave = "general";
    else if (limpios.length === 1) {
      const e = limpios[0].toLowerCase();
      clave =
        e === "nueva"
          ? "nueva"
          : e === "usada"
            ? "usada"
            : e === "residuos"
              ? "residuos"
              : "otros";
    } else {
      clave = limpios.map((e) => e.toLowerCase()).join("|");
    }
    const arr = buckets.get(clave);
    if (arr) arr.push(iv);
    else buckets.set(clave, [iv]);
  }

  const orden = ["nueva", "usada", "residuos", "otros", "general"];
  return [...buckets.entries()]
    .sort(([a], [b]) => {
      const ia = orden.indexOf(a.split("|")[0]);
      const ib = orden.indexOf(b.split("|")[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map(([clave, grupo]) => ({
      clave,
      titulo:
        titulos[clave] ??
        `Si la mercadería es ${clave.replace(/\|/g, " o ").toLowerCase()}`,
      items: grupo,
    }));
}

function fraseAccion(iv: IntervencionVuce): string {
  const tramite = iv.tramites[0]?.nombre;
  if (tramite) return `Hay que gestionar: ${tramite}`;
  return `Hay que gestionar el permiso ante ${iv.organismo}`;
}

/** Agrupa intervenciones por organismo manteniendo el orden de aparición. */
function agruparPorOrganismo(
  items: IntervencionVuce[],
): { organismo: string; items: IntervencionVuce[] }[] {
  const grupos: { organismo: string; items: IntervencionVuce[] }[] = [];
  for (const iv of items) {
    const org = iv.organismo || "Organismo no especificado";
    let g = grupos.find((x) => x.organismo === org);
    if (!g) {
      g = { organismo: org, items: [] };
      grupos.push(g);
    }
    g.items.push(iv);
  }
  return grupos;
}

const CNCE_MEDIDAS_URL =
  "https://www.argentina.gob.ar/cnce/investigaciones/medidasvigentes";

function ItemAntidumping({ m }: { m: AntidumpingVuce }) {
  const fechaCumplida = medidaVencida(m.vencimiento);
  return (
    <li className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="font-semibold">{m.pais}</span>
      <span>· {descMedidaAntidumping(m.tipoMedida, m.medidaAplicada)}</span>
      {m.normativa ? <span className="text-muted">· {m.normativa}</span> : null}
      {m.vencimiento ? (
        fechaCumplida ? (
          <span className="text-amber-700 dark:text-amber-400">
            · vencía {m.vencimiento} — verificá vigencia en CNCE (puede seguir en
            revisión)
          </span>
        ) : (
          <span className="text-muted">· vence {m.vencimiento}</span>
        )
      ) : null}
    </li>
  );
}

/**
 * Muestra TODAS las medidas antidumping de la posición. Importante: una medida
 * con fecha de vencimiento pasada NO implica que esté caída — si la CNCE abrió
 * una revisión, sigue vigente hasta que la cierren. Por eso no la ocultamos ni
 * la damos por vencida: la marcamos con "verificá vigencia en CNCE".
 */
function BloqueAntidumping({ medidas }: { medidas: AntidumpingVuce[] }) {
  const paises = [...new Set(medidas.map((m) => m.pais))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            Antidumping para esta posición — orígenes: {paises.join(", ")}
          </p>
          <ul className="space-y-1 text-[11px] text-foreground/90">
            {medidas.map((m, i) => (
              <ItemAntidumping
                key={`${m.posicion}-${m.pais}-${m.medidaAplicada}-${i}`}
                m={m}
              />
            ))}
          </ul>

          {hayFobMinimo(medidas) && (
            <p className="text-[10px] leading-snug text-muted">
              <span className="font-semibold">Valor FOB mínimo:</span> precio de
              referencia (en USD por kilogramo). Si el FOB declarado es menor, se
              aplica un derecho antidumping por la diferencia hasta ese mínimo.
            </p>
          )}
          <p className="text-[10px] leading-snug text-muted">
            Dato de VUCE a la fecha de descarga. Una fecha vencida no significa
            que la medida haya caído: si está en revisión sigue aplicándose.
            Confirmá la vigencia real en{" "}
            <a
              href={CNCE_MEDIDAS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline decoration-dotted underline-offset-2 hover:text-foreground"
            >
              Medidas vigentes (CNCE)
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

function FichaVuce({
  ficha,
  cargando,
}: {
  ficha: FichaPosicion | null;
  cargando: boolean;
}) {
  if (cargando) {
    return (
      <div className="flex items-center gap-2 border-t border-border pt-3 text-[11px] text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando VUCE
        (intervenciones, antidumping, tributos)…
      </div>
    );
  }
  if (!ficha) return null;

  const sinNada =
    ficha.intervenciones.length === 0 &&
    ficha.regimenes.length === 0 &&
    ficha.antidumping.length === 0 &&
    ficha.tributos.length === 0;

  return (
    <div className="space-y-3 border-t border-border pt-3">
      {sinNada && (
        <p className="text-[11px] text-muted">
          Sin intervenciones, antidumping ni tributos extra para esta NCM.
        </p>
      )}

      {/* Antidumping (cualquier origen), separando vigentes de vencidas */}
      {ficha.antidumping.length > 0 && (
        <BloqueAntidumping medidas={ficha.antidumping} />
      )}

      {/* Intervenciones de terceros (agrupadas por condición, legibles) */}
      {ficha.intervenciones.length > 0 && (
        <div className="rounded-lg border border-border bg-surface/60 px-3 py-2.5">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            Trámites que pueden aplicar
          </p>
          <p className="mb-2.5 text-[11px] leading-snug text-muted">
            Según VUCE, para esta posición estos organismos pueden exigir un
            permiso previo. No dependen del país de origen (eso afecta
            antidumping y certificado de origen).
          </p>
          <div className="space-y-3">
            {agruparPorCondicion(ficha.intervenciones).map((bloque) => (
              <div key={bloque.clave}>
                <p className="mb-1.5 text-[11px] font-semibold text-foreground">
                  {bloque.titulo}
                </p>
                <ul className="space-y-2.5">
                  {agruparPorOrganismo(bloque.items).map((g) => (
                    <li key={g.organismo}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                        {g.organismo}
                      </p>
                      <ul className="mt-1 space-y-2 border-l-2 border-border pl-2.5">
                        {g.items.map((iv, i) => (
                          <li key={i} className="space-y-0.5">
                            <p className="text-[11px] font-medium leading-snug text-foreground/90">
                              {fraseAccion(iv)}
                            </p>
                            {iv.regimen && (
                              <p className="text-[10px] leading-snug text-muted">
                                {iv.regimen}
                              </p>
                            )}
                            {iv.resumen && (
                              <p className="text-[10px] leading-snug text-muted">
                                {recortar(iv.resumen, 140)}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tributos extra */}
      {ficha.tributos.length > 0 && (
        <div className="rounded-lg border border-border bg-surface/60 px-3 py-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Tributos (además del derecho)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ficha.tributos.map((t) => (
              <Chip
                key={t.concepto}
                texto={`${t.concepto} ${t.valores.map((v) => `${v}%`).join(" / ")}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Regímenes opcionales */}
      {ficha.regimenes.length > 0 && (
        <details className="rounded-lg border border-border bg-surface/60 px-3 py-2">
          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-muted">
            Regímenes opcionales ({ficha.regimenes.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {ficha.regimenes.slice(0, 12).map((iv, i) => (
              <li
                key={i}
                className="text-[11px] leading-relaxed text-foreground/80"
              >
                <span className="font-semibold">{iv.organismo}</span>
                {iv.regimen ? ` — ${iv.regimen}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
