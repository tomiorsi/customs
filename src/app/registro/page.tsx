"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { signupRequest } from "@/lib/auth-client";

const inputCls =
  "w-full rounded-lg border border-border bg-surface py-2.5 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

export default function RegistroPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    companyName: "",
    personType: "juridica",
    cuit: "",
    ivaCondition: "",
    certExencion: "no",
    contactName: "",
    phone: "",
    address: "",
    email: "",
    password: "",
  });
  const esFisica = form.personType === "fisica";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signupRequest(form);
    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }
    router.replace("/inicio");
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex items-center">
          <Brand size="md" />
        </div>

        <Link
          href="/login"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al ingreso
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Creá tu cuenta
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Registrate como importador o exportador, seas empresa o monotributista.
          Vas a poder ver tus operaciones, subir documentación y seguir el estado
          de cada despacho.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">
              Datos fiscales
            </h2>

            <div className="mb-4 space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Tipo de persona <span className="text-accent">*</span>
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  {
                    value: "juridica",
                    titulo: "Persona jurídica",
                    sub: "Empresa (S.A., S.R.L., etc.)",
                  },
                  {
                    value: "fisica",
                    titulo: "Persona física",
                    sub: "Monotributista / responsable inscripto",
                  },
                ].map((opt) => {
                  const activo = form.personType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => set("personType", opt.value)}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        activo
                          ? "border-accent bg-accent-soft"
                          : "border-border bg-surface hover:border-accent/50"
                      }`}
                    >
                      <span className="block text-sm font-medium text-foreground">
                        {opt.titulo}
                      </span>
                      <span className="block text-xs text-muted">{opt.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium text-foreground">
                  {esFisica ? "Nombre y apellido" : "Razón social"}{" "}
                  <span className="text-accent">*</span>
                </label>
                <input
                  required
                  className={inputCls}
                  placeholder={
                    esFisica ? "Juan Pérez" : "Importadora XYZ S.A."
                  }
                  value={form.companyName}
                  onChange={(e) => set("companyName", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  CUIT{esFisica ? " / CUIL" : ""}
                </label>
                <input
                  className={inputCls}
                  placeholder={esFisica ? "20-12345678-9" : "30-12345678-9"}
                  value={form.cuit}
                  onChange={(e) => set("cuit", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Condición IVA
                </label>
                <select
                  className={inputCls}
                  value={form.ivaCondition}
                  onChange={(e) => set("ivaCondition", e.target.value)}
                >
                  <option value="">Seleccionar…</option>
                  <option>Responsable Inscripto</option>
                  <option>Monotributo</option>
                  <option>Exento</option>
                  <option>No Responsable</option>
                </select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium text-foreground">
                  ¿Tenés Certificado MiPyME o de exclusión vigente?
                </label>
                <select
                  className={inputCls}
                  value={form.certExencion}
                  onChange={(e) => set("certExencion", e.target.value)}
                >
                  <option value="no">No</option>
                  <option value="si">Sí, vigente</option>
                </select>
                <p className="text-xs text-muted">
                  El Certificado MiPyME (RG 5501/5807) o el de exclusión (RG
                  5655/2025) eximen las percepciones de IVA y Ganancias al
                  nacionalizar. Lo usamos para estimar tus costos con más
                  precisión.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">
              Contacto
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Nombre de contacto
                </label>
                <input
                  className={inputCls}
                  placeholder="Juan Pérez"
                  value={form.contactName}
                  onChange={(e) => set("contactName", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Teléfono
                </label>
                <input
                  className={inputCls}
                  placeholder="+54 11 5555-5555"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-sm font-medium text-foreground">
                  Domicilio
                </label>
                <input
                  className={inputCls}
                  placeholder="Av. Siempre Viva 123, CABA"
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
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
                <label className="text-sm font-medium text-foreground">
                  Contraseña <span className="text-accent">*</span>
                </label>
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  className={inputCls}
                  placeholder="Mínimo 6 caracteres"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                />
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
