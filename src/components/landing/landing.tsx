"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Container,
  ChevronDown,
  FileCheck2,
  FileText,
  LogIn,
  Plane,
  Ship,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { WorldRoutes } from "@/components/landing/world-routes";
import { InstagramPosts } from "@/components/landing/instagram-posts";

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

/* ───────────────────── Scroll suave con easing para anclas ─────────────────────
 * Los enlaces internos (#portal, #proceso) hacen un desplazamiento animado con
 * curva easeInOutCubic en vez del salto directo. Respeta prefers-reduced-motion.
 */
function useSmoothAnchors(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let rafId: number | null = null;

    const animarHasta = (destino: number) => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      const inicio = window.scrollY;
      const delta = destino - inicio;
      const duracion = Math.min(900, Math.max(450, Math.abs(delta) * 0.6));
      const t0 = performance.now();
      const ease = (t: number) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const paso = (now: number) => {
        const t = Math.min(1, (now - t0) / duracion);
        window.scrollTo({ top: inicio + delta * ease(t), behavior: "instant" });
        if (t < 1) rafId = requestAnimationFrame(paso);
        else rafId = null;
      };
      rafId = requestAnimationFrame(paso);
    };

    const onClick = (e: MouseEvent) => {
      const enlace = (e.target as HTMLElement)?.closest?.(
        'a[href^="#"]',
      ) as HTMLAnchorElement | null;
      if (!enlace) return;
      const id = enlace.getAttribute("href")?.slice(1);
      if (!id) return;
      const destinoEl = document.getElementById(id);
      if (!destinoEl) return;
      e.preventDefault();
      const margen = 24;
      const destino = Math.max(
        0,
        window.scrollY + destinoEl.getBoundingClientRect().top - margen,
      );
      animarHasta(destino);
      history.replaceState(null, "", `#${id}`);
    };

    root.addEventListener("click", onClick);
    return () => {
      root.removeEventListener("click", onClick);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [rootRef]);
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
    <div className="landing-orb relative mx-auto aspect-square w-[280px] sm:w-[340px] md:w-[400px] lg:w-[420px]">
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

/** Documentos reales de la operación (tipos que maneja el portal). */
const DOCS_MOCK = [
  { label: "Factura comercial", done: true },
  { label: "Packing list", done: true },
  { label: "Documento de transporte", done: true },
  { label: "Certificado de origen", done: true },
  { label: "Despacho SIM", done: false },
];

/* ───────────────────────── Página ───────────────────────── */

