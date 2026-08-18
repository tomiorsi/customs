"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import {
  FAMILIAS,
  decodificarGde,
  type BoletinDelDia,
  type FamiliaControl,
  type NormaBoletin,
} from "@/lib/boletin/tipos";
import type { ListadoNoticias } from "@/lib/noticias/tipos";
import {
  NotaDestacada,
  PORTALES,
} from "@/components/noticia-tarjetas";

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
 * La tapa del Boletín, dibujada.
 *
 * Es SVG y no una foto: pesa nada, se ve nítida en cualquier pantalla y sigue
 * al tema sin tener que mantener dos archivos. No pretende ser la portada real
 * —eso sería copiar un documento oficial—; es el gesto de "acá hay una edición
 * impresa", que es lo que le da peso al bloque.
 */
function PortadaBoletin() {
  return (
    <svg
      viewBox="0 0 132 168"
      width={106}
      height={136}
      /* El tamaño va en atributos y no en clases: una clase arbitraria que no
         llegue a generarse deja el SVG a tamaño completo y se come la pantalla.
         Los atributos los respeta el navegador siempre. */
      className="hidden shrink-0 drop-shadow-lg sm:block"
      aria-hidden
    >
      {/* Hoja */}
      <rect x="6" y="4" width="120" height="160" rx="6" fill="#fdf6ef" />
      {/* Encabezado */}
      <text
        x="18"
        y="28"
        fill="#1f2937"
        fontSize="9"
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        letterSpacing="0.4"
      >
        BOLETÍN OFICIAL
      </text>
      <rect x="18" y="38" width="52" height="4" rx="2" fill="#1f2937" />
      {/* Renglones del texto */}
      {[54, 64, 74, 84, 94, 104, 114].map((y, i) => (
        <rect
          key={y}
          x="18"
          y={y}
          width={i % 3 === 2 ? 62 : 96}
          height="3"
          rx="1.5"
          fill="#d8cfc4"
        />
      ))}
      {/* Sello al pie */}
      <rect x="86" y="132" width="28" height="12" rx="3" fill="#f97316" />
    </svg>
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

  // Destacadas: las tres primeras QUE TENGAN portada. Si se tomaran las tres
  // primeras a secas, un día sin imagen dejaba tres tarjetas grandes vacías —
  // peor que no tener destacadas.
  const conPortada = prensa.noticias.filter((n) => n.imagen);
  const destacadas = conPortada.slice(0, 3);

  // Solo comercio exterior: el resto de la normativa del día no es asunto del
  // estudio y llenar la pantalla con eso hace perder lo que sí importa.
  const relevantes = boletin.normas.filter((n) => n.relevante);
  const hayNovedades = relevantes.length > 0;

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
    <div className="space-y-6">
      {/* Dos mitades a lo ancho: la tapa de la edición y el veredicto del día.
          Con `flex` y no con una grilla de columnas arbitrarias — esa se
          apilaba en una sola columna y el bloque quedaba altísimo. */}
      <section className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface sm:flex-row">
        {/* Tapa de la edición: identidad del Boletín, en el naranja de la
            marca. Ancla la pantalla en la fuente y da la escala de la cosa —va
            por el año CXXXIV, sale sin faltar desde 1893—. */}
        <div className="flex shrink-0 items-center gap-5 bg-accent p-5 text-[var(--accent-foreground)] sm:w-80 lg:w-96">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] opacity-80">
              Boletín Oficial
            </p>
            <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.2em] opacity-80">
              Año
            </p>
            <p className="font-mono text-2xl font-semibold leading-none tracking-tight">
              {boletin.anioRomano ?? "—"}
            </p>
            <p className="mt-2.5 font-mono text-[9px] uppercase tracking-[0.2em] opacity-80">
              Edición N°
            </p>
            <p className="font-mono text-xl leading-tight">
              {boletin.numero ?? "—"}
            </p>
            <p className="mt-4 font-mono text-[9px] uppercase tracking-[0.14em] opacity-80">
              {prensa.noticias.length} notas · {PORTALES} portales
            </p>
          </div>

          <PortadaBoletin />
        </div>

        {/* El veredicto: la única pregunta que importa a las nueve de la mañana. */}
        <div className="flex min-w-0 flex-col justify-center p-5 sm:p-6">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
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
            {boletin.error
              ? "No se pudo leer"
              : hayNovedades
                ? "Con novedades"
                : "Revisión completa"}
          </p>

          <h1 className="mt-2 text-2xl font-semibold leading-[1.15] tracking-tight text-foreground">
            {titular}
          </h1>

          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            {bajada}
          </p>

          {boletin.fechaTexto && (
            <p className="mt-3 flex items-center gap-2 text-sm text-foreground first-letter:uppercase">
              <CalendarDays className="h-4 w-4 shrink-0 text-muted" />
              {boletin.fechaTexto}
            </p>
          )}

          <a
            href={boletin.url}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-flex items-center gap-1 self-start text-xs font-medium text-accent transition-opacity hover:opacity-80"
          >
            Ver el Boletín completo
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </section>

      {/* El sumario, como lo publica el Boletín, pero anotado. */}
      {hayNovedades && (
        <section>
          {/* Sin encabezado a propósito: los renglones se explican solos y el
              título repetía lo que la tarjeta de arriba ya dice. */}
          <ul className="divide-y divide-border border-y border-border">
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

      {/* Las tres del día, con portada. El resto vive en «Ver todas»: la
          portada tiene que entrar en una pantalla, y treinta notas apiladas no
          se leen — se scrollean sin mirar. */}
      {destacadas.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between gap-4 border-b-2 border-foreground pb-2">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Noticias destacadas del día
            </h2>
            <Link
              href="/admin/noticias"
              className="shrink-0 text-xs font-medium text-accent transition-opacity hover:opacity-80"
            >
              Ver todas ({prensa.noticias.length}) →
            </Link>
          </div>

          <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {destacadas.map((n) => (
              <li key={n.id}>
                <NotaDestacada n={n} />
              </li>
            ))}
          </ul>

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
