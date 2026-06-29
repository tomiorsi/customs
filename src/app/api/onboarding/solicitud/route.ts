import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import {
  evaluarSolicitud,
  guardarSolicitudEnRevision,
  rechazarAutomatico,
  type SolicitudData,
} from "@/lib/onboarding";

const REGISTROS = new Set(["si", "tramite", "no"]);
const ANTIGUEDADES = new Set(["nueva", "media", "establecida"]);
const TITULARIDADES = new Set(["propia", "tercero"]);
const FINANCIACIONES = new Set(["propio", "bancario", "inversor", "otro"]);
const SI_NO = new Set(["si", "no"]);

function pick<T extends string>(
  v: unknown,
  set: Set<string>,
  def: T,
): T {
  const s = String(v ?? "").trim();
  return (set.has(s) ? s : def) as T;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "client") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (user.op_status === "approved") {
    return NextResponse.json(
      { error: "Tu cuenta ya está habilitada para operar." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const data: SolicitudData = {
    razonSocial: String(body.razonSocial ?? "").trim(),
    cuit: String(body.cuit ?? "").trim(),
    registroImportador: pick(body.registroImportador, REGISTROS, "no"),
    antiguedad: pick(body.antiguedad, ANTIGUEDADES, "media"),
    titularidad: pick(body.titularidad, TITULARIDADES, "propia"),
    rubro: String(body.rubro ?? "").trim(),
    detalleProducto: String(body.detalleProducto ?? "").trim(),
    pais: String(body.pais ?? "").trim(),
    proveedor: String(body.proveedor ?? "").trim(),
    cifOperacion: Number(body.cifOperacion) || 0,
    volumenAnual: Number(body.volumenAnual) || 0,
    financiacion: pick(body.financiacion, FINANCIACIONES, "propio"),
    yaImporto: pick(body.yaImporto, SI_NO, "no"),
    comoConocio: String(body.comoConocio ?? "").trim(),
    motivoCambio: String(body.motivoCambio ?? "").trim(),
    documentacion: pick(body.documentacion, SI_NO, "si"),
    web: String(body.web ?? "").trim(),
  };

  if (!data.razonSocial || !data.rubro || !data.pais) {
    return NextResponse.json(
      { error: "Completá razón social, rubro y país." },
      { status: 400 },
    );
  }
  if (data.cifOperacion <= 0 && data.volumenAnual <= 0) {
    return NextResponse.json(
      { error: "Indicá el valor CIF por operación o el volumen anual estimado." },
      { status: 400 },
    );
  }

  const evaluacion = evaluarSolicitud(data);
  if (!evaluacion.ok) {
    rechazarAutomatico(user.id, data, evaluacion.motivo ?? "No califica.");
    return NextResponse.json({
      status: "rejected",
      motivo: evaluacion.motivo,
    });
  }

  guardarSolicitudEnRevision(user.id, data);
  return NextResponse.json({ status: "submitted" });
}
