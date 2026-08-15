"use client";

import { Fragment, useMemo, useState } from "react";
import {
  AlertTriangle,
  Anchor,
  ChevronDown,
  History,
  MapPin,
  Search,
  Ship,
} from "lucide-react";
import {
  ETIQUETA_ESTADO,
  ETIQUETA_OPERACION,
  normalizarBusqueda,
  type Arribo,
  type EstadoBuque,
  type ListadoBuques,
} from "@/lib/buques/tipos";
import { formatearFechaAr } from "@/lib/fechas";

const ESTADO_CLASE: Record<EstadoBuque, string> = {
  esperado: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  arribado: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  operando: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  finalizado: "bg-surface-2 text-muted",
  cancelado: "bg-red-500/10 text-red-500",
  desconocido: "bg-surface-2 text-muted",
};

function fecha(iso: string | null): string {
  return iso ? formatearFechaAr(iso) : "—";
}

function toneladasAr(n: number | null): string | null {
  return n == null ? null : `${n.toLocaleString("es-AR")} t`;
}

/** Todo el texto por el que se puede encontrar un buque. */
function clavesBusqueda(a: Arribo): string {
  return normalizarBusqueda(
    [
      a.etiqueta,
      a.buque,
      a.viaje,
      a.terminal,
      a.puerto,
      a.linea,
      a.tipoCarga,
      a.producto,
      a.bandera,
      a.agencia,
      a.destino,
      a.ultimoPuerto,
      a.sitio,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

/** Fila expandida: el detalle completo que la fuente publica del buque. */
function Detalle({ a }: { a: Arribo }) {
  const campos: { label: string; valor: string | null }[] = [
    { label: "Buque", valor: a.buque },
    { label: "Viaje", valor: a.viaje },
    { label: "Puerto", valor: a.puerto },
    { label: "Terminal / sitio", valor: a.terminal ?? a.sitio },
    {
      label: "ETA",
      valor: a.eta ? `${fecha(a.eta)}${a.etaHora ? ` ${a.etaHora}` : ""}` : null,
    },
    { label: "ETD", valor: a.etd ? fecha(a.etd) : null },
    { label: "Cut-off", valor: a.cutoff },
    { label: "Forzoso", valor: a.forzoso ? fecha(a.forzoso) : null },
    { label: "Estado", valor: ETIQUETA_ESTADO[a.estado] },
    { label: "Operación", valor: ETIQUETA_OPERACION[a.operacion] },
    { label: "Línea marítima", valor: a.linea },
    { label: "Tipo de carga", valor: a.tipoCarga },
    { label: "Producto", valor: a.producto },
    { label: "Cantidad", valor: toneladasAr(a.toneladas) },
    { label: "Bandera", valor: a.bandera },
    { label: "Eslora", valor: a.eslora ? `${a.eslora} m` : null },
    { label: "Agencia marítima", valor: a.agencia },
    { label: "Destino", valor: a.destino },
    { label: "Último puerto", valor: a.ultimoPuerto },
  ].filter((c) => c.valor);

  return (
    <div className="space-y-3 border-t border-border bg-surface-2/50 px-5 py-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
        {campos.map((c) => (
          <div key={c.label}>
            <dt className="text-[11px] uppercase tracking-wide text-muted">
              {c.label}
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">{c.valor}</dd>
          </div>
        ))}
      </dl>
      {a.marineTrafficId && (
        <a
          href={`https://www.marinetraffic.com/en/ais/home/shipid:${a.marineTrafficId}`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
        >
          <MapPin className="h-3.5 w-3.5" />
          Ver posición en MarineTraffic
        </a>
      )}
    </div>
  );
}

const ESTADOS_TERMINADOS = new Set<EstadoBuque>(["finalizado", "cancelado"]);
const ESTADOS_EN_PUERTO = new Set<EstadoBuque>(["arribado", "operando"]);

/**
 * Una escala sigue importando mientras haya algo por hacer: el buque está en
 * puerto ahora, o todavía no llegó. Las terminadas ya operaron, y las que
 * quedaron con ETA vencida sin cerrarse son datos que la fuente nunca
 * actualizó — en ninguno de los dos casos hay carga que despachar.
 */
function sigueVigente(a: Arribo, hoy: string): boolean {
  if (ESTADOS_TERMINADOS.has(a.estado)) return false;
  if (ESTADOS_EN_PUERTO.has(a.estado)) return true;
  return !a.eta || a.eta >= hoy;
}

export function BuquesTabla({ inicial }: { inicial: ListadoBuques }) {
  const datos = inicial;
  const [q, setQ] = useState("");
  const [puerto, setPuerto] = useState("todos");
  const [abierto, setAbierto] = useState<string | null>(null);
  // Las escalas terminadas ya no requieren acción: se ocultan salvo pedido.
  const [verTerminados, setVerTerminados] = useState(false);

  const puertos = useMemo(
    () => [...new Set(datos.arribos.map((a) => a.puerto))].sort(),
    [datos.arribos],
  );

  // El índice se recalcula solo cuando cambian los datos, no en cada tecla.
  const indexados = useMemo(
    () => datos.arribos.map((a) => ({ a, clave: clavesBusqueda(a) })),
    [datos.arribos],
  );

  // La fecha viene del servidor: evita que cliente y servidor filtren distinto.
  const hoy = datos.consultado.slice(0, 10);

  const terminados = useMemo(
    () => datos.arribos.filter((a) => !sigueVigente(a, hoy)).length,
    [datos.arribos, hoy],
  );

  const filtrados = useMemo(() => {
    const tokens = normalizarBusqueda(q).split(" ").filter(Boolean);
    return indexados
      .filter(({ a }) => verTerminados || sigueVigente(a, hoy))
      .filter(({ a }) => puerto === "todos" || a.puerto === puerto)
      .filter(({ clave }) => tokens.every((t) => clave.includes(t)))
      .map(({ a }) => a);
  }, [indexados, q, puerto, verTerminados, hoy]);

  const conError = datos.fuentes.filter((f) => f.error);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar buque, terminal, producto o agencia…"
            className="w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          />
        </div>

        <select
          value={puerto}
          onChange={(e) => setPuerto(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <option value="todos">Todos los puertos</option>
          {puertos.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-3 sm:ml-auto">
          {terminados > 0 && (
            <button
              type="button"
              onClick={() => setVerTerminados((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                verTerminados
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-muted hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              <History className="h-4 w-4" />
              {verTerminados ? "Ocultar" : "Ver"} anteriores
            </button>
          )}
        </div>
      </div>

      {conError.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="space-y-0.5">
            {conError.map((f) => (
              <p key={f.id} className="text-foreground">
                <span className="font-medium">{f.nombre}</span> no respondió:{" "}
                <span className="text-muted">{f.error}</span>
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-accent">
              <Ship className="h-7 w-7" />
            </span>
            <p className="mt-4 text-sm font-medium text-foreground">
              {datos.arribos.length === 0
                ? "No se pudo traer el cronograma de ninguna fuente"
                : "Ningún buque coincide con la búsqueda"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Buque</th>
                  <th className="px-5 py-3 font-medium">Puerto / terminal</th>
                  <th className="px-5 py-3 font-medium">ETA</th>
                  <th className="px-5 py-3 font-medium">Carga</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium sr-only">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtrados.map((a) => {
                  const expandido = abierto === a.id;
                  const tons = toneladasAr(a.toneladas);
                  return (
                    <Fragment key={a.id}>
                      <tr
                        onClick={() => setAbierto(expandido ? null : a.id)}
                        className="cursor-pointer transition-colors hover:bg-surface-2"
                      >
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-foreground">{a.buque}</p>
                          {a.viaje && (
                            <p className="text-xs text-muted">Viaje {a.viaje}</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-foreground">{a.puerto}</p>
                          {a.terminal && (
                            <p className="text-xs text-muted">{a.terminal}</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="tabular-nums text-foreground">
                            {fecha(a.eta)}
                            {a.etaHora && (
                              <span className="text-muted"> {a.etaHora}</span>
                            )}
                          </p>
                          {a.forzoso && (
                            <p className="text-xs text-muted">
                              Forzoso {fecha(a.forzoso)}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="text-foreground">
                            {a.producto ??
                              a.tipoCarga ??
                              ETIQUETA_OPERACION[a.operacion]}
                          </p>
                          <p className="text-xs text-muted">
                            {[tons, a.linea].filter(Boolean).join(" · ") ||
                              ETIQUETA_OPERACION[a.operacion]}
                          </p>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_CLASE[a.estado]}`}
                          >
                            {ETIQUETA_ESTADO[a.estado]}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <ChevronDown
                            className={`inline h-4 w-4 text-muted transition-transform ${
                              expandido ? "rotate-180" : ""
                            }`}
                          />
                        </td>
                      </tr>
                      {expandido && (
                        <tr>
                          <td colSpan={6} className="p-0">
                            <Detalle a={a} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface px-5 py-4">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
          <Anchor className="h-3.5 w-3.5" />
          Fuentes
        </p>
        <ul className="mt-3 space-y-2.5">
          {datos.fuentes.map((f) => (
            <li key={f.id} className="text-sm">
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-foreground hover:text-accent"
              >
                {f.nombre}
              </a>
              <span className="text-muted">
                {" · "}
                {f.error
                  ? "sin respuesta"
                  : `${f.arribos.length} buques${
                      f.actualizado ? ` · actualizado ${f.actualizado}` : ""
                    }`}
              </span>
              <p className="text-xs text-muted">{f.alcance}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
