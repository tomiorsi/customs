"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LogOut,
  Menu,
  Receipt,
  ScanSearch,
  Settings,
  Ship,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { logoutRequest } from "@/lib/auth-client";
import type { PublicUser } from "@/lib/types";

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV_ADMIN: NavItem[] = [
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/operaciones", label: "Operaciones", icon: Ship },
  { href: "/admin/nomenclador", label: "Nomenclador", icon: ScanSearch },
  { href: "/admin/equipo", label: "Accesos", icon: UserCog },
];

const NAV_OPERADOR: NavItem[] = [
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/operaciones", label: "Operaciones", icon: Ship },
  { href: "/admin/nomenclador", label: "Nomenclador", icon: ScanSearch },
];

const NAV_CLIENT: NavItem[] = [
  { href: "/inicio/operaciones", label: "Mis operaciones", icon: Ship },
  { href: "/inicio/cotizaciones", label: "Cotizar", icon: Receipt },
];

export function Topbar({ user }: { user: PublicUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [userMenu, setUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (
        toggleRef.current?.contains(t) ||
        navRef.current?.contains(t) ||
        panelRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!userMenu) return;
    function onPointerDown(e: PointerEvent) {
      if (!userMenuRef.current?.contains(e.target as Node)) {
        setUserMenu(false);
      }
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
  const esEquipo = isAdmin || isOperador;
  const nav = isAdmin ? NAV_ADMIN : isOperador ? NAV_OPERADOR : NAV_CLIENT;
  const home = esEquipo ? "/admin/operaciones" : "/inicio/operaciones";

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
    router.replace("/login");
  }

  function esActivo(href: string) {
    return href === home ? pathname === home : pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur">
      <div className="relative mx-auto flex h-12 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Abrir menú"
            aria-expanded={open}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition-colors hover:text-accent"
          >
            <span className="relative block h-[18px] w-[18px]">
              <Menu
                className={`absolute inset-0 h-[18px] w-[18px] transition-all duration-200 ${
                  open ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
                }`}
              />
              <X
                className={`absolute inset-0 h-[18px] w-[18px] transition-all duration-200 ${
                  open ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
                }`}
              />
            </span>
          </button>

          <Link href={home}>
            <Brand size="sm" />
          </Link>
        </div>

        <nav
          ref={navRef}
          aria-hidden={!open}
          className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 md:flex"
        >
          {nav.map(({ href, label, icon: Icon }, i) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              tabIndex={open ? 0 : -1}
              style={{ transitionDelay: `${open ? i * 55 : 0}ms` }}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-300 ease-out ${
                open
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none -translate-y-1.5 opacity-0"
              } ${
                esActivo(href)
                  ? "bg-accent-soft text-accent"
                  : "text-muted hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {esEquipo && (
            <span className="hidden rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent sm:inline">
              {isAdmin ? "Admin" : "Equipo"}
            </span>
          )}

          <div ref={userMenuRef} className="relative hidden sm:block">
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
                {!esEquipo && (
                  <Link
                    href="/inicio/settings"
                    role="menuitem"
                    onClick={() => setUserMenu(false)}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-accent"
                  >
                    <Settings className="h-4 w-4" />
                    Configuración
                  </Link>
                )}
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

      {open && (
        <div
          ref={panelRef}
          className="animate-[fadeSlide_0.25s_ease-out] border-t border-border bg-surface md:hidden"
        >
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3 sm:px-6">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  esActivo(href)
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
            <div className="my-1 h-px bg-border" />
            {!esEquipo && (
              <Link
                href="/inicio/settings"
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  esActivo("/inicio/settings")
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                <Settings className="h-4 w-4" />
                Configuración
              </Link>
            )}
            <button
              type="button"
              onClick={salir}
              className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
