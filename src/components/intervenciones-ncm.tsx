"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

/**
 * Intervenciones de terceros organismos para una NCM, según VUCE.
 *
 * Responde la pregunta que se hace el despachante antes de cotizar: además de
 * los tributos, ¿esta posición necesita permiso previo de algún organismo?
 * Un certificado de SENASA o una licencia de ANMAT cambian el plazo y el costo
 * real de la operación mucho más que un punto de arancel.
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

function Tramites({ tramites }: { tramites: TramiteVuce[] }) {
  const conLink = tramites.filter((t) => t.link);
  if (!conLink.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {conLink.map((t, i) => (
        <li key={`${t.link}-${i}`}>
          <a
            href={t.link!}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
          >
            {t.nombre ?? "Ver trámite"}
            {t.nro_trata ? ` (${t.nro_trata})` : ""}
            <ExternalLink className="h-3 w-3" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function Lista({ grupos }: { grupos: Grupo[] }) {
  return (
    <ul className="space-y-2.5">
      {grupos.map((g) => (
        <li key={g.organismo}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
            {g.organismo}
          </p>
          <ul className="mt-1 space-y-1.5">
            {g.items.map((iv, i) => (
              <li
                key={`${iv.regimen ?? ""}-${i}`}
                className="border-l-2 border-border pl-2.5"
              >
                <p className="flex flex-wrap items-center gap-1.5 text-[11px] leading-snug text-foreground">
                  <span>{iv.regimen ?? iv.resumen ?? "Intervención previa"}</span>
                  {iv.validada && (
                    <span
                      title="VUCE validó esta intervención"
                      className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-px text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      validada
                    </span>
                  )}
                </p>
                {iv.estados.length > 0 && (
                  <p className="text-[10px] text-muted">
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

  const ficha = resultado && resultado.ncm === ncm ? resultado.ficha : null;
  const cargando = Boolean(ncm) && !esExport && resultado?.ncm !== ncm;

  const previas = useMemo(
    () => agruparPorOrganismo(ficha?.intervenciones ?? []),
    [ficha],
  );
  const opcionales = useMemo(
    () => agruparPorOrganismo(ficha?.regimenes ?? []),
    [ficha],
  );

  if (!ncm) return null;

  // El dataset de intervenciones de VUCE cubre importación: sus regímenes son
  // permisos de ingreso. No tiene los controles de exportación, así que no
  // mostramos una lista vacía como si significara "no hace falta nada".
  if (esExport) {
    return (
      <div className="mb-4 rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-[11px] leading-snug text-muted">
        Las intervenciones que publica VUCE son de importación. Para exportar,
        confirmá aparte los certificados del organismo que corresponda (SENASA,
        INAL, INV) según la mercadería y el país de destino.
      </div>
    );
  }

  if (cargando) {
    return (
      <p className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-[11px] leading-snug text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Buscando intervenciones para esta posición...
      </p>
    );
  }

  if (!ficha?.ncm8) return null;

  const sinNada = previas.length === 0 && opcionales.length === 0;
  if (sinNada) {
    return (
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] leading-snug text-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <p>
          VUCE no registra intervenciones previas para la NCM {ficha.ncm8}. Igual
          conviene confirmarlo contra la ficha de la posición antes de cerrar la
          compra.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-3 rounded-lg border border-border bg-surface-2/40 px-3 py-2.5">
      {previas.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            <ShieldAlert className="h-3.5 w-3.5" />
            Intervenciones previas · NCM {ficha.ncm8}
          </p>
          <p className="mb-2 text-[11px] leading-snug text-muted">
            Controles obligatorios de terceros organismos: sin estos permisos la
            mercadería no se nacionaliza. Suman plazo y costo al despacho.
          </p>
          <Lista grupos={previas} />
        </div>
      )}

      {opcionales.length > 0 && (
        <div className={previas.length > 0 ? "border-t border-border pt-2.5" : ""}>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Regímenes opcionales
          </p>
          <p className="mb-2 text-[11px] leading-snug text-muted">
            No son obligatorios: son beneficios a los que la posición podría
            acceder si se cumplen los requisitos.
          </p>
          <Lista grupos={opcionales} />
        </div>
      )}
    </div>
  );
}
