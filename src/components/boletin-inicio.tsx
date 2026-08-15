"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  FAMILIAS,
  decodificarGde,
  type BoletinDelDia,
  type FamiliaControl,
  type NormaBoletin,
} from "@/lib/boletin/tipos";
import { faviconDeMedio } from "@/lib/noticias/tipos";
import type { ListadoNoticias, Noticia } from "@/lib/noticias/tipos";

/**
 * Inicio del equipo: la normativa del día, leída como se lee el Boletín.
 *
 * La pantalla contesta una sola pregunta —¿hoy salió algo que me afecte?— y de
 * paso enseña a leer la fuente. Por eso cada norma se muestra con la línea de
 * puntos guía del sumario original, y al abrirla se desarma en sus partes.
 */

const FAMILIA_ESTILO: Record<
  FamiliaControl,
  { punto: string; chip: string; etiqueta: string }
> = {
  aduana: {
    punto: "bg-accent",
    chip: "bg-accent-soft text-accent",
    etiqueta: "Aduana",
  },
  comercio: {
    punto: "bg-indigo-500",
    chip: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    etiqueta: "Acceso al mercado",
  },
  sanitario: {
    punto: "bg-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    etiqueta: "Habilitación sanitaria",
  },
  cambiario: {
    punto: "bg-sky-500",
    chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    etiqueta: "Pagos al exterior",
  },
  general: {
    punto: "bg-muted/35",
    chip: "bg-surface-2 text-muted",
    etiqueta: "Otros organismos",
  },
};

