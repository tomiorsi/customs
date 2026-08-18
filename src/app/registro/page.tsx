"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Brand } from "@/components/brand";
import { signupRequest } from "@/lib/auth-client";

const inputCls =
  "w-full rounded-lg border border-border bg-surface py-2.5 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

export default function RegistroPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    companyName: "",
    cuit: "",
    email: "",
    password: "",
    passwordConfirm: "",
  });
  const [verPassword, setVerPassword] = useState(false);
  const [verPasswordConfirm, setVerPasswordConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.passwordConfirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    const res = await signupRequest(form);
    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }
    router.replace("/admin/inicio");
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          href="/login"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al ingreso
        </Link>

        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/" aria-label="Ir al inicio">
            <Brand size="md" />
          </Link>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
            Creá tu cuenta
          </h1>
        </div>
        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">
Tus datos
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Nombre o estudio{" "}
                  <span className="text-accent">*</span>
                </label>
                <input
                  required
                  className={inputCls}
                  placeholder="Estudio Pérez & Asoc."
                  value={form.companyName}
                  onChange={(e) => set("companyName", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  CUIT
                </label>
                <input
                  className={inputCls}
                  placeholder="30-12345678-9"
                  value={form.cuit}
                  onChange={(e) => set("cuit", e.target.value)}
                />
              </div>

            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">
              Acceso
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Email <span className="text-accent">*</span>
                </label>
                <input
                  required
                  type="email"
                  autoComplete="email"
                  className={inputCls}
                  placeholder="tucorreo@empresa.com"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-foreground"
                >
                  Contraseña <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <input
                    id="password"
                    required
                    type={verPassword ? "text" : "password"}
                    autoComplete="new-password"
                    className={`${inputCls} pr-11`}
                    placeholder="Mínimo 6 caracteres"
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setVerPassword((v) => !v)}
                    aria-label={
                      verPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                    aria-pressed={verPassword}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    {verPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label
                  htmlFor="passwordConfirm"
                  className="text-sm font-medium text-foreground"
                >
                  Repetí la contraseña <span className="text-accent">*</span>
                </label>
                <div className="relative">
                  <input
                    id="passwordConfirm"
                    required
                    type={verPasswordConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    className={`${inputCls} pr-11`}
                    placeholder="La misma de arriba"
                    value={form.passwordConfirm}
                    onChange={(e) => set("passwordConfirm", e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setVerPasswordConfirm((v) => !v)}
                    aria-label={
                      verPasswordConfirm
                        ? "Ocultar contraseña"
                        : "Mostrar contraseña"
                    }
                    aria-pressed={verPasswordConfirm}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    {verPasswordConfirm ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {form.passwordConfirm.length > 0 &&
                  form.password !== form.passwordConfirm && (
                    <p className="text-xs font-medium text-accent">
                      Las contraseñas no coinciden.
                    </p>
                  )}
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="group flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
          >
            {loading ? "Creando cuenta…" : "Crear cuenta"}
            {!loading && (
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
