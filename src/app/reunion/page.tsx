"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarCheck, CheckCircle2, Loader2 } from "lucide-react";
import { Brand } from "@/components/brand";

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

const VACIO = {
  nombre: "",
  email: "",
  telefono: "",
  razonSocial: "",
  cuit: "",
  registroImportador: "si",
  antiguedad: "establecida",
  titularidad: "propia",
  rubro: "",
  pais: "",
  detalleProducto: "",
  proveedor: "",
  cifOperacion: "",
  volumenAnual: "",
  financiacion: "propio",
  yaImporto: "si",
  comoConocio: "",
  documentacion: "si",
  motivoCambio: "",
  web: "",
};

export default function ReunionPage() {
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listo, setListo] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/reunion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
    } | null;
    setLoading(false);
    if (!res.ok || !data?.ok) {
      setError(data?.error ?? "No pudimos enviar el formulario. Probá de nuevo.");
      return;
    }
    setListo(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (listo) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-md text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">
            ¡Recibimos tus datos!
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Revisamos tu operación y te escribimos para coordinar la reunión.
            Si encaja con lo que trabajamos, habilitamos tu cuenta.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/50"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
          >
            <ArrowLeft className="h-4 w-4" />
            Inicio
          </Link>
          <Brand size="sm" />
        </div>

        <span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
          <CalendarCheck className="h-3.5 w-3.5" />
          Reservá una reunión
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
          Contanos de tu operación
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Son unas pocas preguntas para entender tu operación. Si encaja,
          coordinamos una videollamada y habilitamos tu cuenta.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-8 space-y-5 rounded-2xl border border-border bg-surface p-6"
        >
          {/* Contacto */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Nombre y apellido" requerido>
              <input
                className={inputCls}
                value={form.nombre}
                onChange={(e) => set("nombre", e.target.value)}
                required
              />
            </Campo>
            <Campo label="Teléfono" requerido>
              <input
                className={inputCls}
                value={form.telefono}
                onChange={(e) => set("telefono", e.target.value)}
                placeholder="+54 9 11 …"
                required
              />
            </Campo>
          </div>
          <Campo label="Email" requerido>
            <input
              type="email"
              className={inputCls}
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="tucorreo@empresa.com"
              required
            />
          </Campo>

          {/* Empresa */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Razón social / Nombre" requerido>
              <input
                className={inputCls}
                value={form.razonSocial}
                onChange={(e) => set("razonSocial", e.target.value)}
                required
              />
            </Campo>
            <Campo label="CUIT">
              <input
                className={inputCls}
                value={form.cuit}
                onChange={(e) => set("cuit", e.target.value)}
                placeholder="30-12345678-9"
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="¿Inscripto en el Registro de Importadores/Exportadores?">
              <select
                className={inputCls}
                value={form.registroImportador}
                onChange={(e) => set("registroImportador", e.target.value)}
              >
                <option value="si">Sí, ya estoy inscripto</option>
                <option value="tramite">En trámite</option>
                <option value="no">No, y no pienso inscribirme</option>
              </select>
            </Campo>
            <Campo label="¿Hace cuánto opera tu empresa?">
              <select
                className={inputCls}
                value={form.antiguedad}
                onChange={(e) => set("antiguedad", e.target.value)}
              >
                <option value="establecida">Más de 2 años</option>
                <option value="media">Entre 6 meses y 2 años</option>
                <option value="nueva">Menos de 6 meses</option>
              </select>
            </Campo>
          </div>

          <Campo label="¿La mercadería y la operación son de tu empresa?">
            <select
              className={inputCls}
              value={form.titularidad}
              onChange={(e) => set("titularidad", e.target.value)}
            >
              <option value="propia">Sí, importo a mi nombre para mi empresa</option>
              <option value="tercero">No, gestiono / opero para un tercero</option>
            </select>
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="¿Qué vas a importar/exportar?" requerido>
              <input
                className={inputCls}
                value={form.rubro}
                onChange={(e) => set("rubro", e.target.value)}
                placeholder="Ej: maquinaria, indumentaria, repuestos…"
                required
              />
            </Campo>
            <Campo label="País de origen / destino" requerido>
              <input
                className={inputCls}
                value={form.pais}
                onChange={(e) => set("pais", e.target.value)}
                placeholder="Ej: China, Brasil, EE.UU."
                required
              />
            </Campo>
          </div>

          <Campo label="Detalle del producto (marca, modelo, uso)">
            <input
              className={inputCls}
              value={form.detalleProducto}
              onChange={(e) => set("detalleProducto", e.target.value)}
              placeholder="Ej: notebooks Lenovo ThinkPad para reventa"
            />
          </Campo>

          <Campo label="Proveedor del exterior: ¿quién es y cómo lo conociste?">
            <input
              className={inputCls}
              value={form.proveedor}
              onChange={(e) => set("proveedor", e.target.value)}
              placeholder="Nombre del proveedor y cómo llegaste a él"
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Valor CIF estimado por operación (USD)">
              <input
                type="number"
                min={0}
                className={inputCls}
                value={form.cifOperacion}
                onChange={(e) => set("cifOperacion", e.target.value)}
                placeholder="15000"
              />
            </Campo>
            <Campo label="Volumen anual estimado (USD)">
              <input
                type="number"
                min={0}
                className={inputCls}
                value={form.volumenAnual}
                onChange={(e) => set("volumenAnual", e.target.value)}
                placeholder="30000"
              />
            </Campo>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="¿Cómo financiás la operación?">
              <select
                className={inputCls}
                value={form.financiacion}
                onChange={(e) => set("financiacion", e.target.value)}
              >
                <option value="propio">Capital propio</option>
                <option value="bancario">Financiamiento bancario</option>
                <option value="inversor">Inversor / tercero</option>
                <option value="otro">Otro</option>
              </select>
            </Campo>
            <Campo label="¿Ya importaste antes?">
              <select
                className={inputCls}
                value={form.yaImporto}
                onChange={(e) => set("yaImporto", e.target.value)}
              >
                <option value="si">Sí, tengo experiencia</option>
                <option value="no">No, sería mi primera vez</option>
              </select>
            </Campo>
          </div>

          <Campo label="¿Estás dispuesto a entregar documentación de respaldo?">
            <select
              className={inputCls}
              value={form.documentacion}
              onChange={(e) => set("documentacion", e.target.value)}
            >
              <option value="si">
                Sí (estatuto, DNI del representante legal, origen de fondos)
              </option>
              <option value="no">No</option>
            </select>
            <span className="mt-1 block text-xs text-muted">
              Es un requisito de compliance: trabajamos solo con operaciones que
              podemos respaldar documentalmente.
            </span>
          </Campo>

          <Campo label="¿Tenés despachante hoy? ¿Por qué buscás cambiar? (opcional)">
            <textarea
              className={`${inputCls} min-h-20 resize-y`}
              value={form.motivoCambio}
              onChange={(e) => set("motivoCambio", e.target.value)}
              placeholder="Contanos brevemente tu situación actual."
            />
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="¿Cómo nos conociste? (opcional)">
              <input
                className={inputCls}
                value={form.comoConocio}
                onChange={(e) => set("comoConocio", e.target.value)}
                placeholder="Recomendación, redes, búsqueda…"
              />
            </Campo>
            <Campo label="Web / redes / referencias (opcional)">
              <input
                className={inputCls}
                value={form.web}
                onChange={(e) => set("web", e.target.value)}
                placeholder="https://…"
              />
            </Campo>
          </div>

          {error && (
            <p className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Enviando…" : "Solicitar reunión"}
          </button>
        </form>
      </div>
    </main>
  );
}

function Campo({
  label,
  requerido,
  children,
}: {
  label: string;
  requerido?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">
        {label}
        {requerido && <span className="text-accent"> *</span>}
      </span>
      {children}
    </label>
  );
}
