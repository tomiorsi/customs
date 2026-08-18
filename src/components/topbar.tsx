"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Anchor,
  CreditCard,
  LifeBuoy,
  LogOut,
  Menu as MenuIcon,
  Newspaper,
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
import { esDuenoDeEstudio, esEquipo as rolDeEquipo } from "@/lib/roles";
import type { PublicUser } from "@/lib/types";

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV_ADMIN: NavItem[] = [
  { href: "/admin/inicio", label: "Noticias", icon: Newspaper },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/operaciones", label: "Operaciones", icon: Ship },
  { href: "/admin/buques", label: "Buques", icon: Anchor },
  { href: "/admin/cotizador", label: "Calculadora", icon: Receipt },
  { href: "/admin/nomenclador", label: "Nomenclador", icon: ScanSearch },
];

/**
 * El cliente entra a una sola cosa: ver cómo viene su operación. Nada más.
 *
 * No tiene chat —esa conversación pasa por WhatsApp o mail, donde ya ocurre— ni
 * calculadora: cotizar es trabajo del despachante, que es quien conoce la
 * clasificación, el perfil fiscal del importador y los gastos reales. Un
 * número que el cliente saque por su cuenta y no coincida con el del estudio
 * genera una discusión que no tiene por qué existir.
 */
const NAV_CLIENT: NavItem[] = [
  { href: "/inicio/operaciones", label: "Mis operaciones", icon: Ship },
];

export function Topbar({
  user,
  diasPrueba = null,
}: {
  user: PublicUser;
  /** Días que quedan de prueba, o null si no está en prueba. */
  diasPrueba?: number | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [userMenu, setUserMenu] = useState(false);
  const [navMenu, setNavMenu] = useState(false);
  // Arriba de todo la barra no tapa nada, así que se deja ver el fondo. Apenas
  // se scrollea sí hay contenido pasando por debajo y necesita fondo sólido
  // para que el logo y el menú no se mezclen con lo que sube.
  const [scrolleado, setScrolleado] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const navMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const alScrollear = () => setScrolleado(window.scrollY > 4);
    alScrollear(); // por si la página abre ya scrolleada (volver atrás)
    window.addEventListener("scroll", alScrollear, { passive: true });
    return () => window.removeEventListener("scroll", alScrollear);
  }, []);

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

  useEffect(() => {
    if (!navMenu) return;
    function onPointerDown(e: PointerEvent) {
      if (!navMenuRef.current?.contains(e.target as Node)) setNavMenu(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setNavMenu(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [navMenu]);

  // Cada dueño de estudio administra sus Accesos; las subcuentas, no.
  const administraAccesos = esDuenoDeEstudio(user);
  const esEquipo = rolDeEquipo(user.role);
  const nav = esEquipo ? NAV_ADMIN : NAV_CLIENT;
  const home = esEquipo ? "/admin/inicio" : "/inicio/operaciones";
  const ajustes = esEquipo ? "/admin/cuenta" : "/inicio/settings";

  const nombre = esEquipo
    ? user.company_name?.trim() || user.contact_name?.trim() || "Mi estudio"
    : user.company_name ?? "Mi empresa";
  const subtitulo = user.email ?? user.username ?? "";
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

  return (
    <header className="sticky top-0 z-40">
      {/* Transparente arriba de todo; sólida apenas empieza a pasar contenido
          por debajo. Abrir un menú NO la vuelve sólida: el panel que se
          despliega ya tiene su propio fondo, y pintar la barra al abrirlo hacía
          un parpadeo blanco sobre una pantalla que no se movió. */}
      <div
        className={`transition-colors duration-200 ${
          scrolleado ? "bg-surface" : "bg-transparent"
        }`}
      >
      <div className="mx-auto grid h-11 max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
        {/* Con un solo destino el menú sobra: abrirlo para encontrar la
            pantalla en la que ya estás es un paso al pedo. El cliente entra
            directo a sus operaciones y el logo lo devuelve ahí. El hueco de la
            grilla queda igual para que el logo siga centrado. */}
        <div ref={navMenuRef} className="relative justify-self-start">
          {nav.length > 1 && (
          <button
            type="button"
            onClick={() => setNavMenu((v) => !v)}
            aria-label="Menú"
            aria-haspopup="menu"
            aria-expanded={navMenu}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            {navMenu ? (
              <X className="h-5 w-5" />
            ) : (
              <MenuIcon className="h-5 w-5" />
            )}
          </button>
          )}

          {navMenu && nav.length > 1 && (
            <div
              role="menu"
              className="absolute left-0 top-12 z-50 max-h-[calc(100vh-5rem)] w-[min(88vw,22rem)] overflow-y-auto rounded-2xl border border-border bg-surface p-2 shadow-xl"
            >
              <div className="grid grid-cols-2 gap-1">
                {nav.map(({ href, label, icon: Icon }) => {
                  const activo = esActivo(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      role="menuitem"
                      onClick={() => setNavMenu(false)}
                      className={`flex flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-4 text-center text-xs font-medium transition-colors ${
                        activo
                          ? "bg-accent-soft text-accent"
                          : "text-muted hover:bg-surface-2 hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <Link href={home} className="justify-self-center">
          <Brand size="sm" conTexto={false} />
        </Link>

        <div className="flex shrink-0 items-center gap-2 justify-self-end">
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
                  {subtitulo && (
                    <p className="truncate text-[11px] text-muted">{subtitulo}</p>
                  )}
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
                {administraAccesos && (
                  <Link
                    href="/admin/suscripcion"
                    role="menuitem"
                    onClick={() => setUserMenu(false)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-accent"
                  >
                    <span className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Plan y suscripción
                    </span>
                    {diasPrueba !== null && (
                      <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                        {diasPrueba}d
                      </span>
                    )}
                  </Link>
                )}
                {administraAccesos && (
                  <Link
                    href="/admin/equipo"
                    role="menuitem"
                    onClick={() => setUserMenu(false)}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-accent"
                  >
                    <UserCog className="h-4 w-4" />
                    Cuentas del equipo
                  </Link>
                )}
                <Link
                  href={esEquipo ? "/admin/soporte" : "/inicio/soporte"}
                  role="menuitem"
                  onClick={() => setUserMenu(false)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-accent"
                >
                  <LifeBuoy className="h-4 w-4" />
                  Soporte
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
      </div>

      {/* En vez de una línea, el blanco se apaga hacia abajo: el contenido que
          sube al hacer scroll se desvanece en lugar de cortarse. Arriba de todo
          se apaga entero — si no, quedaría una banda degradada colgando de una
          barra que ya es transparente. */}
      <div
        aria-hidden
        className={`pointer-events-none h-2.5 bg-gradient-to-b to-transparent transition-colors duration-200 ${
          scrolleado ? "from-surface" : "from-transparent"
        }`}
      />
    </header>
  );
}
