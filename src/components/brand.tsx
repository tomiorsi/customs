import { Container } from "lucide-react";

const GRIS = "#6e7480";

export function Brand({
  size = "md",
  withText = true,
}: {
  size?: "sm" | "md" | "lg";
  withText?: boolean;
}) {
  const box =
    size === "lg" ? "h-11 w-11" : size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const icon =
    size === "lg" ? "h-6 w-6" : size === "sm" ? "h-[18px] w-[18px]" : "h-5 w-5";
  const title =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";
  const sub =
    size === "lg" ? "text-[9px]" : size === "sm" ? "text-[6px]" : "text-[8px]";

  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`${box} flex items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-sm`}
      >
        <Container className={icon} strokeWidth={2.2} />
      </div>
      {withText && (
        <div className="leading-none">
          <p className={`${title} font-extrabold tracking-tight`} style={{ color: GRIS }}>
            RCV<span className="ml-[0.3em]">Orsi</span>
          </p>
          <p
            className={`${sub} -mt-0.5 font-medium uppercase tracking-[0.2em]`}
            style={{ color: GRIS }}
          >
            Estudio Aduanero
          </p>
        </div>
      )}
    </div>
  );
}
