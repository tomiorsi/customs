"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Trash2,
  UserCog,
  UserPlus,
  X,
} from "lucide-react";

type Operador = {
  id: string;
  nombre: string | null;
  username: string | null;
  email: string | null;
};

type ClienteAcceso = {
  id: string;
  company_name: string | null;
  email: string | null;
  cuit: string | null;
  /** true si ya tiene acceso (login) al portal. */
  tieneAcceso?: boolean;
};

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

/** Campo de contraseña con botón (ojo) para ver/ocultar lo que se escribió. */
function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        type={ver ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoCapitalize="none"
        autoComplete="new-password"
        className={`${inputCls} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        aria-label={ver ? "Ocultar contraseña" : "Ver contraseña"}
        title={ver ? "Ocultar" : "Ver"}
        style={{
          position: "absolute",
          right: "0.5rem",
          top: "50%",
          transform: "translateY(-50%)",
        }}
        className="rounded-md p-1 text-muted transition-colors hover:text-foreground"
      >
        {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function EquipoAdmin({
  operadores,
  clientes = [],
}: {
  operadores: Operador[];
  clientes?: ClienteAcceso[];
}) {
  const router = useRouter();
  // Tipo de cuenta a crear: empleado (subadmin) o acceso de cliente.
  const [tipoCuenta, setTipoCuenta] = useState<"empleado" | "cliente">("empleado");
  const [form, setForm] = useState({
    nombre: "",
    username: "",
    email: "",
    password: "",
  });
  const [cliForm, setCliForm] = useState({ clienteId: "", email: "", password: "" });
  const [cliError, setCliError] = useState<string | null>(null);
  const [cliOk, setCliOk] = useState<string | null>(null);
  const [creandoCli, setCreandoCli] = useState(false);
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

  function setCli<K extends keyof typeof cliForm>(k: K, v: string) {
    setCliForm((f) => ({ ...f, [k]: v }));
  }

  async function darAcceso(e: React.FormEvent) {
    e.preventDefault();
    setCliError(null);
    setCliOk(null);
    if (!cliForm.clienteId) {
      setCliError("Elegí el cliente.");
      return;
    }
    setCreandoCli(true);
    try {
      const res = await fetch("/api/admin/clientes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cliForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCliError(data.error ?? "No se pudo crear el acceso.");
        return;
      }
      setCliOk("Acceso creado. Ya podés entregarle el email y la contraseña al cliente.");
      setCliForm({ clienteId: "", email: "", password: "" });
      router.refresh();
    } catch {
      setCliError("Error de conexión.");
    } finally {
      setCreandoCli(false);
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

  // ── Clientes con acceso: editar credenciales / revocar acceso ──
  const clientesConAcceso = clientes.filter((c) => c.tieneAcceso);
  const [editandoCliId, setEditandoCliId] = useState<string | null>(null);
  const [cliEdit, setCliEdit] = useState({ email: "", password: "" });
  const [cliEditError, setCliEditError] = useState<string | null>(null);
  const [guardandoCliAcc, setGuardandoCliAcc] = useState(false);
  const [confirmarQuitarCli, setConfirmarQuitarCli] = useState<string | null>(null);
  const [quitandoCli, setQuitandoCli] = useState<string | null>(null);

  function abrirEdicionCliente(c: ClienteAcceso) {
    setCliEditError(null);
    if (editandoCliId === c.id) {
      setEditandoCliId(null);
      return;
    }
    setEditandoCliId(c.id);
    setCliEdit({ email: c.email ?? "", password: "" });
  }

  async function guardarClienteAcceso(e: React.FormEvent) {
    e.preventDefault();
    if (!editandoCliId) return;
    setCliEditError(null);
    setGuardandoCliAcc(true);
    try {
      const res = await fetch("/api/admin/clientes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId: editandoCliId,
          email: cliEdit.email,
          password: cliEdit.password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCliEditError(data.error ?? "No se pudo guardar.");
        return;
      }
      setEditandoCliId(null);
      router.refresh();
    } catch {
      setCliEditError("Error de conexión.");
    } finally {
      setGuardandoCliAcc(false);
    }
  }

  async function quitarAcceso(id: string) {
    setQuitandoCli(id);
    try {
      const res = await fetch("/api/admin/clientes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId: id }),
      });
      if (res.ok) router.refresh();
    } finally {
      setQuitandoCli(null);
      setConfirmarQuitarCli(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <div className="h-fit space-y-4 rounded-xl border border-border bg-surface p-6">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
          {(["empleado", "cliente"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipoCuenta(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tipoCuenta === t
                  ? "bg-surface text-accent shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t === "empleado" ? "Empleado" : "Acceso de cliente"}
            </button>
          ))}
        </div>

        {tipoCuenta === "empleado" ? (
          <form onSubmit={crear} className="space-y-4">
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
              <PasswordInput
                placeholder="Contraseña inicial"
                value={form.password}
                onChange={(v) => set("password", v)}
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
        ) : (
          <form onSubmit={darAcceso} className="space-y-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <UserPlus className="h-4 w-4 text-accent" />
              Crear acceso de cliente
            </p>
            <p className="text-xs text-muted">
              Elegí el cliente y definí su email y contraseña de ingreso para
              entregárselos. El cliente debe existir en la pestaña Clientes.
            </p>
            <div className="space-y-3">
              <select
                className={inputCls}
                value={cliForm.clienteId}
                onChange={(e) => setCli("clienteId", e.target.value)}
              >
                <option value="">Elegí un cliente…</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name?.trim() || c.email || c.cuit || c.id}
                    {c.cuit ? ` · ${c.cuit}` : ""}
                  </option>
                ))}
              </select>
              <input
                className={inputCls}
                type="email"
                placeholder="Email de ingreso"
                value={cliForm.email}
                onChange={(e) => setCli("email", e.target.value)}
                autoCapitalize="none"
              />
              <PasswordInput
                placeholder="Contraseña (mín. 6 caracteres)"
                value={cliForm.password}
                onChange={(v) => setCli("password", v)}
              />
            </div>
            {cliError && <p className="text-sm text-red-500">{cliError}</p>}
            {cliOk && <p className="text-sm text-emerald-600 dark:text-emerald-400">{cliOk}</p>}
            {clientes.length === 0 && (
              <p className="text-xs text-muted">
                No hay clientes cargados. Creá uno desde la pestaña Clientes.
              </p>
            )}
            <button
              type="submit"
              disabled={creandoCli}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90 disabled:opacity-60"
            >
              {creandoCli ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Crear acceso
            </button>
          </form>
        )}
      </div>

      <div className="space-y-6">
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
                      <PasswordInput
                        placeholder="Nueva contraseña (dejar vacío para no cambiarla)"
                        value={editForm.password}
                        onChange={(v) => setEdit("password", v)}
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

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Clientes con acceso ({clientesConAcceso.length})
          </h2>
        </div>
        {clientesConAcceso.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-accent">
              <UserPlus className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-medium text-foreground">
              Todavía ningún cliente tiene acceso
            </p>
            <p className="mt-1 max-w-xs text-xs text-muted">
              Creá un acceso desde la pestaña «Acceso de cliente» para que aparezca acá.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {clientesConAcceso.map((c) => {
              const abierto = editandoCliId === c.id;
              return (
                <li key={c.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => abrirEdicionCliente(c)}
                      className="group min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-accent">
                        {c.company_name?.trim() || c.email || c.cuit || c.id}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {c.email ?? "Sin email de ingreso"}
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => abrirEdicionCliente(c)}
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
                      {confirmarQuitarCli === c.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => quitarAcceso(c.id)}
                            disabled={quitandoCli === c.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/20 disabled:opacity-60 dark:text-red-400"
                          >
                            {quitandoCli === c.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            Sí, quitar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmarQuitarCli(null)}
                            disabled={quitandoCli === c.id}
                            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground disabled:opacity-60"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmarQuitarCli(c.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Quitar acceso
                        </button>
                      )}
                    </div>
                  </div>

                  {abierto && (
                    <form
                      onSubmit={guardarClienteAcceso}
                      className="mt-3 space-y-3 rounded-lg border border-border bg-surface-2/40 p-4"
                    >
                      <input
                        className={inputCls}
                        type="email"
                        placeholder="Email de ingreso"
                        value={cliEdit.email}
                        onChange={(e) =>
                          setCliEdit((f) => ({ ...f, email: e.target.value }))
                        }
                        autoCapitalize="none"
                      />
                      <PasswordInput
                        placeholder="Nueva contraseña (mín. 6 caracteres)"
                        value={cliEdit.password}
                        onChange={(v) =>
                          setCliEdit((f) => ({ ...f, password: v }))
                        }
                      />
                      {cliEditError && (
                        <p className="text-sm text-red-500">{cliEditError}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={guardandoCliAcc}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90 disabled:opacity-60"
                        >
                          {guardandoCliAcc ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Guardar credenciales
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditandoCliId(null)}
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
    </div>
  );
}
