"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, AlertCircle } from "lucide-react";
import {
  CONDICIONES_IVA,
  PLANES,
  precioFormateado,
  type ClavePlan,
  type EstadoSuscripcion,
} from "@/lib/suscripcion";

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

/**
 * Elección de plan. Durante la prueba se muestra cuánto queda; vencida, el
 * mismo componente pasa a ser la pantalla de cierre —mismo contenido, distinto
 * encabezado— para no hacer dos pantallas que dicen lo mismo.
 */
export function PlanesSuscripcion({
  estado,
  planActual,
  facturacion,
}: {
  estado: EstadoSuscripcion;
  planActual: ClavePlan | null;
  /** Datos de facturación ya guardados; si están completos no se vuelven a pedir. */
  facturacion?: { cuit: string; condicionIva: string; domicilio: string; completa: boolean };
}) {
  const router = useRouter();
  const [contratando, setContratando] = useState<ClavePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Plan elegido a la espera de los datos fiscales.
  const [pendiente, setPendiente] = useState<ClavePlan | null>(null);
  const [datos, setDatos] = useState({
    cuit: facturacion?.cuit ?? "",
    condicionIva: facturacion?.condicionIva ?? "",
    domicilio: facturacion?.domicilio ?? "",
  });

  async function activar(clave: ClavePlan, conDatos: boolean) {
    setContratando(clave);
    setError(null);
    const res = await fetch("/api/suscripcion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: clave, ...(conDatos ? datos : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // 422 = falta completar los datos con los que se emite la factura.
      if (res.status === 422) setPendiente(clave);
      setError(data.error ?? "No se pudo activar el plan.");
      setContratando(null);
      return;
    }
    router.replace("/admin/inicio");
    router.refresh();
  }

  function elegir(clave: ClavePlan) {
    if (!facturacion?.completa) {
      setPendiente(clave);
      setError(null);
      return;
    }
    void activar(clave, false);
  }

  const vencida = estado.estado === "vencida";

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="text-center">
        {vencida ? (
          <p className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
            <AlertCircle className="h-3.5 w-3.5" />
            Se terminó tu prueba
          </p>
        ) : (
          <p className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
            <Clock className="h-3.5 w-3.5" />
            {estado.estado === "trial"
              ? `Te ${estado.diasRestantes === 1 ? "queda" : "quedan"} ${estado.diasRestantes} ${estado.diasRestantes === 1 ? "día" : "días"} de prueba`
              : `Tu plan sigue activo ${estado.diasRestantes} ${estado.diasRestantes === 1 ? "día" : "días"} más`}
          </p>
        )}

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {vencida ? "Elegí un plan para seguir" : "Planes"}
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted">
          {vencida
            ? "Tus datos están intactos. En cuanto actives un plan, volvés a entrar con todo donde lo dejaste."
            : "Podés contratar cuando quieras: los días de prueba que te quedan no se pierden."}
        </p>
      </header>

      {error && (
        <p className="mx-auto mt-6 max-w-md rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-center text-sm font-medium text-accent">
          {error}
        </p>
      )}

      {pendiente && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void activar(pendiente, true);
          }}
          className="mx-auto mt-8 max-w-xl rounded-2xl border border-border bg-surface p-5"
        >
          <h2 className="text-sm font-semibold text-foreground">
            Datos para la factura
          </h2>
          <p className="mt-1 text-sm text-muted">
            Los necesitamos para emitirte el comprobante del plan{" "}
            {PLANES.find((p) => p.clave === pendiente)?.nombre}.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="cuit" className="text-sm font-medium text-foreground">
                CUIT <span className="text-accent">*</span>
              </label>
              <input
                id="cuit"
                required
                inputMode="numeric"
                className={inputCls}
                placeholder="30-12345678-9"
                value={datos.cuit}
                onChange={(e) => setDatos((d) => ({ ...d, cuit: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="condicionIva"
                className="text-sm font-medium text-foreground"
              >
                Condición frente al IVA <span className="text-accent">*</span>
              </label>
              <select
                id="condicionIva"
                required
                className={inputCls}
                value={datos.condicionIva}
                onChange={(e) =>
                  setDatos((d) => ({ ...d, condicionIva: e.target.value }))
                }
              >
                <option value="">Seleccionar…</option>
                {CONDICIONES_IVA.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor="domicilio"
                className="text-sm font-medium text-foreground"
              >
                Domicilio fiscal <span className="text-accent">*</span>
              </label>
              <input
                id="domicilio"
                required
                className={inputCls}
                placeholder="Av. Siempre Viva 123, CABA"
                value={datos.domicilio}
                onChange={(e) =>
                  setDatos((d) => ({ ...d, domicilio: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={contratando !== null}
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
            >
              {contratando ? "Activando…" : "Confirmar y activar"}
            </button>
            <button
              type="button"
              onClick={() => setPendiente(null)}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent"
            >
              Elegir otro plan
            </button>
          </div>
        </form>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {PLANES.map((plan) => {
          const esActual = planActual === plan.clave;
          return (
            <section
              key={plan.clave}
              className={`flex flex-col rounded-2xl border bg-surface p-5 ${
                plan.destacado ? "border-accent shadow-sm" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-foreground">
                  {plan.nombre}
                </h2>
                {plan.destacado && (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                    Más elegido
                  </span>
                )}
              </div>

              <p className="mt-3">
                <span className="text-3xl font-semibold tabular-nums text-foreground">
                  {precioFormateado(plan.precio)}
                </span>
                <span className="text-sm text-muted"> / mes</span>
              </p>
              <p className="mt-1.5 text-sm text-muted">{plan.resumen}</p>

              <ul className="mt-4 flex-1 space-y-2">
                {plan.incluye.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    {item}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => elegir(plan.clave)}
                disabled={contratando !== null || esActual}
                className={`mt-5 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60 ${
                  plan.destacado
                    ? "bg-accent text-accent-foreground hover:opacity-90"
                    : "border border-border bg-surface text-foreground hover:border-accent"
                }`}
              >
                {esActual
                  ? "Tu plan actual"
                  : contratando === plan.clave
                    ? "Activando…"
                    : "Elegir este plan"}
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}
