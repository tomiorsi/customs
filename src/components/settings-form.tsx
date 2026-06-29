"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import type { PublicUser } from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-border bg-surface py-2.5 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

type Estado = { tipo: "ok" | "error"; msg: string } | null;

export function SettingsForm({ user }: { user: PublicUser }) {
  const router = useRouter();

  const [perfil, setPerfil] = useState({
    companyName: user.company_name ?? "",
    personType: user.person_type === "fisica" ? "fisica" : "juridica",
    cuit: user.cuit ?? "",
    ivaCondition: user.iva_condition ?? "",
    certExencion: user.cert_exencion === "si" ? "si" : "no",
    contactName: user.contact_name ?? "",
    phone: user.phone ?? "",
    address: user.address ?? "",
  });
  const esFisica = perfil.personType === "fisica";
  const [perfilEstado, setPerfilEstado] = useState<Estado>(null);
  const [savingPerfil, setSavingPerfil] = useState(false);

  const [pass, setPass] = useState({ actual: "", nueva: "", confirmar: "" });
  const [passEstado, setPassEstado] = useState<Estado>(null);
  const [savingPass, setSavingPass] = useState(false);

  function setP<K extends keyof typeof perfil>(key: K, value: string) {
    setPerfil((f) => ({ ...f, [key]: value }));
    setPerfilEstado(null);
  }

  async function guardarPerfil(e: React.FormEvent) {
    e.preventDefault();
    setSavingPerfil(true);
    setPerfilEstado(null);
    const res = await fetch("/api/usuario/perfil", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(perfil),
    });
    const data = await res.json().catch(() => ({}));
    setSavingPerfil(false);
    if (!res.ok) {
      setPerfilEstado({ tipo: "error", msg: data.error ?? "No se pudo guardar." });
      return;
    }
    setPerfilEstado({ tipo: "ok", msg: "Datos actualizados." });
    router.refresh();
  }

  async function guardarPass(e: React.FormEvent) {
    e.preventDefault();
    if (pass.nueva !== pass.confirmar) {
      setPassEstado({ tipo: "error", msg: "Las contraseñas nuevas no coinciden." });
      return;
    }
    setSavingPass(true);
    setPassEstado(null);
    const res = await fetch("/api/usuario/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actual: pass.actual, nueva: pass.nueva }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingPass(false);
    if (!res.ok) {
      setPassEstado({ tipo: "error", msg: data.error ?? "No se pudo cambiar." });
      return;
    }
    setPassEstado({ tipo: "ok", msg: "Contraseña actualizada." });
    setPass({ actual: "", nueva: "", confirmar: "" });
  }

  return (
    <div className="mt-8 space-y-5">
      {/* Datos fiscales y de despacho */}
      <form
        onSubmit={guardarPerfil}
        className="rounded-xl border border-border bg-surface p-5"
      >
        <h2 className="mb-4 text-sm font-semibold text-foreground">
          Datos fiscales y de despacho
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium text-foreground">
              {esFisica ? "Nombre y apellido" : "Razón social"}{" "}
              <span className="text-accent">*</span>
            </label>
            <input
              required
              className={inputCls}
              value={perfil.companyName}
              onChange={(e) => setP("companyName", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Tipo de persona
            </label>
            <select
              className={inputCls}
              value={perfil.personType}
              onChange={(e) => setP("personType", e.target.value)}
            >
              <option value="juridica">Persona jurídica</option>
              <option value="fisica">Persona física</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              CUIT{esFisica ? " / CUIL" : ""}
            </label>
            <input
              className={inputCls}
              placeholder={esFisica ? "20-12345678-9" : "30-12345678-9"}
              value={perfil.cuit}
              onChange={(e) => setP("cuit", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Condición IVA
            </label>
            <select
              className={inputCls}
              value={perfil.ivaCondition}
              onChange={(e) => setP("ivaCondition", e.target.value)}
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
              value={perfil.certExencion}
              onChange={(e) => setP("certExencion", e.target.value)}
            >
              <option value="no">No</option>
              <option value="si">Sí, vigente</option>
            </select>
            <p className="text-xs text-muted">
              El Certificado MiPyME (RG 5501/5807) o el de exclusión (RG
              5655/2025) eximen las percepciones de IVA y Ganancias al
              nacionalizar.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="submit"
            disabled={savingPerfil}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
          >
            {savingPerfil && <Loader2 className="h-4 w-4 animate-spin" />}
            {savingPerfil ? "Guardando…" : "Guardar cambios"}
          </button>
          {perfilEstado && (
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                perfilEstado.tipo === "ok" ? "text-emerald-600" : "text-accent"
              }`}
            >
              {perfilEstado.tipo === "ok" && <Check className="h-4 w-4" />}
              {perfilEstado.msg}
            </span>
          )}
        </div>
      </form>

      {/* Contacto */}
      <form
        onSubmit={guardarPerfil}
        className="rounded-xl border border-border bg-surface p-5"
      >
        <h2 className="mb-4 text-sm font-semibold text-foreground">Contacto</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Nombre de contacto
            </label>
            <input
              className={inputCls}
              value={perfil.contactName}
              onChange={(e) => setP("contactName", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Teléfono
            </label>
            <input
              className={inputCls}
              value={perfil.phone}
              onChange={(e) => setP("phone", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium text-foreground">
              Domicilio
            </label>
            <input
              className={inputCls}
              value={perfil.address}
              onChange={(e) => setP("address", e.target.value)}
            />
          </div>
        </div>
        <div className="mt-5">
          <button
            type="submit"
            disabled={savingPerfil}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
          >
            {savingPerfil && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar contacto
          </button>
        </div>
      </form>

      {/* Email (solo lectura) */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Email</h2>
        <p className="text-sm text-muted">
          {user.email ?? "—"}{" "}
          <span className="text-xs">
            (para cambiar el email, escribinos desde la operación)
          </span>
        </p>
      </div>

      {/* Seguridad */}
      <form
        onSubmit={guardarPass}
        className="rounded-xl border border-border bg-surface p-5"
      >
        <h2 className="mb-4 text-sm font-semibold text-foreground">
          Cambiar contraseña
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium text-foreground">
              Contraseña actual <span className="text-accent">*</span>
            </label>
            <input
              required
              type="password"
              autoComplete="current-password"
              className={inputCls}
              value={pass.actual}
              onChange={(e) => {
                setPass((p) => ({ ...p, actual: e.target.value }));
                setPassEstado(null);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Nueva contraseña <span className="text-accent">*</span>
            </label>
            <input
              required
              type="password"
              autoComplete="new-password"
              className={inputCls}
              placeholder="Mínimo 6 caracteres"
              value={pass.nueva}
              onChange={(e) => {
                setPass((p) => ({ ...p, nueva: e.target.value }));
                setPassEstado(null);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Repetir nueva contraseña <span className="text-accent">*</span>
            </label>
            <input
              required
              type="password"
              autoComplete="new-password"
              className={inputCls}
              value={pass.confirmar}
              onChange={(e) => {
                setPass((p) => ({ ...p, confirmar: e.target.value }));
                setPassEstado(null);
              }}
            />
          </div>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button
            type="submit"
            disabled={savingPass}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
          >
            {savingPass && <Loader2 className="h-4 w-4 animate-spin" />}
            {savingPass ? "Cambiando…" : "Cambiar contraseña"}
          </button>
          {passEstado && (
            <span
              className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                passEstado.tipo === "ok" ? "text-emerald-600" : "text-accent"
              }`}
            >
              {passEstado.tipo === "ok" && <Check className="h-4 w-4" />}
              {passEstado.msg}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
