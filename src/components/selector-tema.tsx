"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

/**
 * Claro / oscuro / el del sistema.
 *
 * La preferencia se guarda en el navegador, no en la cuenta: es una decisión
 * del dispositivo —de día en la oficina, de noche en el celular— y no algo que
 * deba viajar con el usuario a cualquier pantalla donde entre.
 *
 * El tema ya viene aplicado por el script del layout raíz; acá solo se cambia.
 * La fuente de verdad es `localStorage`, no un estado de React: así el valor
 * que se pinta es el mismo que aplicó ese script, y el servidor —que no tiene
 * `localStorage`— renderiza «sistema» sin desincronizar la hidratación.
 */

type Tema = "claro" | "oscuro" | "sistema";

const OPCIONES: { valor: Tema; label: string; icono: typeof Sun }[] = [
  { valor: "claro", label: "Claro", icono: Sun },
  { valor: "oscuro", label: "Oscuro", icono: Moon },
  { valor: "sistema", label: "Sistema", icono: Monitor },
];

const oyentes = new Set<() => void>();

function suscribir(alCambiar: () => void) {
  oyentes.add(alCambiar);
  // Otra pestaña que cambie el tema, y el sistema operativo mientras esté en
  // "sistema": los dos tienen que repintar el control.
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("storage", alCambiar);
  mq.addEventListener("change", alCambiar);
  return () => {
    oyentes.delete(alCambiar);
    window.removeEventListener("storage", alCambiar);
    mq.removeEventListener("change", alCambiar);
  };
}

function leerTema(): Tema {
  const guardado = localStorage.getItem("tema");
  return guardado === "claro" || guardado === "oscuro" ? guardado : "sistema";
}

function aplicar(tema: Tema) {
  const oscuro =
    tema === "oscuro" ||
    (tema === "sistema" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", oscuro);
}

export function SelectorTema() {
  const tema = useSyncExternalStore(suscribir, leerTema, () => "sistema" as Tema);

  function elegir(nuevo: Tema) {
    if (nuevo === "sistema") localStorage.removeItem("tema");
    else localStorage.setItem("tema", nuevo);
    aplicar(nuevo);
    // `storage` no dispara en la pestaña que escribe: se avisa a mano.
    oyentes.forEach((f) => f());
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema de la interfaz"
      className="inline-flex rounded-lg border border-border bg-surface-2/50 p-0.5"
    >
      {OPCIONES.map(({ valor, label, icono: Icono }) => {
        const activo = tema === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => elegir(valor)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
              activo
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Icono className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