/** El renglón del sumario: organismo · puntos guía · referencia de la norma. */
function LineaSumario({
  n,
  abierta,
  onToggle,
  indice,
}: {
  n: NormaBoletin;
  abierta: boolean;
  onToggle: () => void;
  indice: number;
}) {
  const estilo = FAMILIA_ESTILO[n.familia];
  const partes = decodificarGde(n.codigo);
  const familia = FAMILIAS.find((f) => f.id === n.familia);

  return (
    <li
      className="animate-[fadeSlide_0.4s_ease-out_both]"
      style={{ animationDelay: `${Math.min(indice * 45, 360)}ms` }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierta}
        className="group flex w-full items-baseline gap-3 px-2 py-2.5 text-left transition-colors hover:bg-surface-2/60"
      >
        <span
          aria-hidden
          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${estilo.punto}`}
        />
        <span className="text-sm font-medium text-foreground transition-colors group-hover:text-accent">
          {n.organismo}
        </span>
        {/* Los puntos guía del sumario impreso: acá también separan el
            organismo de su referencia, y se comen el espacio sobrante. */}
        <span
          aria-hidden
          className="hidden min-w-6 flex-1 translate-y-[-4px] border-b-2 border-dotted border-muted/30 sm:block"
        />
        <span className="ml-auto shrink-0 font-mono text-xs text-muted sm:ml-0">
          {n.tipo} {n.numero}
        </span>
      </button>

      {abierta && (
        <div className="mb-2 ml-4.5 space-y-3 border-l border-border pl-4 pb-1">
          {n.sumario && (
            <p className="text-sm leading-snug text-foreground">{n.sumario}</p>
          )}

          {familia && (
            <div>
              <p
                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${estilo.chip}`}
              >
                {familia.etiqueta}
              </p>
              <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-muted">
                {familia.queControla}
              </p>
            </div>
          )}

          {partes.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted">
                Su código de expediente, parte por parte
              </p>
              <div className="mt-1.5 flex flex-wrap items-stretch gap-1">
                {partes.map((p, i) => (
                  <span
                    key={`${p.valor}-${i}`}
                    className="rounded-md border border-border bg-surface-2/60 px-2 py-1"
                  >
                    <span className="block font-mono text-xs text-foreground">
                      {p.valor}
                    </span>
                    <span className="block text-[10px] leading-tight text-muted">
                      {p.que}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {n.motivos.length > 0 && (
            <p className="text-[11px] text-muted">
              Marcada por: {n.motivos.map((m) => m.toLowerCase()).join(" · ")}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * El colophon del Boletín: año en romanos y número de edición, como los
 * imprime la tapa. Ancla la pantalla en la fuente y da la escala de la cosa
 * (va por el año CXXXIV: sale sin faltar desde 1893).
 */
function Sello({ boletin }: { boletin: BoletinDelDia }) {
  return (
    <div className="shrink-0 self-start border-2 border-double border-border bg-surface px-5 py-4 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
        Año
      </p>
      <p className="font-mono text-3xl font-semibold leading-none tracking-tight text-foreground">
        {boletin.anioRomano ?? "—"}
      </p>
      <div className="my-3 border-t border-dotted border-border" />
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
        Edición
      </p>
      <p className="font-mono text-lg leading-tight text-accent">
        {boletin.numero ?? "—"}
      </p>
    </div>
  );
}

/**
 * Cada portal con su color. Los feeds no traen imagen —dos de los cuatro ni
 * siquiera publican og:image—, así que el color y la tipografía son lo que
 * distingue una nota de otra y le da ritmo a la portada.
 */
const MEDIO_ESTILO: Record<string, { texto: string; barra: string }> = {
  "aduana-news": { texto: "text-accent", barra: "bg-accent" },
  "trade-news": { texto: "text-indigo-500", barra: "bg-indigo-500" },
  argenports: { texto: "text-sky-500", barra: "bg-sky-500" },
  globalports: { texto: "text-emerald-500", barra: "bg-emerald-500" },
};

function estiloMedio(id: string) {
  return MEDIO_ESTILO[id] ?? { texto: "text-muted", barra: "bg-muted" };
}

/** Sello del medio: ícono del portal, nombre, cuándo salió y de qué trata. */
function Firma({ n }: { n: Noticia }) {
  const e = estiloMedio(n.medioId);
  const icono = faviconDeMedio(n.medioId);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.14em]">
      {icono && (
        // Ícono del propio medio: si el portal lo mueve de lugar, se oculta.
        // Va con <img> y no con next/image: son 14px de un dominio ajeno, y
        // optimizarlos costaría más que servirlos tal cual.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={icono}
          alt=""
          width={14}
          height={14}
          loading="lazy"
          className="h-3.5 w-3.5 shrink-0 rounded-[3px] object-contain"
          onError={(ev) => {
            ev.currentTarget.style.display = "none";
          }}
        />
      )}
      <span className={`font-semibold ${e.texto}`}>{n.medioNombre}</span>
      {n.cuando && <span className="text-muted">· {n.cuando}</span>}
      {n.categoria && <span className="text-muted">· {n.categoria}</span>}
    </p>
  );
}

/**
 * Agrupa por el día que ya viene redactado del servidor ("hoy 12:51"), sin
 * volver a calcular fechas en el cliente.
 */
function agruparPorDia(notas: Noticia[]): { dia: string; notas: Noticia[] }[] {
  const orden: string[] = [];
  const porDia = new Map<string, Noticia[]>();
  for (const n of notas) {
    const dia = n.cuando.startsWith("hoy")
      ? "Hoy"
      : n.cuando.startsWith("ayer")
        ? "Ayer"
        : (n.cuando.split(" ")[0] ?? "Antes");
    if (!porDia.has(dia)) {
      porDia.set(dia, []);
      orden.push(dia);
    }
    porDia.get(dia)!.push(n);
  }
  return orden.map((dia) => ({ dia, notas: porDia.get(dia)! }));
}

/** Las demás notas del día, en columnas. */
function NotaBreve({ n }: { n: Noticia }) {
  const e = estiloMedio(n.medioId);
  return (
    <a href={n.url} target="_blank" rel="noreferrer noopener" className="group block">
      <span
        aria-hidden
        className={`mb-2 block h-0.5 w-8 rounded-full transition-all group-hover:w-14 ${e.barra}`}
      />
      <Firma n={n} />
      <h3 className="mt-1.5 text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-accent">
        {n.titulo}
      </h3>
      {n.resumen && (
        <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted">
          {n.resumen}
        </p>
      )}
      {n.autor && <p className="mt-1.5 text-[11px] text-muted">Por {n.autor}</p>}
    </a>
  );
}

export function BoletinInicio({
  boletin,
  prensa,
}: {
  boletin: BoletinDelDia;
  prensa: ListadoNoticias;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);

  // Solo comercio exterior: el resto de la normativa del día no es asunto del
  // estudio y llenar la pantalla con eso hace perder lo que sí importa.
  const relevantes = boletin.normas.filter((n) => n.relevante);
  const hayNovedades = relevantes.length > 0;

  // Qué clases de control aparecieron hoy, para leer la jornada de un vistazo.
  const porFamilia = FAMILIAS.map((f) => ({
    ...f,
    cantidad: relevantes.filter((n) => n.familia === f.id).length,
  })).filter((f) => f.cantidad > 0);

  const titular = boletin.error
    ? "No se pudo leer la edición de hoy"
    : hayNovedades
      ? `Hoy salieron ${relevantes.length} norma${relevantes.length === 1 ? "" : "s"} que te tocan`
      : "Hoy no salió nada que te toque";

  const bajada = boletin.error
    ? boletin.error
    : hayNovedades
      ? "Abrí cada una para ver qué organismo la dicta y dónde te puede frenar la carpeta."
      : `Se revisaron las ${boletin.normas.length} norma${boletin.normas.length === 1 ? "" : "s"} de la Primera Sección y ninguna toca comercio exterior.`;

  return (
    <div className="space-y-10">
      {/* El veredicto del día: la única pregunta que importa a las 9 de la mañana. */}
      {/* En mobile el veredicto va primero: el sello es contexto, no la respuesta. */}
      <section className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${
                boletin.error
                  ? "bg-amber-500"
                  : hayNovedades
                    ? "bg-accent"
                    : "bg-emerald-500"
              }`}
            />
            Boletín Oficial · Primera Sección
          </p>

          <h1 className="mt-3 max-w-2xl text-3xl font-semibold leading-[1.15] tracking-tight text-foreground sm:text-4xl">
            {titular}
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            {bajada}
          </p>

          {boletin.fechaTexto && (
            <p className="mt-4 text-sm text-foreground first-letter:uppercase">
              {boletin.fechaTexto}
            </p>
          )}

          <a
            href={boletin.url}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-accent"
          >
            Ver el Boletín completo
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>

        {!boletin.error && <Sello boletin={boletin} />}
      </section>

      {/* Qué organismos aparecieron hoy y qué controla cada uno. */}
      {porFamilia.length > 0 && (
        <section className="flex flex-wrap gap-x-6 gap-y-2 border-y border-border py-3">
          {porFamilia.map((f) => (
            <span key={f.id} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full ${FAMILIA_ESTILO[f.id].punto}`}
              />
              <span className="text-foreground">{f.etiqueta}</span>
              <span className="font-mono text-muted">{f.cantidad}</span>
            </span>
          ))}
        </section>
      )}

      {/* El sumario, como lo publica el Boletín, pero anotado. */}
      {hayNovedades && (
        <section>
          <h2 className="text-sm font-semibold text-foreground">Lo que te toca</h2>
          <p className="mt-1 text-xs text-muted">
            Tocá un renglón para ver qué controla ese organismo y cómo se lee su
            código de expediente.
          </p>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {relevantes.map((n, i) => (
              <LineaSumario
                key={n.id}
                n={n}
                indice={i}
                abierta={abierta === n.id}
                onToggle={() => setAbierta(abierta === n.id ? null : n.id)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Qué está pasando en el rubro, según los medios que lo cubren. */}
      {prensa.noticias.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between gap-4 border-b-2 border-foreground pb-2">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              En el rubro
            </h2>
            <p className="hidden text-[11px] uppercase tracking-[0.14em] text-muted sm:block">
              {prensa.noticias.length} notas · 4 portales
            </p>
          </div>

          {/* Todas del mismo tamaño: no medimos importancia, solo cuándo salió
              cada una. Lo único que las ordena es el día. */}
          {agruparPorDia(prensa.noticias).map((grupo) => (
            <div key={grupo.dia} className="mt-6">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                {grupo.dia}
              </p>
              <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
                {grupo.notas.map((n) => (
                  <li key={n.id}>
                    <NotaBreve n={n} />
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {prensa.fallaron.length > 0 && (
            <p className="mt-4 text-[11px] text-muted">
              Sin respuesta:{" "}
              {prensa.fallaron.map((f) => `${f.nombre} (${f.error})`).join(" · ")}
            </p>
          )}
        </section>
      )}

    </div>
  );
}
