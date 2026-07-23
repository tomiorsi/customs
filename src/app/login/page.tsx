"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock, User } from "lucide-react";
import { Brand } from "@/components/brand";
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
    <main className="relative flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Brand size="md" />
        </div>

        <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground">
          Ingresá a tu portal
        </h2>
        <p className="mt-1.5 text-center text-sm text-muted">
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
      </div>
    </main>
  );
}
