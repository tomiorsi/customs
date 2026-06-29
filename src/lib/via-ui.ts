import { Package, Plane, Ship, Truck, type LucideIcon } from "lucide-react";
import { normalizarViaCanon, type ViaCanon } from "@/lib/costos-logistica";

export const VIA_ICON: Record<ViaCanon, LucideIcon> = {
  maritima: Ship,
  aerea: Plane,
  terrestre: Truck,
};

export const VIA_LABEL: Record<ViaCanon, string> = {
  maritima: "Marítima",
  aerea: "Aérea",
  terrestre: "Terrestre",
};

/** Vía canónica para UI: primero `via` de la operación, luego medio de transporte. */
export function resolverViaUi(
  via?: string | null,
  medioTransporte?: string | null,
): ViaCanon | null {
  return normalizarViaCanon(via) ?? normalizarViaCanon(medioTransporte);
}

/** Ícono de transporte según la vía elegida al abrir la operación. */
export function iconoVia(
  via?: string | null,
  medioTransporte?: string | null,
): LucideIcon {
  const canon = resolverViaUi(via, medioTransporte);
  if (canon) return VIA_ICON[canon];
  return Package;
}
