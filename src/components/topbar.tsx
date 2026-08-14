"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Anchor,
  LogOut,
  Newspaper,
  Receipt,
  ScanSearch,
  Settings,
  Ship,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { logoutRequest } from "@/lib/auth-client";
import { esEquipo as rolDeEquipo } from "@/lib/roles";
import type { PublicUser } from "@/lib/types";

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV_ADMIN: NavItem[] = [
  { href: "/admin/inicio", label: "Inicio", icon: Newspaper },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/operaciones", label: "Operaciones", icon: Ship },
  { href: "/admin/buques", label: "Buques", icon: Anchor },
  { href: "/admin/cotizador", label: "Calculadora", icon: Receipt },
  { href: "/admin/nomenclador", label: "Nomenclador", icon: ScanSearch },
  { href: "/admin/equipo", label: "Accesos", icon: UserCog },
];

const NAV_OPERADOR: NavItem[] = NAV_ADMIN.filter(
  (i) => i.href !== "/admin/equipo",
);

const NAV_CLIENT: NavItem[] = [
  { href: "/inicio/operaciones", label: "Mis operaciones", icon: Ship },
  { href: "/inicio/cotizaciones", label: "Cotizar", icon: Receipt },
];

export function Topbar({ user }: { user: PublicUser }) {
  const pathname = usePathname();
  const router = useRouter();

  const [userMenu, setUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userMenu) return;
    function onPointerDown(e: PointerEvent) {
      if (!userMenuRef.current?.contains(e.target as Node)) setUserMenu(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setUserMenu(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenu]);

  const isAdmin = user.role === "admin";
  const isOperador = user.role === "operador";
  const esEquipo = rolDeEquipo(user.role);
  const nav = isAdmin ? NAV_ADMIN : isOperador ? NAV_OPERADOR : NAV_CLIENT;
  const home = esEquipo ? "/admin/inicio" : "/inicio/operaciones";
  const ajustes = esEquipo ? "/admin/cuenta" : "/inicio/settings";

  const nombre = isOperador
    ? user.contact_name ?? "Operador"
    : isAdmin
      ? user.company_name ?? "Administración"
      : user.company_name ?? "Mi empresa";
  const subtitulo = isAdmin
    ? "Administrador"
    : isOperador
      ? "Operador"
      : user.email ?? "Cliente";
  const inicial = (
    user.contact_name?.trim() ||
    user.company_name?.trim() ||
    user.email?.trim() ||
    "?"
  )[0].toUpperCase();

  async function salir() {
    await logoutRequest();
    router.replace("/");
    router.refresh();
  }

  function esActivo(href: string) {
    return href === home ? pathname === home : pathname.startsWith(href);
  }

  /** Misma pastilla en la barra de escritorio y en la fila de mobile. */
  function enlace({ href, label, icon: Icon }: NavItem) {
    return (
      <Link
        key={href}
        href={href}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
          esActivo(href)
            ? "bg-accent-soft text-accent"
            : "text-muted hover:bg-surface-2 hover:text-foreground"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
      </Link>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur">
      <div className="mx-auto flex h-12 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href={home} className="shrink-0">
          <Brand size="sm" />
        </Link>

        {/* Navegación siempre a la vista: no hay nada que desplegar. */}
        <nav className="hidden items-center gap-0.5 lg:flex">
          {nav.map(enlace)}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {esEquipo && (
            <span className="hidden rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent sm:inline">
              {isAdmin ? "Admin" : "Equipo"}
            </span>
          )}

          <div ref={userMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setUserMenu((v) => !v)}
              aria-label="Cuenta"
              aria-haspopup="menu"
              aria-expanded={userMenu}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent to-[#fb923c] text-sm font-semibold text-accent-foreground shadow-[0_6px_16px_-6px_var(--ring)] transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              {inicial}
            </button>

            {userMenu && (
              <div
                role="menu"
                className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
              >
                <div className="border-b border-border px-4 py-3">
                  <p className="truncate text-sm font-medium text-foreground">
                    {nombre}
                  </p>
                  <p className="truncate text-[11px] text-muted">{subtitulo}</p>
                </div>
                <Link
                  href={ajustes}
                  role="menuitem"
                  onClick={() => setUserMenu(false)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-accent"
                >
                  <Settings className="h-4 w-4" />
                  {esEquipo ? "Mi cuenta" : "Configuración"}
                </Link>
                <div className="border-t border-border" />
                <button
                  type="button"
                  onClick={salir}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-accent"
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* En pantallas angostas las secciones no entran en la misma línea que el
          logo: van abajo, en una fila que se arrastra en horizontal. Sigue
          estando todo a la vista, sin nada que desplegar. */}
      <nav className="flex items-center gap-0.5 overflow-x-auto border-t border-border px-3 pb-2 pt-1.5 lg:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {nav.map(enlace)}
      </nav>
    </header>
  );
}
