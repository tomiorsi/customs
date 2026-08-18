"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

/**
 * Intervenciones de terceros organismos para una NCM, según VUCE.
 *
 * Responde la pregunta que se hace el despachante antes de cotizar: además de
 * los tributos, ¿esta posición necesita permiso previo de algún organismo?
 * Un certificado de SENASA o una licencia de ANMAT cambian el plazo y el costo
 * real de la operación mucho más que un punto de arancel.
 *
 * Vive detrás de un botón y se abre en su propio cuadro: son entre uno y diez
 * organismos con sus trámites, y desplegado adentro del panel tapaba las
 * cifras, que es lo que se viene a mirar.
 */

type TramiteVuce = {
  nombre: string | null;
  nro_trata: string | null;
  link: string | null;
};

type IntervencionVuce = {
  organismo: string;
  clase: "intervencion_previa" | "regimen_opcional";
  regimen: string | null;
  resumen: string | null;
  estadoMercaderia: string | null;
  estados: string[];
  validada: boolean;
  general: boolean;
  tramites: TramiteVuce[];
};

type FichaPosicion = {
  ncm8: string | null;
  intervenciones: IntervencionVuce[];
  regimenes: IntervencionVuce[];
};

type Grupo = { organismo: string; items: IntervencionVuce[] };

function agruparPorOrganismo(items: IntervencionVuce[]): Grupo[] {
  const mapa = new Map<string, IntervencionVuce[]>();
  for (const iv of items) {
    const k = iv.organismo || "Sin organismo";
    const arr = mapa.get(k);
    if (arr) arr.push(iv);
    else mapa.set(k, [iv]);
  }
  return [...mapa.entries()]
    .map(([organismo, items]) => ({ organismo, items }))
    .sort((a, b) => a.organismo.localeCompare(b.organismo, "es"));
}

/**
 * VUCE publica un trámite por variante del mismo formulario ("… - APERTURA",
 * "… - CIERRE", "… - EXCEPCIÓN"). Son un requisito, no tres: se agrupan por el
 * texto anterior al último guion y las variantes quedan como etiquetas.
 */
type TramiteAgrupado = { base: string; variantes: TramiteVuce[] };

function agruparTramites(tramites: TramiteVuce[]): TramiteAgrupado[] {
  const conLink = tramites.filter((t) => t.link);
  const mapa = new Map<string, TramiteVuce[]>();
  for (const t of conLink) {
    const nombre = t.nombre ?? "Ver trámite";
    const corte = nombre.lastIndexOf(" - ");
    const base = corte > 0 ? nombre.slice(0, corte) : nombre;
    const arr = mapa.get(base);
    if (arr) arr.push(t);
    else mapa.set(base, [t]);
  }
  return [...mapa.entries()].map(([base, variantes]) => ({ base, variantes }));
}

function etiquetaVariante(t: TramiteVuce, base: string): string | null {
  const nombre = t.nombre ?? "";
  if (!nombre.startsWith(base) || nombre.length <= base.length) return null;
  return nombre.slice(base.length).replace(/^\s*-\s*/, "").trim() || null;
}

function Tramites({ tramites }: { tramites: TramiteVuce[] }) {
  const grupos = agruparTramites(tramites);
  if (!grupos.length) return null;
  return (
    <ul className="mt-1 space-y-1">
      {grupos.map((g) => (
        <li key={g.base} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[11px] text-foreground/75">{g.base}</span>
          {g.variantes.map((t, i) => {
            const etiqueta = etiquetaVariante(t, g.base);
            return (
              <a
                key={`${t.link}-${i}`}
                href={t.link!}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-800 hover:underline dark:text-sky-300"
              >
                {etiqueta ?? t.nro_trata ?? "Abrir en TAD"}
                <ExternalLink className="h-3 w-3" />
              </a>
            );
          })}
        </li>
      ))}
    </ul>
  );
}

