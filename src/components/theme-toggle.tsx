"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle({
  variant = "button",
}: {
  variant?: "button" | "menu";
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const isDark = resolvedTheme === "dark";

  function toggle() {
    const root = document.documentElement;
    root.classList.add("theme-transition");
    setTheme(isDark ? "light" : "dark");
    window.setTimeout(() => root.classList.remove("theme-transition"), 350);
  }

  if (variant === "menu") {
    return (
      <button
        type="button"
        onClick={toggle}
        role="menuitem"
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-accent"
      >
        {mounted ? (
          isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
        ) : (
          <span className="h-4 w-4" />
        )}
        {mounted ? (isDark ? "Modo día" : "Modo noche") : "Tema"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Cambiar tema"
      title={isDark ? "Modo día" : "Modo noche"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      {mounted ? (
        isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />
      ) : (
        <span className="h-[18px] w-[18px]" />
      )}
    </button>
  );
}