export function Landing({
  /** Ruta del panel si el visitante ya tiene sesión; null si no está logueado. */
  destinoPanel = null,
}: {
  destinoPanel?: string | null;
}) {
  const rootRef = useReveal();
  useSmoothAnchors(rootRef);

  return (
    <div ref={rootRef} className="relative min-h-screen overflow-x-clip">
      {/* ── Header ── */}
      <header className="relative z-10">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Brand size="sm" />
          {destinoPanel ? (
            <Link
              href={destinoPanel}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent"
            >
              <LogIn className="h-4 w-4" />
              Ir a mi panel
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/registro"
                className="inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold text-muted transition-colors hover:text-accent"
              >
                Registrarme
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-[0_10px_28px_-14px_var(--ring)] transition-opacity hover:opacity-90"
              >
                <LogIn className="h-4 w-4" />
                Ingresar
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* ── Hero ── */}
      {/* El hero ocupa exactamente una pantalla: así la flecha del pie queda
          visible sin scrollear, que es lo único que le pide al visitante. */}
      <section className="relative flex min-h-[calc(100dvh-4rem)] flex-col overflow-hidden">
        <WorldRoutes className="absolute inset-0 h-full w-full" />
        <div
          aria-hidden
          className="absolute left-1/2 top-0 -z-10 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-accent/10 blur-[140px]"
        />

        <div className="relative mx-auto grid w-full max-w-6xl flex-1 content-center items-center gap-14 px-5 py-10 sm:px-8 md:grid-cols-[1.05fr_0.95fr]">
          <div className="text-center md:text-left">
            <h1
              data-reveal
              className="landing-reveal text-5xl font-extrabold leading-[1.04] tracking-tight text-foreground md:text-6xl"
            >
              Tu carga cruza fronteras.
              <br />
              <span className="text-accent">Nosotros la despachamos.</span>
            </h1>

            <p
              data-reveal
              className="landing-reveal mt-6 text-lg text-muted"
            >
              Despachamos tu importación o exportación de punta a punta.
            </p>

            <div data-reveal className="landing-reveal mt-8 flex flex-wrap items-center justify-center gap-4 md:justify-start">
              <div className="flex flex-col items-center rounded-2xl bg-accent-soft px-5 py-3">
                <span className="text-3xl font-extrabold text-accent">+20</span>
                <span className="text-xs font-medium uppercase tracking-wide text-accent">
                  años
                </span>
              </div>
              <div className="flex flex-col items-center rounded-2xl bg-accent-soft px-5 py-3">
                <span className="text-3xl font-extrabold text-accent">+10K</span>
                <span className="text-xs font-medium uppercase tracking-wide text-accent">
                  despachos
                </span>
              </div>
            </div>

          </div>

          <div data-reveal className="landing-reveal hidden md:block">
            <TransportOrb />
          </div>
        </div>

        {/* Invitación a seguir bajando: es lo único que pedimos en esta pantalla. */}
        <div data-reveal className="landing-reveal relative flex shrink-0 justify-center pb-8">
          <a
            href="#portal"
            aria-label="Ver cómo trabajamos"
            className="group flex flex-col items-center gap-2 text-muted transition-colors hover:text-accent"
          >
            <span className="text-xs font-medium uppercase tracking-[0.2em]">
              Cómo trabajamos
            </span>
            <ChevronDown className="landing-flecha h-10 w-10" strokeWidth={1.5} />
          </a>
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
        <div className="relative mx-auto grid max-w-6xl items-start gap-12 px-5 py-20 sm:px-8 sm:py-28 md:grid-cols-5">
          <div data-reveal className="landing-reveal md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              Portal de clientes
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Tu despacho, en vivo
            </h2>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-muted">
              Cada operación tiene su tablero: estado, documentos y avisos del
              estudio en el momento.
            </p>
            <ul className="mt-7 space-y-3.5">
              {[
                "Seguimiento paso a paso, de «Recibida» a «Entregada»",
                "Documentos de la operación en un solo lugar",
                "Cotizaciones y liquidaciones en PDF",
                "Avisos del estudio directo en tu tablero",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-foreground">
                  <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-accent" />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/reunion"
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-accent-foreground shadow-[0_12px_32px_-12px_var(--ring)] transition-all hover:opacity-90"
              >
                ¿Querés acceder a todo esto?
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#proceso"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface/70 px-6 py-3.5 text-sm font-semibold text-foreground transition-colors hover:border-accent/50"
              >
                ¿Cómo trabajamos?
              </a>
            </div>
          </div>

          {/* Mock del portal — refleja el tablero real del cliente */}
          <div data-reveal className="landing-reveal md:col-span-3">
            <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-[0_30px_80px_-40px_var(--ring)] sm:p-6">
              {/* Encabezado de la operación */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-[0_8px_20px_-8px_var(--ring)]">
                    <Container className="h-[22px] w-[22px]" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">IMPO 2324</p>
                    <p className="text-[11px] text-muted">
                      Importación · Marítima · China → Argentina
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  En curso
                </span>
              </div>

              {/* Progreso: 6 etapas reales */}
              <div className="mt-6">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-semibold text-foreground">
                    Canal asignado
                  </p>
                  <p className="text-[11px] font-medium text-muted">Paso 4 de 6</p>
                </div>
                <div className="mt-2.5 flex items-center gap-1">
                  {PIPELINE.map((etapa, i) => (
                    <span
                      key={etapa}
                      className={`h-1.5 flex-1 rounded-full ${
                        i <= 3 ? "bg-accent" : "bg-surface-2"
                      }`}
                    />
                  ))}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted">
                  <span>Recibida</span>
                  <span>Entregada</span>
                </div>
              </div>

              {/* Datos clave de la operación */}
              <div className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-border bg-surface-2/40 p-3">
                  <p className="text-[9px] font-medium uppercase tracking-wide text-muted">
                    NCM
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-foreground">
                    8471.30.12
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface-2/40 p-3">
                  <p className="text-[9px] font-medium uppercase tracking-wide text-muted">
                    Incoterm
                  </p>
                  <p className="mt-1 text-[13px] font-semibold text-foreground">
                    FOB Shanghái
                  </p>
                </div>
                <div className="rounded-xl border border-accent/30 bg-accent-soft p-3">
                  <p className="text-[9px] font-medium uppercase tracking-wide text-accent">
                    Valor CIF
                  </p>
                  <p className="mt-1 text-[13px] font-bold text-accent">
                    USD 48.500
                  </p>
                </div>
              </div>

              {/* Documentos */}
              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <FileText className="h-3.5 w-3.5 text-muted" />
                    Documentos
                  </p>
                  <span className="text-[11px] font-medium text-muted">4 de 5</span>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  {DOCS_MOCK.map(({ label, done }) => (
                    <div
                      key={label}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] ${
                        done
                          ? "border-border bg-surface-2/40 text-foreground"
                          : "border-dashed border-border text-muted"
                      }`}
                    >
                      {done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 shrink-0 text-muted" />
                      )}
                      <span className="truncate">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Aviso del estudio */}
              <div className="mt-5 rounded-xl border border-border bg-surface-2/40 p-3.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                    JC
                  </span>
                  <p className="text-[11px] font-semibold text-foreground">
                    J&amp;C Comex
                  </p>
                  <span className="ml-auto text-[10px] text-muted">hoy 10:24</span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  La Aduana asignó el canal de control. Avanzamos con la
                  verificación que corresponda para liberar la mercadería.
                </p>
              </div>
            </div>
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

      <InstagramPosts />
    </div>
  );
}
