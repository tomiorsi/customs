"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, UserCog } from "lucide-react";

/**
 * Datos de acceso del equipo: usuario y contraseña.
 *
 * Los dos cambios piden la contraseña actual. Es el único freno real si
 * alguien se sienta frente a una sesión abierta.
 */

type Estado = { tipo: "ok" | "error"; msg: string } | null;

const INPUT =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

function Aviso({ estado }: { estado: Estado }) {
  if (!estado) return null;
  return (
    <p
      className={`rounded-lg px-3 py-2 text-xs font-medium ${
        estado.tipo === "ok"
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border border-accent/40 bg-accent-soft text-accent"
      }`}
    >
      {estado.msg}
    </p>
  );
}

export function CuentaForm({ usuarioActual }: { usuarioActual: string }) {
  const router = useRouter();

  const [usuario, setUsuario] = useState(usuarioActual);
  const [passUsuario, setPassUsuario] = useState("");
  const [estadoUsuario, setEstadoUsuario] = useState<Estado>(null);
  const [guardandoUsuario, setGuardandoUsuario] = useState(false);

  const [pass, setPass] = useState({ actual: "", nueva: "", confirmar: "" });
  const [estadoPass, setEstadoPass] = useState<Estado>(null);
  const [guardandoPass, setGuardandoPass] = useState(false);

  async function cambiarUsuario(e: React.FormEvent) {
    e.preventDefault();
    setEstadoUsuario(null);
    setGuardandoUsuario(true);
    try {
      const res = await fetch("/api/usuario/acceso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, actual: passUsuario }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEstadoUsuario({ tipo: "error", msg: data.error ?? "No se pudo cambiar." });
        return;
      }
      setEstadoUsuario({
        tipo: "ok",
        msg: `Listo. A partir de ahora entrás como «${data.usuario}».`,
      });
      setPassUsuario("");
      router.refresh();
    } catch {
      setEstadoUsuario({ tipo: "error", msg: "Error de conexión." });
    } finally {
      setGuardandoUsuario(false);
    }
  }

  async function cambiarPassword(e: React.FormEvent) {
    e.preventDefault();
    setEstadoPass(null);
    if (pass.nueva !== pass.confirmar) {
      setEstadoPass({ tipo: "error", msg: "Las contraseñas nuevas no coinciden." });
      return;
    }
    setGuardandoPass(true);
    try {
      const res = await fetch("/api/usuario/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actual: pass.actual, nueva: pass.nueva }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEstadoPass({ tipo: "error", msg: data.error ?? "No se pudo cambiar." });
        return;
      }
      setEstadoPass({ tipo: "ok", msg: "Contraseña actualizada." });
      setPass({ actual: "", nueva: "", confirmar: "" });
    } catch {
      setEstadoPass({ tipo: "error", msg: "Error de conexión." });
    } finally {
      setGuardandoPass(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        onSubmit={cambiarUsuario}
        className="space-y-4 rounded-xl border border-border bg-surface p-5"
      >
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <UserCog className="h-4 w-4 text-accent" />
            Usuario de acceso
          </h2>
          <p className="mt-1 text-xs text-muted">
            Con este nombre entrás al portal. Hoy es{" "}
            <strong className="text-foreground">{usuarioActual}</strong>.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="usuario" className="text-sm font-medium text-foreground">
            Nuevo usuario
          </label>
          <input
            id="usuario"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoCapitalize="none"
            autoComplete="username"
            className={INPUT}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="pass-usuario"
            className="text-sm font-medium text-foreground"
          >
            Tu contraseña actual
          </label>
          <input
            id="pass-usuario"
            type="password"
            autoComplete="current-password"
            value={passUsuario}
            onChange={(e) => setPassUsuario(e.target.value)}
            className={INPUT}
          />
        </div>

        <Aviso estado={estadoUsuario} />

        <button
          type="submit"
          disabled={guardandoUsuario || !usuario.trim() || !passUsuario}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {guardandoUsuario && <Loader2 className="h-4 w-4 animate-spin" />}
          Cambiar usuario
        </button>
      </form>

      <form
        onSubmit={cambiarPassword}
        className="space-y-4 rounded-xl border border-border bg-surface p-5"
      >
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <KeyRound className="h-4 w-4 text-accent" />
            Contraseña
          </h2>
          <p className="mt-1 text-xs text-muted">
            Mínimo 6 caracteres. Usá una que no repitas en otros servicios.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="actual" className="text-sm font-medium text-foreground">
            Contraseña actual
          </label>
          <input
            id="actual"
            type="password"
            autoComplete="current-password"
            value={pass.actual}
            onChange={(e) => setPass((p) => ({ ...p, actual: e.target.value }))}
            className={INPUT}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="nueva" className="text-sm font-medium text-foreground">
            Nueva contraseña
          </label>
          <input
            id="nueva"
            type="password"
            autoComplete="new-password"
            value={pass.nueva}
            onChange={(e) => setPass((p) => ({ ...p, nueva: e.target.value }))}
            className={INPUT}
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="confirmar"
            className="text-sm font-medium text-foreground"
          >
            Repetir la nueva
          </label>
          <input
            id="confirmar"
            type="password"
            autoComplete="new-password"
            value={pass.confirmar}
            onChange={(e) => setPass((p) => ({ ...p, confirmar: e.target.value }))}
            className={INPUT}
          />
        </div>

        <Aviso estado={estadoPass} />

        <button
          type="submit"
          disabled={
            guardandoPass || !pass.actual || !pass.nueva || !pass.confirmar
          }
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {guardandoPass && <Loader2 className="h-4 w-4 animate-spin" />}
          Cambiar contraseña
        </button>
      </form>
    </div>
  );
}
