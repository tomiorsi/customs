import Image from "next/image";

/**
 * Marca del estudio: el wordmark J&C, solo.
 *
 * No lleva texto al lado: el logo ya dice el nombre y repetirlo competía con
 * él en vez de acompañarlo.
 */
export function Brand({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  // El logo es casi cuadrado (664×612); la caja lo acompaña sin deformarlo.
  const alto = size === "lg" ? 56 : size === "sm" ? 38 : 46;
  const ancho = Math.round(alto * (664 / 612));

  return (
    <Image
      src="/jc-logo.svg"
      alt="J&C Comex"
      width={ancho}
      height={alto}
      priority
      className="shrink-0"
    />
  );
}
