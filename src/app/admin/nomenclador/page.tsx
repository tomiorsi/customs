import { NomencladorClasificador } from "@/components/nomenclador-clasificador";

export default async function NomencladorPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  // `?q=` llega desde el buscador de una carpeta cuando no encontró nada: se
  // arrastra el texto para no hacerlo escribir de nuevo.
  const { q } = await searchParams;

  return (
    <div className="space-y-6">
      <NomencladorClasificador consultaInicial={(q ?? "").slice(0, 300)} />
    </div>
  );
}
