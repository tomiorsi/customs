"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Container,
  FileCheck2,
  Plane,
  Ship,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { WorldRoutes } from "@/components/landing/world-routes";

/* ───────────────────────── Reveal on scroll ───────────────────────── */

function useReveal() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // Scroll listener + getBoundingClientRect (sin IntersectionObserver): es
    // determinístico en todos los navegadores y para ~20 nodos cuesta nada.
    let pendientes = Array.from(
      root.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-visible)"),
    );

    // Respaldo por si algún entorno no despacha eventos de scroll con fluidez.
    const intervalo = window.setInterval(() => check(), 500);

    const detach = () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      window.clearInterval(intervalo);
    };

    const check = () => {
      const vh =
        window.innerHeight || document.documentElement.clientHeight || 800;
      const limite = vh * 0.94;
      pendientes = pendientes.filter((el) => {
        if (el.getBoundingClientRect().top < limite) {
          el.classList.add("is-visible");
          return false;
        }
        return true;
      });
      if (pendientes.length === 0) detach();
    };

    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    check();
    return detach;
  }, []);

  return rootRef;
}

/* ───────────────────────── Pieza visual del hero ─────────────────────────
 * Círculo con ruta punteada animada y el modo de transporte que rota:
 * avión → barco → camión (CSS puro, sin timers).
 */

