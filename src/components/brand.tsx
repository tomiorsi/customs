import Image from "next/image";

/**
 * Marca del estudio: J&C Comex.
 *
 * El logo es un wordmark que dice "J&C", así que al lado va "Comex" para
 * completar el nombre y, debajo, el descriptor de qué hace el estudio.
 */
const GRIS = "#6e7480";

export function Brand({
  size = "md",
  withText = true,
}: {
  size?: "sm" | "md" | "lg";
  withText?: boolean;
}) {
  // El logo es casi cuadrado (664×612); la caja lo acompaña sin deformarlo.
  const alto = size === "lg" ? 52 : size === "sm" ? 34 : 42;
  const ancho = Math.round(alto * (664 / 612));
  const nombre =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";
  const sub =
    size === "lg" ? "text-[9px]" : size === "sm" ? "text-[6px]" : "text-[7px]";

  return (
    <div className="flex items-center gap-2">
      <Image
        src="/jc-logo.svg"
        alt="J&C Comex"
        width={ancho}
        height={alto}
        priority
        className="shrink-0"
      />
      {withText && (
        <div className="leading-none">
          <p
            className={`${nombre} font-extrabold tracking-tight`}
            style={{ color: GRIS }}
          >
            Comex
          </p>
          <p
            className={`${sub} mt-1 font-medium uppercase tracking-[0.22em]`}
            style={{ color: GRIS }}
          >
            Estudio Aduanero
          </p>
        </div>
      )}
    </div>
  );
}
