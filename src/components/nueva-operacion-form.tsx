"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  FileText,
  Globe,
  Package,
  Plane,
  Ship,
  Truck,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";

const inputCls =
  "h-11 w-full rounded-lg border border-border bg-surface py-2.5 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
const labelCls = "text-xs font-medium text-foreground";
const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-[#fb923c] px-6 py-3 text-sm font-semibold text-accent-foreground shadow-[0_10px_30px_-12px_var(--ring)] transition-all hover:opacity-95 hover:shadow-[0_16px_44px_-12px_var(--ring)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-60";

type Tipo = "Importación" | "Exportación";
type Via = "maritima" | "aerea" | "terrestre";

const VIAS: { value: Via; label: string; icon: LucideIcon; desc: string }[] = [
  { value: "maritima", label: "Marítima", icon: Ship, desc: "Buque · BL" },
  { value: "aerea", label: "Aérea", icon: Plane, desc: "Avión · AWB" },
  { value: "terrestre", label: "Terrestre", icon: Truck, desc: "Camión · CRT" },
];

const TIPO_CARDS: { value: Tipo; icon: LucideIcon; desc: string }[] = [
  {
    value: "Importación",
    icon: Package,
    desc: "Comprás afuera y traés mercadería al país.",
  },
  {
    value: "Exportación",
    icon: Upload,
    desc: "Vendés y enviás mercadería al exterior.",
  },
];

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx";

/**
 * Sólo lo que el cliente sabe de memoria al avisar la operación, sin tener que
 * leer la documentación. Todo lo demás (peso, bultos, cantidades, valor, Incoterm,
 * NCM, aduana y valoración FOB/CIF) lo completa el estudio a partir de los papeles.
 */
const CAMPOS_INICIALES = {
  tipo: "",
  via: "",
  titulo: "",
  pais_origen: "",
  pais_destino: "",
  mercaderia: "",
  estado_merc: "",
  detalle: "",
};

type Campos = typeof CAMPOS_INICIALES;

function transporteLabel(via: string): string {
  switch (via) {
    case "maritima":
      return "Documento de transporte · BL (marítimo)";
    case "aerea":
      return "Documento de transporte · AWB / guía aérea";
    case "terrestre":
      return "Documento de transporte · CRT (terrestre)";
    default:
      return "Documento de transporte (BL / AWB / CRT)";
  }
}

/** Pista sobre el documento de transporte de cada vía (mismo flujo inicial). */
function transporteHint(via: string): string | undefined {
  switch (via) {
    case "maritima":
      return "Lo emite la naviera al embarcar. Es negociable (original a canjear o telex release).";
    case "aerea":
      return "Guía aérea: MAWB (de la aerolínea) o HAWB (del agente de carga). No negociable; llega al embarcar.";
    case "terrestre":
      return "CRT del transportista (Mercosur). En frontera se suma el MIC/DTA. No negociable.";
    default:
      return undefined;
  }
}

export function NuevaOperacionForm() {
  const router = useRouter();
  const [form, setForm] = useState<Campos>(CAMPOS_INICIALES);

  const [primeraVez, setPrimeraVez] = useState<"" | "si" | "no">("");
  const [pedidoCompra, setPedidoCompra] = useState<File | null>(null);
  const [proforma, setProforma] = useState<File | null>(null);
  const [factura, setFactura] = useState<File | null>(null);
  const [packing, setPacking] = useState<File | null>(null);
  const [transporte, setTransporte] = useState<File | null>(null);
  const [catalogo, setCatalogo] = useState<File | null>(null);
  const [otros, setOtros] = useState<File[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paso, setPaso] = useState<1 | 2 | 3>(1);

  function set<K extends keyof Campos>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setVia(value: string) {
    setForm((f) => ({ ...f, via: value }));
  }

  const esExpo = form.tipo === "Exportación";

  const totalDocs = useMemo(
    () =>
      [pedidoCompra, proforma, factura, packing, transporte, catalogo].filter(
        Boolean,
      ).length + otros.length,
    [pedidoCompra, proforma, factura, packing, transporte, catalogo, otros],
  );

  function irAPreview(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.tipo) {
      setError("Indicá si es una importación o una exportación.");
      return;
    }
    if (!form.titulo.trim()) {
      setError("Ponele un nombre a la operación para identificarla.");
      return;
    }
    if (!form.mercaderia.trim()) {
      setError("Contanos qué es la mercadería que vas a importar o exportar.");
      return;
    }
    if (!primeraVez) {
      setError("Indicanos si es la primera vez con este producto.");
      return;
    }

    setPaso(3);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function confirmar() {
    setError(null);

    if (!form.tipo) {
      setError("Indicá si es una importación o una exportación.");
      return;
    }
    if (!form.titulo.trim()) {
      setError("Ponele un nombre a la operación para identificarla.");
      return;
    }
    if (!form.mercaderia.trim()) {
      setError("Contanos qué es la mercadería que vas a importar o exportar.");
      return;
    }
    if (!primeraVez) {
      setError("Indicanos si es la primera vez con este producto.");
      return;
    }

    setLoading(true);
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) {
      if (v) fd.set(k, v);
    }
    if (primeraVez) fd.set("primera_vez", primeraVez);
    if (pedidoCompra) fd.set("pedido_compra", pedidoCompra);
    if (proforma) fd.set("proforma", proforma);
    if (factura) fd.set("factura_comercial", factura);
    if (packing) fd.set("packing_list", packing);
    if (transporte) fd.set("transporte", transporte);
    if (catalogo) fd.set("catalogo", catalogo);
    for (const f of otros) fd.append("otros", f);

    const res = await fetch("/api/operaciones", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "No se pudo crear la operación.");
      setLoading(false);
      return;
    }

    router.push("/inicio/operaciones");
    router.refresh();
  }

  function continuar() {
    if (!form.tipo) {
      setError("Elegí si es una importación o una exportación.");
      return;
    }
    if (!form.via) {
      setError("Elegí la vía de transporte.");
      return;
    }
    setError(null);
    setPaso(2);
  }

  // ── Paso 1: tipo y vía ──
  if (paso === 1) {
    return (
      <div className="space-y-6">
        <Link
          href="/inicio/operaciones"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a mis operaciones
        </Link>
        <Pasos actual={1} />

        <div className="space-y-5">
          <div>
            <span className={labelCls}>
              Tipo de operación <span className="text-accent">*</span>
            </span>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              {TIPO_CARDS.map(({ value, icon: Icon, desc }) => {
                const active = form.tipo === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set("tipo", value)}
                    className={`hover-lift group rounded-2xl border p-4 text-left sm:flex-1 ${
                      active
                        ? "border-accent/60 glow-accent bg-accent-soft"
                        : "glass border-border hover:border-accent/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                          active
                            ? "bg-gradient-to-br from-accent to-[#fb923c] text-accent-foreground shadow-[0_8px_20px_-8px_var(--ring)]"
                            : "bg-surface-2 text-accent"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {value}
                        </p>
                        <p className="text-xs text-muted">{desc}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className={labelCls}>
              Vía de transporte <span className="text-accent">*</span>
            </span>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              {VIAS.map(({ value, label, icon: Icon, desc }) => {
                const active = form.via === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setVia(active ? "" : value)}
                    className={`hover-lift group flex flex-col items-center gap-2 rounded-2xl border px-3 py-5 text-center sm:flex-1 ${
                      active
                        ? "border-accent/60 glow-accent bg-accent-soft"
                        : "glass border-border hover:border-accent/40"
                    }`}
                  >
                    <span
                      className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
                        active
                          ? "bg-gradient-to-br from-accent to-[#fb923c] text-accent-foreground shadow-[0_8px_20px_-8px_var(--ring)]"
                          : "bg-surface-2 text-accent"
                      }`}
                    >
                      <Icon className="h-6 w-6" />
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {label}
                    </span>
                    <span className="text-[11px] text-muted">{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={continuar}
            disabled={!form.tipo || !form.via}
            className={btnPrimary}
          >
            Continuar
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const viaLabel = VIAS.find((v) => v.value === form.via)?.label ?? "";

  // ── Paso 3: vista previa para confirmar (todavía no se guarda) ──
  if (paso === 3) {
    const general: PrevItem[] = [
      esExpo
        ? { label: "País de destino", value: form.pais_destino }
        : { label: "País de origen", value: form.pais_origen },
    ];

    const mercaderia: PrevItem[] = [
      { label: "Qué es", value: form.mercaderia },
      { label: "Estado", value: form.estado_merc },
    ];

    const docs = [
      pedidoCompra && {
        label: "Pedido / Orden de compra",
        name: pedidoCompra.name,
      },
      proforma && { label: "Factura proforma", name: proforma.name },
      factura && { label: "Factura comercial", name: factura.name },
      packing && { label: "Packing list", name: packing.name },
      transporte && {
        label: transporteLabel(form.via),
        name: transporte.name,
      },
      catalogo && { label: "Catálogo / ficha técnica", name: catalogo.name },
      ...otros.map((f) => ({ label: "Otro documento", name: f.name })),
    ].filter(Boolean) as { label: string; name: string }[];

    const ViaIcon = VIAS.find((v) => v.value === form.via)?.icon ?? Package;

    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setPaso(2)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent disabled:opacity-60"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a modificar
        </button>

        <Pasos actual={3} />

        {/* Tarjeta de vista previa */}
        <div className="neon-top overflow-hidden rounded-2xl border border-border bg-surface/80 backdrop-blur-sm">
          <div className="flex flex-wrap items-stretch justify-between gap-3 border-b border-border bg-surface-2/40 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent ring-1 ring-accent/20">
                <ViaIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-foreground sm:text-lg">
                  {form.titulo || "Operación sin título"}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                    {form.tipo}
                  </span>
                  {viaLabel && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                      {viaLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={confirmar}
              disabled={loading}
              className="flex shrink-0 grow-0 basis-auto items-center justify-center gap-2 self-stretch rounded-xl bg-gradient-to-r from-accent to-[#fb923c] px-6 py-2 text-sm font-semibold text-accent-foreground shadow-[0_8px_20px_-8px_var(--ring)] transition-all hover:opacity-95 disabled:opacity-60 max-sm:w-full"
            >
              {loading ? "Confirmando…" : "Confirmar operación"}
              {!loading && <Check className="h-4 w-4" />}
            </button>
          </div>

          <div className="space-y-5 px-5 py-5">
            <GrupoPrev titulo="General" items={general} />
            <GrupoPrev titulo="Mercadería" items={mercaderia} />

            {form.detalle && (
              <div className="rounded-xl border border-border bg-surface-2/40 px-4 py-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  Observaciones
                </p>
                <p className="mt-1 text-sm text-foreground">{form.detalle}</p>
              </div>
            )}

            <div>
              <div className="mb-2.5 flex items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                  Documentación
                </span>
                <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
              </div>
              {docs.length === 0 ? (
                <p className="text-xs text-muted">
                  No adjuntaste archivos. Podés enviarlos más adelante.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {docs.map((d, i) => (
                    <li
                      key={`${d.name}-${i}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2/50 px-3 py-1.5 text-xs font-medium text-foreground"
                    >
                      <FileText className="h-3.5 w-3.5 text-muted" />
                      {d.label}
                      <span className="text-muted">· {d.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={irAPreview} className="space-y-5">
      <Link
        href="/inicio/operaciones"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a mis operaciones
      </Link>
      <Pasos actual={2} />

      {/* Nombre de la operación */}
      <div className="neon-top rounded-2xl border border-border glass p-5 sm:p-6">
        <label className="text-sm font-semibold text-foreground">
          Nombre de la operación <span className="text-accent">*</span>
        </label>
        <p className="mt-0.5 text-xs text-muted">
          Poné un nombre para reconocerla fácil (lo elegís vos, no es un número).
        </p>
        <input
          className={`${inputCls} mt-2`}
          value={form.titulo}
          placeholder="Ej.: Repuestos de motor Brasil — marzo"
          onChange={(e) => set("titulo", e.target.value)}
        />
      </div>

      {/* 1 · Datos generales */}
      <Section
        icon={Globe}
        title="Datos generales"
        subtitle={
          esExpo
            ? "Hacia dónde va la mercadería."
            : "De dónde viene la mercadería."
        }
      >
        {esExpo ? (
          <Field
            className="sm:col-span-2 lg:col-span-3"
            label="País de destino"
            value={form.pais_destino}
            onChange={(v) => set("pais_destino", v)}
            placeholder="País de destino final de la mercadería"
            hint="Nos sirve para certificados de origen, preferencias y posibles restricciones."
          />
        ) : (
          <Field
            className="sm:col-span-2 lg:col-span-3"
            label="País de origen"
            value={form.pais_origen}
            onChange={(v) => set("pais_origen", v)}
            placeholder="De dónde viene la mercadería"
            hint="Nos sirve para certificados de origen, preferencias y posibles antidumping."
          />
        )}
      </Section>

      {/* 2 · Mercadería */}
      <Section
        icon={Boxes}
        title="Mercadería"
        subtitle="Contanos qué es. Cuanto más detalle, mejor la clasificamos."
      >
        <Field
          className="sm:col-span-2 lg:col-span-3"
          label="¿Qué es la mercadería?"
          value={form.mercaderia}
          onChange={(v) => set("mercaderia", v)}
          placeholder="Ej.: Repuestos de motor para maquinaria agrícola (material, uso, modelo…)"
          hint="Escribí lo que sepas del producto (material, para qué se usa, composición, modelo)."
        />

        <div className="space-y-3 sm:col-span-2 lg:col-span-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start sm:gap-8">
            <div className="space-y-2">
              <span className={labelCls}>Estado</span>
              <div className="flex gap-2">
                {["Nuevo", "Usado"].map((opt) => {
                  const active = form.estado_merc === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => set("estado_merc", active ? "" : opt)}
                      className={`rounded-xl border px-5 py-2.5 text-sm font-medium transition-colors ${
                        active
                          ? "border-accent/60 bg-accent-soft text-foreground glow-accent"
                          : "border-border bg-surface-2/30 text-muted hover:border-accent/40"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <span className={labelCls}>
                ¿Es la primera vez que {esExpo ? "exportás" : "importás"} este
                producto con nosotros?
              </span>
              <div className="flex gap-2">
                {([
                  ["si", "Sí"],
                  ["no", "No"],
                ] as const).map(([val, label]) => {
                  const active = primeraVez === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        setPrimeraVez(val);
                        if (val === "no") {
                          setCatalogo(null);
                        }
                      }}
                      className={`rounded-xl border px-5 py-2.5 text-sm font-medium transition-colors ${
                        active
                          ? "border-accent/60 bg-accent-soft text-foreground glow-accent"
                          : "border-border bg-surface-2/30 text-muted hover:border-accent/40"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {form.estado_merc === "Usado" && (
            <p className="rounded-lg border border-accent/30 bg-accent-soft/50 px-3 py-2 text-xs text-foreground">
              La mercadería usada tiene trámites y requisitos distintos a la
              nueva. Avisanos cualquier detalle y lo gestionamos.
            </p>
          )}

          {primeraVez === "si" && (
            <div className="space-y-3 pt-1">
              <div>
                <p className="mb-2 text-xs text-muted">
                  Como es la primera vez con este producto y no hay antecedentes,
                  el catálogo o ficha técnica nos ayuda a definir con exactitud la
                  nomenclatura. Es opcional: si lo tenés a mano, adjuntalo.
                </p>
                <FileField
                  label="Catálogo / ficha técnica del producto"
                  file={catalogo}
                  onChange={setCatalogo}
                  hint="Opcional · recomendado para clasificar mejor"
                />
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* 3 · Documentación */}
      <div className="neon-top rounded-2xl border border-border glass p-5 sm:p-6">
        <div className="mb-1 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-[#fb923c] text-accent-foreground shadow-[0_8px_20px_-8px_var(--ring)]">
            <FileText className="h-5 w-5" />
          </span>
          <div className="flex flex-1 items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Documentación
            </h2>
          </div>
        </div>
        <p className="mb-3 text-xs text-muted">
          Empezá por lo que casi seguro ya tenés: el{" "}
          <span className="font-medium text-foreground">
            pedido / orden de compra
          </span>{" "}
          o la{" "}
          <span className="font-medium text-foreground">factura proforma</span>.
          Con eso abrimos la carpeta; la forma de pago la leemos de ahí o de la
          factura comercial.
        </p>
        <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <FileField
            label="Pedido / Orden de compra"
            file={pedidoCompra}
            onChange={setPedidoCompra}
            hint="Lo más habitual de tener al arrancar."
          />
          <FileField
            label="Factura proforma"
            file={proforma}
            onChange={setProforma}
            hint="Sirve para abrir la carpeta si todavía no hay factura."
          />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <FileField
            label="Factura comercial"
            file={factura}
            onChange={setFactura}
            hint="Opcional · podés subirla después"
          />
          <FileField label="Packing list" file={packing} onChange={setPacking} />
          <FileField
            label={transporteLabel(form.via)}
            file={transporte}
            onChange={setTransporte}
            hint={transporteHint(form.via)}
          />
          <OtrosField files={otros} onChange={setOtros} />
        </div>

        {totalDocs > 0 && (
          <p className="mt-4 text-xs text-muted">
            {totalDocs} archivo{totalDocs === 1 ? "" : "s"} listo
            {totalDocs === 1 ? "" : "s"} para subir.
          </p>
        )}
      </div>

      {/* Observaciones */}
      <div className="neon-top rounded-2xl border border-border glass p-5 sm:p-6">
        <label className="text-sm font-semibold text-foreground">
          Observaciones
        </label>
        <textarea
          className={`${inputCls} mt-2 h-auto min-h-[80px] resize-y`}
          placeholder="Cualquier dato adicional para el despachante (condiciones especiales, urgencias, etc.)."
          value={form.detalle}
          onChange={(e) => set("detalle", e.target.value)}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => setPaso(1)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Atrás
        </button>
        <button type="submit" className={btnPrimary}>
          Revisar operación
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

function Pasos({ actual }: { actual: 1 | 2 | 3 }) {
  const items = [
    { n: 1 as const, label: "Tipo y vía" },
    { n: 2 as const, label: "Datos de la operación" },
    { n: 3 as const, label: "Revisar y confirmar" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      {items.map((it, i) => {
        const done = actual > it.n;
        const current = actual === it.n;
        return (
          <Fragment key={it.n}>
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  done || current
                    ? "bg-gradient-to-br from-accent to-[#fb923c] text-accent-foreground shadow-[0_6px_16px_-6px_var(--ring)]"
                    : "bg-surface-2 text-muted"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : it.n}
              </span>
              <span
                className={`text-xs font-medium ${
                  current ? "text-foreground" : "text-muted"
                }`}
              >
                {it.label}
              </span>
            </div>
            {i < items.length - 1 && (
              <div className="h-px w-5 bg-gradient-to-r from-accent/50 to-transparent sm:w-10" />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

/* ───────────────────────── helpers de UI ───────────────────────── */

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="neon-top rounded-2xl border border-border glass p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-[#fb923c] text-accent-foreground shadow-[0_8px_20px_-8px_var(--ring)]">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

function Hint({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="text-[11px] leading-snug text-muted">{text}</p>;
}

type PrevItem = { label: string; value: string | null; accent?: boolean };

function GrupoPrev({ titulo, items }: { titulo: string; items: PrevItem[] }) {
  const visibles = items.filter((i) => i.value);
  if (visibles.length === 0) return null;
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
          {titulo}
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      </div>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
        {visibles.map((i) => (
          <div key={i.label} className="min-w-0">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">
              {i.label}
            </dt>
            <dd
              className={`mt-0.5 text-sm ${
                i.accent
                  ? "font-semibold text-accent"
                  : "font-normal text-foreground"
              }`}
            >
              {i.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  className = "",
  inputMode,
  hint,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputMode?: "decimal" | "numeric";
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className={labelCls}>
        {label}
        {required && <span className="text-accent"> *</span>}
      </label>
      <input
        className={inputCls}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        onChange={(e) => onChange(e.target.value)}
      />
      <Hint text={hint} />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  className = "",
  allowEmpty = true,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  className?: string;
  allowEmpty?: boolean;
  hint?: string;
}) {
  return (
    <SelectFieldRaw
      label={label}
      value={value}
      onChange={onChange}
      options={options.map((o) => ({ value: o, label: o }))}
      className={className}
      allowEmpty={allowEmpty}
      hint={hint}
    />
  );
}

function SelectFieldRaw({
  label,
  value,
  onChange,
  options,
  className = "",
  allowEmpty = true,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  allowEmpty?: boolean;
  hint?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className={labelCls}>{label}</label>
      <select
        className={inputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {allowEmpty && <option value="">Seleccionar…</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Hint text={hint} />
    </div>
  );
}

function FileField({
  label,
  file,
  onChange,
  required = false,
  hint,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  required?: boolean;
  hint?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div
      className={`rounded-lg border bg-surface-2/40 p-3 ${
        required && !file ? "border-accent/50" : "border-border"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent">
          <FileText className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {label}
            {required && <span className="text-accent"> *</span>}
          </p>
          {file ? (
            <p className="truncate text-xs text-muted">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </p>
          ) : (
            <p className="truncate text-xs text-muted">
              {required
                ? "Obligatorio · adjuntá un archivo"
                : (hint ?? "Ningún archivo elegido")}
            </p>
          )}
        </div>
        {file ? (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              if (ref.current) ref.current.value = "";
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted transition-colors hover:border-accent hover:text-accent"
            aria-label="Quitar archivo"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
          >
            <Upload className="h-3.5 w-3.5" /> Subir
          </button>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function OtrosField({
  files,
  onChange,
}: {
  files: File[];
  onChange: (f: File[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-lg border border-dashed border-border bg-surface-2/40 p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
          <Upload className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            Otros documentos
          </p>
          <p className="truncate text-xs text-muted">
            Certificados, seguros, etc. (podés subir varios)
          </p>
        </div>
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
        >
          <Upload className="h-3.5 w-3.5" /> Agregar
        </button>
      </div>

      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 rounded-md bg-surface px-2.5 py-1.5 text-xs text-foreground"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="text-muted transition-colors hover:text-accent"
                aria-label="Quitar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={ref}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          const nuevos = Array.from(e.target.files ?? []);
          if (nuevos.length) onChange([...files, ...nuevos]);
          if (ref.current) ref.current.value = "";
        }}
      />
    </div>
  );
}
