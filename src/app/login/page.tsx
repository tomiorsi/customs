"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock, Plane, Ship, Truck, User } from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { loginRequest } from "@/lib/auth-client";
import { landingPath } from "@/lib/roles";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await loginRequest({ identifier, password });
    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }
    router.replace(landingPath(res.user.role));
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Panel de marca / comercio exterior */}
      <section className="relative hidden overflow-hidden bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <Brand size="lg" />

        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
            El despacho de tus operaciones,
            <span className="text-accent"> en un solo lugar.</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Documentación, seguimiento y costeo para importadores y
            exportadores. Sin WhatsApp, sin carpetas sueltas, sin perder el hilo
            de cada operación.
          </p>

          <div className="mt-8 flex items-center gap-6 text-muted">
            <div className="flex items-center gap-2 text-sm">
              <Ship className="h-5 w-5 text-accent" /> Marítima
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Plane className="h-5 w-5 text-accent" /> Aérea
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Truck className="h-5 w-5 text-accent" /> Terrestre
            </div>
          </div>
        </div>

        <p className="relative text-xs text-muted">
          Estudio de Despachantes de Aduana · Argentina
        </p>
      </section>

      {/* Formulario */}
      <section className="relative flex items-center justify-center px-6 py-12">
        <div className="absolute right-6 top-6">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Brand size="md" />
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Ingresá a tu portal
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            Accedé para gestionar tus operaciones y documentación.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="identifier"
                className="text-sm font-medium text-foreground"
              >
                Email o usuario
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
                <input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="tucorreo@empresa.com"
                  className="w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="text-sm font-medium text-foreground"
              >
                Contraseña
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-xs font-medium text-accent">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
            >
              {loading ? "Ingresando…" : "Ingresar"}
              {!loading && (
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            ¿Tu empresa todavía no tiene cuenta?{" "}
            <Link href="/registro" className="font-medium text-accent hover:underline">
              Registrate
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
