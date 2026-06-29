"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Trash2, UserCog, UserPlus, X } from "lucide-react";

type Operador = {
  id: string;
  nombre: string | null;
  username: string | null;
  email: string | null;
};

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

export function EquipoAdmin({ operadores }: { operadores: Operador[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    nombre: "",
    username: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  // Empleado a punto de quitarse (pide confirmación antes de borrar).
  const [confirmarBorrar, setConfirmarBorrar] = useState<string | null>(null);

  // Edición en línea de un empleado existente.
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    nombre: "",
    username: "",
    email: "",
    password: "",
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function setEdit<K extends keyof typeof editForm>(k: K, v: string) {
    setEditForm((f) => ({ ...f, [k]: v }));
  }

  function abrirEdicion(o: Operador) {
    setEditError(null);
    if (editandoId === o.id) {
      setEditandoId(null);
      return;
    }
    setEditandoId(o.id);
    setEditForm({
      nombre: o.nombre ?? "",
      username: o.username ?? "",
      email: o.email ?? "",
      password: "",
    });
  }

  async function guardarEdicion(e: React.FormEvent) {
    e.preventDefault();
    if (!editandoId) return;
    setEditError(null);
    setGuardando(true);
    try {
      const res = await fetch("/api/admin/equipo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editandoId, ...editForm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(data.error ?? "No se pudo guardar.");
        return;
      }
      setEditandoId(null);
      router.refresh();
    } catch {
      setEditError("Error de conexión.");
    } finally {
      setGuardando(false);
    }
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreando(true);
    try {
      const res = await fetch("/api/admin/equipo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear el empleado.");
        return;
      }
      setForm({ nombre: "", username: "", email: "", password: "" });
      router.refresh();
    } catch {
      setError("Error de conexión.");
    } finally {
      setCreando(false);
    }
  }

  async function borrar(id: string) {
    setBorrando(id);
    try {
      const res = await fetch("/api/admin/equipo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBorrando(null);
      setConfirmarBorrar(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <form
        onSubmit={crear}
        className="h-fit space-y-4 rounded-xl border border-border bg-surface p-6"
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <UserPlus className="h-4 w-4 text-accent" />
          Agregar empleado
        </p>
        <div className="space-y-3">
          <input
            className={inputCls}
            placeholder="Nombre y apellido"
            value={form.nombre}
            onChange={(e) => set("nombre", e.target.value)}
          />
          <input
            className={inputCls}
            placeholder="Usuario (para ingresar)"
            value={form.username}
            onChange={(e) => set("username", e.target.value)}
            autoCapitalize="none"
          />
          <input
            className={inputCls}
            placeholder="Email (opcional)"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
          <input
            className={inputCls}
            type="text"
            placeholder="Contraseña inicial"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={creando}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90 disabled:opacity-60"
        >
          {creando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          Crear empleado
        </button>
      </form>

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Empleados ({operadores.length})
          </h2>
        </div>
        {operadores.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-accent">
              <UserCog className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-medium text-foreground">
              Todavía no cargaste empleados
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {operadores.map((o) => {
              const abierto = editandoId === o.id;
              return (
                <li key={o.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => abrirEdicion(o)}
                      className="group min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-accent">
                        {o.nombre ?? o.username}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {o.username}
                        {o.email ? ` · ${o.email}` : ""}
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => abrirEdicion(o)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          abierto
                            ? "bg-accent-soft text-accent"
                            : "text-muted hover:bg-surface-2 hover:text-foreground"
                        }`}
                      >
                        {abierto ? (
                          <X className="h-3.5 w-3.5" />
                        ) : (
                          <Pencil className="h-3.5 w-3.5" />
                        )}
                        {abierto ? "Cerrar" : "Editar"}
                      </button>
                      {confirmarBorrar === o.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => borrar(o.id)}
                            disabled={borrando === o.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/20 disabled:opacity-60 dark:text-red-400"
                          >
                            {borrando === o.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            Sí, quitar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmarBorrar(null)}
                            disabled={borrando === o.id}
                            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground disabled:opacity-60"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmarBorrar(o.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Quitar
                        </button>
                      )}
                    </div>
                  </div>

                  {abierto && (
                    <form
                      onSubmit={guardarEdicion}
                      className="mt-3 space-y-3 rounded-lg border border-border bg-surface-2/40 p-4"
                    >
                      <input
                        className={inputCls}
                        placeholder="Nombre y apellido"
                        value={editForm.nombre}
                        onChange={(e) => setEdit("nombre", e.target.value)}
                      />
                      <input
                        className={inputCls}
                        placeholder="Usuario (para ingresar)"
                        value={editForm.username}
                        onChange={(e) => setEdit("username", e.target.value)}
                        autoCapitalize="none"
                      />
                      <input
                        className={inputCls}
                        placeholder="Email (opcional)"
                        value={editForm.email}
                        onChange={(e) => setEdit("email", e.target.value)}
                      />
                      <input
                        className={inputCls}
                        type="text"
                        placeholder="Nueva contraseña (dejar vacío para no cambiarla)"
                        value={editForm.password}
                        onChange={(e) => setEdit("password", e.target.value)}
                      />
                      {editError && (
                        <p className="text-sm text-red-500">{editError}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={guardando}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90 disabled:opacity-60"
                        >
                          {guardando ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Guardar cambios
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditandoId(null)}
                          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
