"use client";

import { useState } from "react";
import { ArrowUpRight, BookOpen, Check, Minus } from "lucide-react";
import {
  FAMILIAS,
  SECCIONES_BO,
  decodificarGde,
  type BoletinDelDia,
  type FamiliaControl,
  type NormaBoletin,
} from "@/lib/boletin/tipos";
import type { ListadoNoticias } from "@/lib/noticias/tipos";

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
          <h2 className="text-sm font-semibold text-foreground">En el rubro</h2>
          <p className="mt-1 text-xs text-muted">
            Últimas notas de los portales de comercio exterior y puertos.
          </p>

          <ul className="mt-3 divide-y divide-border border-y border-border">
            {prensa.noticias.map((n) => (
              <li key={n.id}>
                <a
                  href={n.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="group block px-2 py-3 transition-colors hover:bg-surface-2/60"
                >
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    <span className="text-accent">{n.medioNombre}</span>
                    {n.cuando && <span>· {n.cuando}</span>}
                    {n.categoria && <span>· {n.categoria}</span>}
                  </p>
                  <p className="mt-1 text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-accent">
                    {n.titulo}
                  </p>
                  {n.resumen && (
                    <p className="mt-1 line-clamp-2 max-w-prose text-xs leading-relaxed text-muted">
                      {n.resumen}
                    </p>
                  )}
                  {n.autor && (
                    <p className="mt-1 text-[11px] text-muted">Por {n.autor}</p>
                  )}
                </a>
              </li>
            ))}
          </ul>

          {prensa.fallaron.length > 0 && (
            <p className="mt-2 text-[11px] text-muted">
              Sin respuesta:{" "}
              {prensa.fallaron.map((f) => `${f.nombre} (${f.error})`).join(" · ")}
            </p>
          )}
        </section>
      )}

      {/* Material de referencia: por qué leemos solo una de las cuatro secciones. */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <BookOpen className="h-4 w-4 text-accent" />
          El Boletín tiene cuatro secciones
        </h2>
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted">
          Sale todos los días hábiles. Solo una publica normativa, y es la que se
          lee en esta pantalla.
        </p>

        <ul className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {SECCIONES_BO.map((s) => (
            <li key={s.n} className="flex gap-3">
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-xs ${
                  s.leemos
                    ? "bg-accent text-accent-foreground"
                    : "bg-surface-2 text-muted"
                }`}
              >
                {s.n}
              </span>
              <div>
                <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  {s.nombre}
                  {s.leemos ? (
                    <Check className="h-3 w-3 text-accent" />
                  ) : (
                    <Minus className="h-3 w-3 text-muted" />
                  )}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  {s.detalle}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
