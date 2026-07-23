"use client";

import { useEffect, useRef } from "react";
import { WORLD_DOTS, HUBS } from "@/components/landing/world-dots";

/**
 * Fondo del hero: mapamundi punteado con rutas comerciales animadas que
 * convergen en Buenos Aires (marítimas/aéreas abstractas). Canvas 2D liviano,
 * respeta prefers-reduced-motion y toma colores de las CSS vars del tema
 * (--map-dot para la tierra, acento naranja para las rutas).
 */
export function WorldRoutes({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let W = 0;
    let H = 0;
    let dotRGB = "120, 113, 108";
    const dotAlpha = 0.3;
    let rafId: number | null = null;

    const ACCENT = "249, 115, 22";
    const BA = HUBS.buenosAires;
    const DESTINOS = [
      HUBS.shanghai,
      HUBS.rotterdam,
      HUBS.miami,
      HUBS.dubai,
      HUBS.losAngeles,
    ];

    function readTheme() {
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue("--map-dot")
        .trim();
      if (value) dotRGB = value;
    }

    function resize() {
      if (!canvas) return;
      const parent = canvas.parentElement;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = parent?.clientWidth ?? window.innerWidth;
      H = parent?.clientHeight ?? window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /** Proyección: el mapa (2:1) centrado; en heros altos (mobile) se ancla
     * más arriba para que no quede hundido al fondo de la sección. */
    function proyectar(nx: number, ny: number): [number, number] {
      const mapW = Math.max(W * 1.04, 900);
      const mapH = mapW * 0.5;
      const ox = (W - mapW) / 2;
      const oy = Math.min((H - mapH) / 2, H * 0.16);
      return [ox + nx * mapW, oy + ny * mapH];
    }

    /** Curva de la ruta: cuadrática con control elevado (arco de vuelo). */
    function controlDe(
      a: [number, number],
      b: [number, number],
    ): [number, number] {
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      const dx = b[0] - a[0];
      const dist = Math.hypot(dx, b[1] - a[1]);
      return [mx, my - Math.min(dist * 0.28, H * 0.3)];
    }

    function puntoEnCurva(
      a: [number, number],
      c: [number, number],
      b: [number, number],
      t: number,
    ): [number, number] {
      const u = 1 - t;
      return [
        u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
        u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
      ];
    }

    function draw(timeMs: number) {
      const t = timeMs * 0.001;
      ctx!.clearRect(0, 0, W, H);

      // Tierra punteada
      ctx!.fillStyle = `rgba(${dotRGB}, ${dotAlpha})`;
      const r = Math.max(1, Math.min(1.7, W / 900));
      for (let i = 0; i < WORLD_DOTS.length; i += 2) {
        const [sx, sy] = proyectar(
          WORLD_DOTS[i]! / 1000,
          WORLD_DOTS[i + 1]! / 1000,
        );
        if (sx < -4 || sx > W + 4 || sy < -4 || sy > H + 4) continue;
        ctx!.beginPath();
        ctx!.arc(sx, sy, r, 0, Math.PI * 2);
        ctx!.fill();
      }

      const pBA = proyectar(BA[0], BA[1]);

      // Rutas + pulsos viajando hacia Buenos Aires
      DESTINOS.forEach((destino, i) => {
        const pD = proyectar(destino[0], destino[1]);
        const c = controlDe(pD, pBA);

        // Traza punteada tenue
        ctx!.strokeStyle = `rgba(${ACCENT}, 0.28)`;
        ctx!.lineWidth = 1;
        ctx!.setLineDash([2, 6]);
        ctx!.beginPath();
        ctx!.moveTo(pD[0], pD[1]);
        ctx!.quadraticCurveTo(c[0], c[1], pBA[0], pBA[1]);
        ctx!.stroke();
        ctx!.setLineDash([]);

        // Punto de origen
        ctx!.fillStyle = `rgba(${ACCENT}, 0.55)`;
        ctx!.beginPath();
        ctx!.arc(pD[0], pD[1], 2.4, 0, Math.PI * 2);
        ctx!.fill();

        if (reducedMotion) return;

        // Pulso viajando con estela
        const fase = (t * 0.12 + i * 0.19) % 1;
        for (let k = 0; k < 7; k++) {
          const tt = fase - k * 0.014;
          if (tt < 0 || tt > 1) continue;
          const [px, py] = puntoEnCurva(pD, c, pBA, tt);
          const a = 0.85 * (1 - k / 7);
          ctx!.fillStyle = `rgba(${ACCENT}, ${a})`;
          ctx!.beginPath();
          ctx!.arc(px, py, 2.6 - k * 0.28, 0, Math.PI * 2);
          ctx!.fill();
        }
      });

      // Buenos Aires: nodo con anillo expansivo
      ctx!.fillStyle = `rgba(${ACCENT}, 0.95)`;
      ctx!.beginPath();
      ctx!.arc(pBA[0], pBA[1], 3.4, 0, Math.PI * 2);
      ctx!.fill();

      if (!reducedMotion) {
        const pulso = (t * 0.55) % 1;
        ctx!.strokeStyle = `rgba(${ACCENT}, ${0.5 * (1 - pulso)})`;
        ctx!.lineWidth = 1.4;
        ctx!.beginPath();
        ctx!.arc(pBA[0], pBA[1], 4 + pulso * 16, 0, Math.PI * 2);
        ctx!.stroke();
      }
    }

    function loop(timeMs: number) {
      draw(timeMs);
      rafId = requestAnimationFrame(loop);
    }

    function start() {
      if (rafId !== null) return;
      if (reducedMotion) {
        draw(0);
        return;
      }
      rafId = requestAnimationFrame(loop);
    }

    function stop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    readTheme();
    resize();
    start();

    const onResize = () => {
      resize();
      if (reducedMotion) draw(0);
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none ${className}`}
    />
  );
}
