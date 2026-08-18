"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Mantiene la pantalla al día cuando varias personas del estudio trabajan a la
 * vez.
 *
 * El caso que resuelve: dos empleados con la lista de operaciones abierta. Uno
 * cambia una etapa y el otro sigue viendo la anterior — hasta que recarga a
 * mano, o peor, trabaja sobre un dato que ya no es cierto.
 *
 * Dos disparadores, ninguno costoso:
 * - Al volver a la pestaña. Es el momento en que alguien retoma después de un
 *   rato y cuando más probable es que algo haya cambiado.
 * - Cada `intervaloMs` mientras la pestaña está visible. Con la pestaña de
 *   fondo no se refresca: nadie está mirando y el pedido sería puro gasto.
 *
 * Es `router.refresh()`, no un `location.reload()`: Next vuelve a pedir los
 * datos del servidor y repinta, sin perder lo que el usuario tenga escrito en
 * un formulario abierto.
 */
export function RefrescoCompartido({ intervaloMs = 30000 }: { intervaloMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervaloMs);

    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, [router, intervaloMs]);

  return null;
}
