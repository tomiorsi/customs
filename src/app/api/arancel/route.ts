import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { arancelPorNcm } from "@/lib/clasificador/motor";

/**
 * Aranceles oficiales por NCM, para el cotizador (importación y exportación):
 *  - di: Derecho de Importación (DIE).
 *  - de: Derecho de Exportación (DE).
 *  - reintegro: Reintegro a la exportación.
 *  - iva: IVA estimado por posición.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ncm = searchParams.get("ncm");
  if (!ncm) {
    return NextResponse.json({ error: "Falta la NCM." }, { status: 400 });
  }

  const arancel = await arancelPorNcm(ncm);
  if (!arancel) {
    return NextResponse.json({ ok: true, resultado: null });
  }

  return NextResponse.json({
    ok: true,
    resultado: {
      ncm8: arancel.ncm8,
      codigo: arancel.codigo,
      di: arancel.di,
      diNominal: arancel.diNominal,
      aec: arancel.aec,
      dii: arancel.dii,
      te: arancel.te,
      bk: arancel.bk,
      dieRegimen: arancel.dieRegimen,
      dieDesdeVuce: arancel.dieDesdeVuce,
      de: arancel.de,
      reintegro: arancel.reintegro,
      reintegroIntra: arancel.reintegroIntra,
      adicional: arancel.adicional,
      iva: arancel.iva,
      ivaAdicional: arancel.ivaAdicional,
      ivaEstimado: arancel.ivaEstimado,
    },
  });
}
