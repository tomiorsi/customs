"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Loader2,
  XCircle,
} from "lucide-react";
import { TZ_AR } from "@/lib/fechas";

type Estado = "none" | "submitted" | "rejected";
type Paso = "form" | "slot" | "done" | "rejected";

const HORARIOS = [10, 11, 12, 15, 16, 17];

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

/** Próximos días hábiles (lun–vie) a partir de mañana. */
function diasHabiles(cantidad: number): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1); // desde mañana
  while (out.length < cantidad) {
    const dia = d.getDay();
    if (dia !== 0 && dia !== 6) {
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const label = d.toLocaleDateString("es-AR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        timeZone: TZ_AR,
      });
      out.push({ value, label });
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function SolicitudForm({
  estadoInicial,
  tieneSlot,
  defaults,
}: {
  estadoInicial: Estado;
  tieneSlot: boolean;
  defaults: { razonSocial: string; cuit: string };
}) {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>(
    estadoInicial === "submitted" ? (tieneSlot ? "done" : "slot") : "form",
  );
  const [error, setError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [form, setForm] = useState({
    razonSocial: defaults.razonSocial,
    cuit: defaults.cuit,
    registroImportador: "si",
    antiguedad: "establecida",
    titularidad: "propia",
    rubro: "",
    detalleProducto: "",
    pais: "",
    proveedor: "",
    cifOperacion: "",
    volumenAnual: "",
    financiacion: "propio",
    yaImporto: "si",
    comoConocio: "",
    motivoCambio: "",
    documentacion: "si",
    web: "",
  });

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function enviarFormulario(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/onboarding/solicitud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          cifOperacion: Number(form.cifOperacion) || 0,
          volumenAnual: Number(form.volumenAnual) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No pudimos enviar el formulario.");
        return;
      }
      if (data.status === "rejected") {
        setMotivo(data.motivo ?? null);
        setPaso("rejected");
      } else {
        setPaso("slot");
      }
    } catch {
      setError("Error de conexión. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (paso === "rejected") {
    return (
      <Resultado
        icon={<XCircle className="h-7 w-7" />}
        tono="danger"
        titulo="Por ahora no aplica"
        texto={
          motivo ??
          "Tras revisar tu solicitud, por ahora no es el perfil que podemos atender."
        }
      >
        <button
          type="button"
          onClick={() => {
            setMotivo(null);
            setPaso("form");
          }}
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-2"
        >
          <ClipboardList className="h-4 w-4" />
          Revisar mis respuestas
        </button>
      </Resultado>
    );
  }

  if (paso === "done") {
    return (
      <Resultado
        icon={<CheckCircle2 className="h-7 w-7" />}
        tono="accent"
        titulo="¡Listo! Recibimos tu solicitud"
        texto="Enviamos tu formulario y el horario propuesto al estudio. La videollamada queda sujeta a confirmación: si el perfil encaja, te confirmamos la llamada por mail; si no, vas a recibir un mail avisándote que por ahora no podemos avanzar."
      >
        <Link
          href="/inicio/operaciones"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90"
        >
          Volver a operaciones
        </Link>
      </Resultado>
    );
  }

  if (paso === "slot") {
    return (
      <SelectorSlot
        onListo={() => {
          setPaso("done");
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Calificá tu cuenta para operar
        </h1>
        <p className="mt-1 text-sm text-muted">
          Son unas pocas preguntas para entender tu operación. Si encaja,
          agendamos una videollamada y habilitamos tu cuenta.
        </p>
      </div>

      <form
        onSubmit={enviarFormulario}
        className="space-y-5 rounded-xl border border-border bg-surface p-6"
      >
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
          <Campo label="¿Estás inscripto en el Registro de Importadores/Exportadores?">
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
            <option value="tercero">
              No, gestiono / opero para un tercero
            </option>
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
        <p className="-mt-2 text-xs text-muted">
          Trabajamos operaciones desde USD 15.000 de CIF, o un volumen anual
          estimado desde USD 30.000.
        </p>

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

        <Campo label="¿Cómo nos conociste? (opcional)">
          <input
            className={inputCls}
            value={form.comoConocio}
            onChange={(e) => set("comoConocio", e.target.value)}
            placeholder="Recomendación de…, redes, búsqueda en internet…"
          />
        </Campo>

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

        <Campo label="Web / redes / referencias (opcional)">
          <input
            className={inputCls}
            value={form.web}
            onChange={(e) => set("web", e.target.value)}
            placeholder="https://…"
          />
        </Campo>

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <Link
            href="/inicio/operaciones"
            className="text-sm font-medium text-muted hover:text-foreground"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={enviando}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90 disabled:opacity-60"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar formulario
          </button>
        </div>
      </form>
    </div>
  );
}

function SelectorSlot({ onListo }: { onListo: () => void }) {
  const dias = useMemo(() => diasHabiles(10), []);
  const [fecha, setFecha] = useState<string | null>(null);
  const [hora, setHora] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reservando, setReservando] = useState(false);

  async function reservar() {
    if (!fecha || hora == null) return;
    setError(null);
    setReservando(true);
    try {
      const res = await fetch("/api/onboarding/reunion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha, hora }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No pudimos agendar el horario.");
        return;
      }
      onListo();
    } catch {
      setError("Error de conexión. Probá de nuevo.");
    } finally {
      setReservando(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          ¿Qué día y horario te queda bien?
        </h1>
        <p className="mt-1 text-sm text-muted">
          ¡Tu perfil encaja! Proponé un horario para la videollamada. Atendemos
          de lunes a viernes, de 10 a 12 y de 15 a 17 hs. El estudio te confirma
          la llamada por mail.
        </p>
      </div>

      <div className="space-y-6 rounded-xl border border-border bg-surface p-6">
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Elegí el día</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {dias.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setFecha(d.value)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm capitalize transition-colors ${
                  fecha === d.value
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border text-foreground hover:bg-surface-2"
                }`}
              >
                <CalendarClock className="h-4 w-4 shrink-0" />
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-foreground">
            Elegí el horario
          </p>
          <div className="flex flex-wrap gap-2">
            {HORARIOS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHora(h)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  hora === h
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border text-foreground hover:bg-surface-2"
                }`}
              >
                {String(h).padStart(2, "0")}:00 hs
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={reservar}
            disabled={!fecha || hora == null || reservando}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90 disabled:opacity-60"
          >
            {reservando && <Loader2 className="h-4 w-4 animate-spin" />}
            Solicitar videollamada
          </button>
        </div>
      </div>
    </div>
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
    <label className="flex h-full flex-col">
      <span className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
        {requerido && <span className="text-accent"> *</span>}
      </span>
      <div className="mt-auto">{children}</div>
    </label>
  );
}

function Resultado({
  icon,
  tono,
  titulo,
  texto,
  children,
}: {
  icon: React.ReactNode;
  tono: "accent" | "danger";
  titulo: string;
  texto: string;
  children: React.ReactNode;
}) {
  const colorIcono =
    tono === "danger" ? "bg-red-500/10 text-red-500" : "bg-surface-2 text-accent";
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface px-6 py-16 text-center">
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-2xl ${colorIcono}`}
        >
          {icon}
        </span>
        <p className="mt-4 text-lg font-semibold text-foreground">{titulo}</p>
        <p className="mt-1 max-w-md text-sm text-muted">{texto}</p>
        {children}
      </div>
    </div>
  );
}
