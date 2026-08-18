"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, Loader2, UserCog } from "lucide-react";

/**
 * Datos de acceso del equipo: usuario y contraseña.
 *
 * Los dos cambios piden la contraseña actual. Es el único freno real si alguien
 * se sienta frente a una sesión abierta.
 *
 * Los formularios están plegados: son cosas que se tocan una vez cada mucho, y
 * abiertos ocupaban toda la pantalla tapando el resto de la configuración.
 */

type Estado = { tipo: "ok" | "error"; msg: string } | null;

const INPUT =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

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

/** Campo de contraseña con ojo para revelar lo escrito. */
function CampoSecreto({
  id,
  label,
  valor,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          required
          type={ver ? "text" : "password"}
          autoComplete="off"
          className={`${INPUT} pr-10`}
          placeholder={placeholder}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setVer((v) => !v)}
          aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={ver}
          className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export function CuentaForm({ usuarioActual }: { usuarioActual: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<"usuario" | "password" | null>(null);

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
      setAbierto(null);
    } catch {
      setEstadoPass({ tipo: "error", msg: "Error de conexión." });
    } finally {
      setGuardandoPass(false);
    }
  }

  const alternar = (cual: "usuario" | "password") =>
    setAbierto((a) => (a === cual ? null : cual));

  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-surface">
      {/* Usuario */}
      <div className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <UserCog className="h-4 w-4 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-medium text-foreground">Usuario de acceso</p>
              <p className="text-xs text-muted">{usuarioActual}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => alternar("usuario")}
            aria-expanded={abierto === "usuario"}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {abierto === "usuario" ? "Cancelar" : "Cambiar"}
          </button>
        </div>

        {abierto === "usuario" && (
          <form onSubmit={cambiarUsuario} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="usuario" className="text-xs font-medium text-muted">
                  Nuevo usuario
                </label>
                <input
                  id="usuario"
                  required
                  className={INPUT}
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                />
              </div>
              <CampoSecreto
                id="pass-usuario"
                label="Tu contraseña actual"
                valor={passUsuario}
                onChange={setPassUsuario}
              />
            </div>
            <Aviso estado={estadoUsuario} />
            <button
              type="submit"
              disabled={guardandoUsuario}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
            >
              {guardandoUsuario && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar usuario
            </button>
          </form>
        )}
      </div>

      {/* Contraseña */}
      <div className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <KeyRound className="h-4 w-4 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-medium text-foreground">Contraseña</p>
              <p className="text-xs text-muted">
                Mínimo 6 caracteres. Usá una que no repitas en otros servicios.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => alternar("password")}
            aria-expanded={abierto === "password"}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {abierto === "password" ? "Cancelar" : "Cambiar"}
          </button>
        </div>

        {abierto === "password" && (
          <form onSubmit={cambiarPassword} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <CampoSecreto
                id="pass-actual"
                label="Actual"
                valor={pass.actual}
                onChange={(v) => setPass((p) => ({ ...p, actual: v }))}
              />
              <CampoSecreto
                id="pass-nueva"
                label="Nueva"
                valor={pass.nueva}
                onChange={(v) => setPass((p) => ({ ...p, nueva: v }))}
                placeholder="Mínimo 6"
              />
              <CampoSecreto
                id="pass-confirmar"
                label="Repetir la nueva"
                valor={pass.confirmar}
                onChange={(v) => setPass((p) => ({ ...p, confirmar: v }))}
              />
            </div>
            <Aviso estado={estadoPass} />
            <button
              type="submit"
              disabled={guardandoPass}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60"
            >
              {guardandoPass && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar contraseña
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