function TransportOrb() {
  const modos = [
    { Icon: Plane, label: "Aéreo" },
    { Icon: Ship, label: "Marítimo" },
    { Icon: Truck, label: "Terrestre" },
  ];

  return (
    <div className="landing-orb relative mx-auto aspect-square w-[280px] sm:w-[340px] lg:w-[420px]">
      {/* Anillos */}
      <div className="absolute inset-0 rounded-full border border-border/70" />
      <div className="absolute inset-[12%] rounded-full border border-border/50" />
      <div className="absolute inset-[26%] rounded-full border border-dashed border-accent/30" />

      {/* Ruta orbital punteada con punto viajando */}
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
        <circle
          cx="100"
          cy="100"
          r="88"
          fill="none"
          stroke="var(--accent)"
          strokeOpacity="0.35"
          strokeWidth="1"
          strokeDasharray="3 7"
          className="landing-orbit-dash"
        />
        <circle r="3" fill="var(--accent)">
          <animateMotion
            dur="14s"
            repeatCount="indefinite"
            path="M 100 12 A 88 88 0 1 1 99.99 12"
          />
        </circle>
      </svg>

      {/* Núcleo con el modo de transporte rotante */}
      <div className="absolute inset-[33%] rounded-full bg-surface/80 shadow-[0_20px_60px_-20px_var(--ring)] ring-1 ring-border backdrop-blur">
        {modos.map(({ Icon, label }, i) => (
          <div
            key={label}
            className="landing-transport absolute inset-0 flex flex-col items-center justify-center gap-1.5"
            style={{ animationDelay: `${i * 4}s` }}
          >
            <Icon className="h-12 w-12 text-accent sm:h-14 sm:w-14" strokeWidth={1.6} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Chips satélite */}
      <span className="landing-float absolute -left-1 top-[18%] rounded-full border border-border bg-surface/90 px-3 py-1 text-[11px] font-semibold text-foreground shadow-sm backdrop-blur">
        IMPO
      </span>
      <span
        className="landing-float absolute -right-2 top-[34%] rounded-full border border-border bg-surface/90 px-3 py-1 text-[11px] font-semibold text-foreground shadow-sm backdrop-blur"
        style={{ animationDelay: "1.2s" }}
      >
        EXPO
      </span>
      <span
        className="landing-float absolute bottom-[14%] left-[8%] rounded-full border border-border bg-surface/90 px-3 py-1 text-[11px] font-semibold text-foreground shadow-sm backdrop-blur"
        style={{ animationDelay: "2.1s" }}
      >
        NCM
      </span>
      <span
        className="landing-float absolute bottom-[6%] right-[16%] rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-[11px] font-semibold text-accent shadow-sm"
        style={{ animationDelay: "0.6s" }}
      >
        SIM
      </span>
    </div>
  );
}

/* ───────────────────────── Datos de las secciones ───────────────────────── */

const PASOS = [
  {
    Icon: FileCheck2,
    titulo: "Apertura y cotización",
    texto:
      "Nos mandás la proforma o el pedido. Cotizamos tributos y logística y te lo llevás en un PDF claro, antes de comprometer un dólar.",
  },
  {
    Icon: ClipboardCheck,
    titulo: "Documentación validada",
    texto:
      "Factura, packing y transporte se cruzan entre sí. Cualquier inconsistencia salta antes de llegar a la Aduana, no después.",
  },
  {
    Icon: ShieldCheck,
    titulo: "Oficialización",
    texto:
      "Clasificación cerrada, SIM oficializado y tributos por VEP. Te avisamos el canal asignado apenas sale.",
  },
  {
    Icon: Truck,
    titulo: "Retiro y entrega",
    texto:
      "Gestionamos la liberación y coordinamos el retiro. Seguís cada movimiento desde tu portal, en tiempo real.",
  },
];

const PIPELINE = [
  "Recibida",
  "En preparación",
  "Presentada en Aduana",
  "Canal asignado",
  "Liberada",
  "Entregada",
];

/* ───────────────────────── Página ───────────────────────── */

export function Landing() {
  const rootRef = useReveal();

  return (
    <div ref={rootRef} className="relative min-h-screen overflow-x-clip">
      {/* ── Header ── */}
      <header className="relative z-10">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-center px-5 sm:px-8">
          <Brand size="sm" />
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <WorldRoutes className="absolute inset-0 h-full w-full" />
        <div
          aria-hidden
          className="absolute left-1/2 top-0 -z-10 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-accent/10 blur-[140px]"
        />

        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 py-16 sm:px-8 lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[1.05fr_0.95fr] lg:py-10">
          <div>
            <h1
              data-reveal
              className="landing-reveal text-4xl font-extrabold leading-[1.06] tracking-tight text-foreground sm:text-5xl lg:text-6xl"
            >
              Tu carga cruza fronteras.
              <br />
              <span className="text-accent">Nosotros la despachamos.</span>
            </h1>

            <p
              data-reveal
              className="landing-reveal mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg"
            >
              Importaciones y exportaciones con clasificación arancelaria fundada,
              cotización de tributos antes de embarcar y seguimiento de cada
              despacho en tiempo real, desde la proforma hasta la entrega.
            </p>

            <div data-reveal className="landing-reveal mt-9 flex flex-wrap items-center gap-3">
              <a
                href="#portal"
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground shadow-[0_12px_32px_-12px_var(--ring)] transition-all hover:opacity-90"
              >
                Conocé cómo trabajamos
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>

          </div>

          <div data-reveal className="landing-reveal">
            <TransportOrb />
          </div>
        </div>
      </section>

      {/* ── Proceso ── */}
      <section id="proceso" className="relative">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
          <div data-reveal className="landing-reveal max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              Cómo trabajamos
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Cuatro pasos, cero sorpresas
            </h2>
          </div>

          <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PASOS.map(({ Icon, titulo, texto }, i) => (
              <li
                key={titulo}
                data-reveal
                style={{ transitionDelay: `${i * 110}ms` }}
                className="landing-reveal relative rounded-2xl border border-border bg-surface p-6"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <Icon className="h-5 w-5" strokeWidth={1.8} />
                  </span>
                  <span className="text-4xl font-extrabold tracking-tight text-border">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-5 text-base font-semibold text-foreground">{titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Portal ── */}
      <section
        id="portal"
        className="relative overflow-hidden border-t border-border/60 bg-surface/40"
      >
        <div
          aria-hidden
          className="absolute -right-40 top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-accent/10 blur-[120px]"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2">
          <div data-reveal className="landing-reveal">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              Portal de clientes
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Tu despacho, en vivo
            </h2>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-muted">
              Cada operación tiene su tablero: estado, documentos y avisos del
              estudio en el momento. Sin cadenas de mails ni &laquo;¿cómo viene lo
              mío?&raquo;.
            </p>
            <ul className="mt-7 space-y-3.5">
              {[
                "Seguimiento paso a paso, de «Recibida» a «Entregada»",
                "Documentos de la operación en un solo lugar",
                "Cotizaciones y liquidaciones en PDF, al instante",
                "Avisos del estudio directo en tu tablero",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-foreground">
                  <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-accent" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/reunion"
              className="mt-9 inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground shadow-[0_12px_32px_-12px_var(--ring)] transition-all hover:opacity-90"
            >
              ¿Querés acceder a todo esto?
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Mock del pipeline */}
          <div data-reveal className="landing-reveal">
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-[0_30px_80px_-40px_var(--ring)] sm:p-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <Container className="h-[18px] w-[18px]" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">IMPO 2324</p>
                    <p className="text-[11px] text-muted">Importación · Marítima</p>
                  </div>
                </div>
                <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent">
                  En curso
                </span>
              </div>

              <ol className="mt-7 space-y-0">
                {PIPELINE.map((etapa, i) => {
                  const done = i < 3;
                  const current = i === 3;
                  return (
                    <li key={etapa} className="relative flex items-center gap-3.5 pb-5 last:pb-0">
                      {i < PIPELINE.length - 1 && (
                        <span
                          className={`absolute left-[11px] top-6 h-full w-px ${
                            done ? "bg-accent/50" : "bg-border"
                          }`}
                        />
                      )}
                      <span
                        className={`relative z-10 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                          done
                            ? "bg-accent text-accent-foreground"
                            : current
                              ? "bg-accent-soft text-accent ring-2 ring-accent"
                              : "bg-surface-2 text-muted"
                        }`}
                      >
                        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <span
                        className={`text-sm ${
                          current
                            ? "font-semibold text-foreground"
                            : done
                              ? "text-foreground"
                              : "text-muted"
                        }`}
                      >
                        {etapa}
                      </span>
                      {current && (
                        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-accent">
                          <Clock3 className="h-3.5 w-3.5" />
                          Hoy
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer>
        <div className="mx-auto flex max-w-6xl items-center justify-center px-5 py-10 sm:px-8">
          <p className="text-xs text-muted">
            © {new Date().getFullYear()} RCV Orsi · Estudio aduanero
          </p>
        </div>
      </footer>
    </div>
  );
}
