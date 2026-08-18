import Image from "next/image";

/**
 * Marca del estudio: el wordmark J&C, solo.
 *
 * No lleva texto al lado: el logo ya dice el nombre y repetirlo competía con
 * él en vez de acompañarlo.
 *
 * Hay dos archivos porque las letras son negras y sobre fondo oscuro
 * desaparecían: la variante clara solo cambia el negro por el gris del texto,
 * y el naranja del «&» queda igual en los dos —es la marca—. Se muestran las
 * dos y se oculta una por CSS, no con estado de React: así el logo correcto ya
 * está en el primer pintado y no parpadea al cargar.
 */
export function Brand({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  // El logo es casi cuadrado (664×612); la caja lo acompaña sin deformarlo.
  const alto = size === "lg" ? 56 : size === "sm" ? 38 : 46;
  const ancho = Math.round(alto * (664 / 612));

  return (
    <>
      <Image
        src="/jc-logo.svg"
        alt="J&C Comex"
        width={ancho}
        height={alto}
        priority
        className="shrink-0 dark:hidden"
      />
      <Image
        src="/jc-logo-dark.svg"
        alt=""
        aria-hidden
        width={ancho}
        height={alto}
        priority
        className="hidden shrink-0 dark:block"
      />
    </>
  );
}
