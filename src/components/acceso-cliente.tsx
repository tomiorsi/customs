"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, KeyRound, Loader2, X } from "lucide-react";

/**
 * Acceso del cliente al portal, desde la propia fila de Clientes.
 *
 * Un cliente con acceso entra y ve cómo van sus operaciones en tiempo real,
 * nada más. El mismo formulario crea el acceso y lo cambia después: son la
 * misma operación —fijar email y contraseña— y separarlas obligaba a recordar
 * cuál de las dos pantallas correspondía.
 */

const INPUT =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

export function AccesoCliente({
  clienteId,
  nombre,
  emailActual,
  tieneAcceso,
  onCerrar,
}: {
  clienteId: string;
  nombre: string;
  emailActual: string | null;
  tieneAcceso: boolean;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(emailActual ?? "");
  const [password, setPassword] = useState("");
  const [ver, setVer] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    const res = await fetch("/api/admin/clientes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clienteId, email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar el acceso.");
      setGuardando(false);
      return;
    }
    setOk(true);
    setGuardando(false);
    router.refresh();
  }

  async function quitar() {
    setGuardando(true);
    setError(null);
    const res = await fetch("/api/admin/clientes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: clienteId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo quitar el acceso.");
      setGuardando(false);
      return;
    }
    setGuardando(false);
    router.refresh();
    onCerrar();
  }

  if (ok) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Check className="h-4 w-4 text-accent" />
          Acceso listo para {nombre}
        </p>
        <div className="rounded-lg bg-surface-2/60 px-3 py-2 font-mono text-xs text-foreground">
          <p>{email}</p>
          <p>{password}</p>
        </div>
        <p className="text-xs text-muted">
          Pasale estos datos. Es la única vez que se muestra la contraseña.
        </p>
        <button
          type="button"
          onClick={onCerrar}
          className="rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90"
        >
          Listo
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={guardar}
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <KeyRound className="h-4 w-4 text-accent" />
          {tieneAcceso ? "Cambiar acceso" : "Dar acceso al portal"}
        </p>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="text-muted transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="text-xs text-muted">
        Con esto entra a ver sus operaciones en tiempo real. Nada más.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor={`em-${clienteId}`} className="text-xs font-medium text-muted">
            Email de ingreso
          </label>
          <input
            id={`em-${clienteId}`}
            required
            type="email"
            className={INPUT}
            placeholder="cliente@empresa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`pw-${clienteId}`} className="text-xs font-medium text-muted">
            {tieneAcceso ? "Nueva contraseña" : "Contraseña"}
          </label>
          <div className="relative">
            <input
              id={`pw-${clienteId}`}
              required
              type={ver ? "text" : "password"}
              autoComplete="new-password"
              className={`${INPUT} pr-10`}
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setVer((v) => !v)}
              aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted transition-colors hover:text-accent"
            >
              {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-xs font-medium text-accent">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={guardando}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {tieneAcceso ? "Guardar cambios" : "Crear acceso"}
        </button>
        {tieneAcceso && (
          <button
            type="button"
            onClick={quitar}
            disabled={guardando}
            className="rounded-lg border border-border px-3.5 py-2 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
          >
            Quitar acceso
          </button>
        )}
      </div>
    </form>
  );
}