function Lista({ grupos }: { grupos: Grupo[] }) {
  return (
    <ul className="space-y-3">
      {grupos.map((g) => (
        <li key={g.organismo}>
          <p className="text-[11px] font-bold uppercase tracking-wide text-foreground">
            {g.organismo}
          </p>
          <ul className="mt-1.5 space-y-2">
            {g.items.map((iv, i) => (
              <li
                key={`${iv.regimen ?? ""}-${i}`}
                className="border-l-2 border-border pl-2.5"
              >
                <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium leading-snug text-foreground">
                  <span>{iv.regimen ?? iv.resumen ?? "Intervención previa"}</span>
                  {iv.validada && (
                    <span
                      title="VUCE validó esta intervención"
                      className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-px text-[10px] font-semibold text-emerald-700 dark:text-emerald-400"
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      validada
                    </span>
                  )}
                </p>
                {iv.estados.length > 0 && (
                  <p className="text-[11px] text-foreground/70">
                    Aplica a: {iv.estados.join(" · ")}
                  </p>
                )}
                <Tramites tramites={iv.tramites} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function Seccion({
  titulo,
  bajada,
  icono,
  grupos,
}: {
  titulo: string;
  bajada: string;
  icono: React.ReactNode;
  grupos: Grupo[];
}) {
  if (!grupos.length) return null;
  return (
    <section>
      <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
        {icono}
        {titulo}
      </p>
      <p className="mb-2 mt-0.5 text-[11px] leading-snug text-foreground/75">
        {bajada}
      </p>
      <Lista grupos={grupos} />
    </section>
  );
}

export function IntervencionesNcm({
  ncm,
  esExport = false,
}: {
  ncm: string | null | undefined;
  esExport?: boolean;
}) {
  // Guardamos la ficha junto a la NCM que la produjo: así "cargando" y "ficha"
  // se derivan del estado en vez de necesitar setState propio, y nunca se
  // muestran los organismos de una posición contra otra.
  const [resultado, setResultado] = useState<{
    ncm: string;
    ficha: FichaPosicion | null;
  } | null>(null);
  // Guardamos PARA QUÉ NCM se abrió, no un booleano: si el usuario reclasifica
  // con el cuadro abierto, lo que está en pantalla ya no es de esa posición y
  // se cierra solo, sin un efecto que lo sincronice a mano.
  const [abiertoPara, setAbiertoPara] = useState<string | null>(null);

  useEffect(() => {
    if (!ncm || esExport) return;
    const controller = new AbortController();

    fetch(`/api/vuce/ficha?ncm=${encodeURIComponent(ncm)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setResultado({
          ncm,
          ficha: data?.ok ? (data.ficha as FichaPosicion) : null,
        });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResultado({ ncm, ficha: null });
      });

    return () => controller.abort();
  }, [ncm, esExport]);

  const abierto = abiertoPara != null && abiertoPara === ncm;

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbiertoPara(null);
    };
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [abierto]);

  const ficha = resultado && resultado.ncm === ncm ? resultado.ficha : null;
  const cargando = Boolean(ncm) && !esExport && resultado?.ncm !== ncm;

  // Los regímenes que alcanzan a casi todo el nomenclador (embalajes de madera,
  // resolución anticipada de origen) no dicen nada de ESTA posición: son
  // condiciones de importar. Van al final y aparte, para que lo propio de la
  // mercadería —etiquetado, licencias, sanidad— se lea primero.
  const propias = useMemo(
    () => agruparPorOrganismo((ficha?.intervenciones ?? []).filter((i) => !i.general)),
    [ficha],
  );
  const comunes = useMemo(
    () =>
      agruparPorOrganismo([
        ...(ficha?.intervenciones ?? []).filter((i) => i.general),
        ...(ficha?.regimenes ?? []).filter((i) => i.general),
      ]),
    [ficha],
  );
  const opcionales = useMemo(
    () => agruparPorOrganismo((ficha?.regimenes ?? []).filter((i) => !i.general)),
    [ficha],
  );

  if (!ncm) return null;

  const nPropias = propias.reduce((n, g) => n + g.items.length, 0);
  const sinFicha = !esExport && !cargando && !ficha?.ncm8;
  if (sinFicha) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbiertoPara(ncm ?? null)}
        disabled={cargando}
        aria-haspopup="dialog"
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
          nPropias > 0
            ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            : "border-border text-foreground/75 hover:border-accent/60 hover:text-foreground"
        }`}
      >
        {cargando ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : nPropias > 0 ? (
          <ShieldAlert className="h-3.5 w-3.5" />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5" />
        )}
        Permisos
        {nPropias > 0 && (
          <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] tabular-nums">
            {nPropias}
          </span>
        )}
      </button>

      {abierto && (
        <div
          className="capa-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Permisos e intervenciones de la posición"
          onClick={() => setAbiertoPara(null)}
        >
          <div
            className="caja-modal sin-scrollbar rounded-xl border border-border bg-surface p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-sky-800 dark:text-sky-300">
                  Permisos e intervenciones
                </p>
                {ficha?.ncm8 && (
                  <p className="font-mono text-xs text-foreground/75">
                    NCM {ficha.ncm8}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setAbiertoPara(null)}
                aria-label="Cerrar"
                className="rounded-lg border border-border p-1 text-foreground/75 transition-colors hover:border-accent/60 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* El dataset de VUCE cubre importación: sus regímenes son
                  permisos de ingreso. No tiene los controles de exportación,
                  así que no mostramos una lista vacía como si significara
                  "no hace falta nada". */}
              {esExport ? (
                <p className="text-xs leading-snug text-foreground">
                  Las intervenciones que publica VUCE son de importación. Para
                  exportar, confirmá aparte los certificados del organismo que
                  corresponda (SENASA, INAL, INV) según la mercadería y el país
                  de destino.
                </p>
              ) : (
                <>
                  {nPropias === 0 && (
                    <p className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs leading-snug text-foreground">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                      <span>
                        VUCE no registra intervenciones propias de esta posición.
                        Igual conviene confirmarlo contra la ficha antes de
                        cerrar la compra.
                      </span>
                    </p>
                  )}

                  <Seccion
                    titulo="Intervenciones previas"
                    bajada="Controles obligatorios de terceros organismos para esta posición: sin estos permisos la mercadería no se nacionaliza. Suman plazo y costo al despacho."
                    icono={
                      <ShieldAlert className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
                    }
                    grupos={propias}
                  />

                  <Seccion
                    titulo="Regímenes opcionales"
                    bajada="No son obligatorios: son beneficios a los que la posición podría acceder si se cumplen los requisitos."
                    icono={
                      <Sparkles className="h-3.5 w-3.5 text-sky-800 dark:text-sky-300" />
                    }
                    grupos={opcionales}
                  />

                  {comunes.length > 0 && (
                    <div className="border-t border-border pt-3">
                      <Seccion
                        titulo="Comunes a toda importación"
                        bajada="VUCE los lista en prácticamente todas las posiciones: no son propios de esta mercadería, aplican a cualquier importación."
                        icono={
                          <ShieldCheck className="h-3.5 w-3.5 text-foreground/60" />
                        }
                        grupos={comunes}
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            <p className="mt-4 border-t border-border pt-3 text-[11px] leading-snug text-foreground/70">
              Fuente: VUCE. Puede haber requisitos que dependan del origen, del
              estado de la mercadería o de una norma posterior al dato.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
