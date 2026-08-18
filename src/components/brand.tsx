/**
 * Marca Wabe: las tres ondas y el nombre.
 *
 * El SVG va en línea y no como <Image>: son tres trazos y 400 bytes, así que
 * inlineado se pinta en el primer frame, escala sin pixelarse y —lo que más
 * importa— hereda el color del contexto. El archivo original tiene el celeste
 * fijo; acá los trazos usan `currentColor` para que la misma marca sirva sobre
 * fondo claro y oscuro sin dos copias, que era el problema del logo anterior.
 */
export function Brand({
  size = "md",
  /**
   * Mostrar el nombre al lado de las ondas. En el encabezado del portal va
   * sin texto —el logo va centrado y solo—, pero en login y registro el
   * visitante todavía no sabe dónde está y ahí sí conviene nombrarlo.
   */
  conTexto = true,
}: {
  size?: "sm" | "md" | "lg";
  conTexto?: boolean;
}) {
  const alto = size === "lg" ? 34 : size === "sm" ? 22 : 27;
  const ancho = Math.round((alto * 100) / 70);
  const texto = size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";

  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-accent">
      <svg
        width={ancho}
        height={alto}
        viewBox="0 0 100 70"
        fill="none"
        aria-hidden
        className="shrink-0"
      >
        <g
          stroke="currentColor"
          strokeWidth={4.5}
          strokeLinecap="round"
          fill="none"
        >
          <path d="M 0 12 C 12 0 18 0 25 12 S 38 24 50 12 S 62 0 75 12 S 88 24 100 12" />
          <path d="M 0 35 C 12 23 18 23 25 35 S 38 47 50 35 S 62 23 75 35 S 88 47 100 35" />
          <path d="M 0 58 C 12 46 18 46 25 58 S 38 70 50 58 S 62 46 75 58 S 88 70 100 58" />
        </g>
      </svg>
      {conTexto && (
        <span className={`${texto} font-semibold tracking-tight text-foreground`}>
          Wabe
        </span>
      )}
    </span>
  );
}
