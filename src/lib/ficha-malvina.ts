import "server-only";

import type { OperationWithClient } from "@/lib/data";
import { calcularLiquidacion } from "@/lib/liquidacion";
import {
  perfilDesdeCondicionIva,
  PERFILES_FISCALES,
  type Destino,
} from "@/lib/cotizador";
import { formatMoneda } from "@/lib/formato";
import { rutaOperacion } from "@/lib/ruta-operacion";
import type { ChecklistEstado } from "@/lib/workflow";
import { claveSubtarea } from "@/lib/workflow";

export type FichaCampoEstado = "ok";

export type FichaCampo = {
  id: string;
  label: string;
  valor: string;
  estado: FichaCampoEstado;
  nota?: string;
};

export type FichaSeccion = {
  id: string;
  titulo: string;
  campos: FichaCampo[];
};

export type FichaMalvinaResult = {
  titulo: string;
  secciones: FichaSeccion[];
};

/**
 * Nombre de respaldo mientras el estudio no cargó su razón social.
 *
 * El nombre y el CUIT reales llegan por `opts.estudio`, de la cuenta de cada
 * despachante: la plataforma es multiestudio y no puede haber un CUIT único
 * para todo el servidor — a partir del segundo estudio, firmaría todo con el
 * del primero.
 */
const ESTUDIO_SIN_NOMBRE = "Estudio aduanero";

function txt(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  return s || "";
}

/** Campo informativo para tipear en SIM; sin semáforos de etapas anteriores. */
function campo(
  id: string,
  label: string,
  valor: string | null | undefined,
  nota?: string,
): FichaCampo {
  const v = txt(valor);
  return { id, label, valor: v || "—", estado: "ok", nota };
}

function moneyUsd(n: number): string {
  return formatMoneda("USD", String(Math.round(n))) ?? `USD ${Math.round(n)}`;
}

export async function armarFichaMalvina(
  op: OperationWithClient,
  opts: {
    checklist?: ChecklistEstado;
    /** Razón social y CUIT del estudio que firma. Ver `datos-estudio.ts`. */
    estudio?: { cuit: string | null; razonSocial: string | null };
  } = {},
): Promise<FichaMalvinaResult> {
  /** Régimen fiscal ya definido en cotización/liquidación; no se re-pregunta en paso 5. */
  const destino: Destino = "reventa";
  const checklist = opts.checklist ?? {};

  const liq = await calcularLiquidacion(op, destino);

  const vepOk = Boolean(checklist[claveSubtarea("liquidacion", "vep")]);
  const pagoOk = Boolean(checklist[claveSubtarea("liquidacion", "pago")]);

  const perfil = perfilDesdeCondicionIva(op.client_iva_condition);
  const perfilLabel =
    PERFILES_FISCALES.find((p) => p.value === perfil)?.label ?? perfil;

  const c = liq.cotiz;
  const totalTributos =
    c.di +
    (c.tasaExenta ? 0 : c.tasa) +
    c.iva +
    c.percIva +
    c.percGan +
    c.iibb;

  const secciones: FichaSeccion[] = [
    {
      id: "importador",
      titulo: "Importador y despacho",
      campos: [
        campo("importador", "Importador", op.company_name),
        campo("cuit_importador", "CUIT importador", op.client_cuit),
        campo("iva", "Condición IVA", perfilLabel),
        campo("estudio", "Despachante", opts.estudio?.razonSocial || ESTUDIO_SIN_NOMBRE),
        campo("cuit_estudio", "CUIT despachante", opts.estudio?.cuit ?? null),
        campo("aduana", "Aduana de despacho", op.aduana),
      ],
    },
    {
      id: "posicion",
      titulo: "Posición y mercadería",
      campos: [
        campo("ncm", "Posición SIM / NCM", op.ncm),
        campo("mercaderia", "Descripción", op.mercaderia),
        campo("cantidad", "Cantidad", op.cantidad),
        campo("unidad", "Unidad estadística", op.unidad),
        campo("bultos", "Bultos", op.bultos),
        campo("peso_neto", "Peso neto", op.peso_neto),
        campo("peso_bruto", "Peso bruto", op.peso_bruto),
        campo("embalaje", "Embalaje", op.tipo_embalaje),
      ],
    },
    {
      id: "valoracion",
      titulo: "Valoración (base aduanera)",
      campos: [
        campo("incoterm", "Incoterm", op.incoterm ?? liq.incoterm),
        campo("moneda", "Moneda", op.moneda ?? "USD"),
        campo(
          "fob",
          "FOB",
          op.valor_fob
            ? formatMoneda(op.moneda ?? "USD", op.valor_fob)
            : moneyUsd(c.cif - c.flete - c.seguro),
          op.valor_fob ? undefined : "Derivado del CIF",
        ),
        campo(
          "flete",
          "Flete",
          moneyUsd(c.flete),
          liq.fleteFuente === "manual"
            ? "Manual / forwarder"
            : liq.fleteFuente === "incluido"
              ? "Incluido en Incoterm"
              : "Estimado",
        ),
        campo("seguro", "Seguro", moneyUsd(c.seguro)),
        campo("cif", "Valor en aduana (CIF)", moneyUsd(c.cif), liq.valorFuente),
        campo("forma_pago", "Forma de pago comercial", op.forma_pago),
      ],
    },
    {
      id: "transporte",
      titulo: "Transporte",
      campos: [
        campo("via", "Vía", liq.via || op.via),
        campo("doc_transporte", "Documento de transporte", op.transporte_doc_nro),
        campo("transportista", "Transportista / ATA", op.transportista),
        campo("ruta", "Ruta", rutaOperacion(op)),
        campo("contenedor", "Contenedor", op.contenedor),
        campo(
          "tipo_contenedor",
          "Tipo / cantidad",
          liq.tipoContenedor
            ? `${liq.cantidadContenedores > 1 ? `${liq.cantidadContenedores}× ` : ""}${liq.tipoContenedor}`
            : null,
        ),
        campo("eta", "ETA / arribo", op.eta),
        campo("contraparte", "Proveedor / vendedor", op.contraparte),
      ],
    },
    {
      id: "origen",
      titulo: "Origen y preferencia",
      campos: [
        campo("pais_origen", "País de origen", op.pais_origen ?? liq.pais),
        campo("pais_procedencia", "País de procedencia", op.pais_procedencia),
        campo("pais_adquisicion", "País de adquisición", op.pais_adquisicion),
        campo("preferencia", "Preferencia arancelaria", liq.preferencia),
      ],
    },
    {
      id: "tributos",
      titulo: "Tributos (referencia liquidación)",
      campos: [
        campo("di", `Derecho (${liq.diPct}%)`, moneyUsd(c.di)),
        campo(
          "te",
          "Tasa estadística",
          c.tasaExenta ? "Exenta" : moneyUsd(c.tasa),
        ),
        campo("iva", `IVA (${liq.ivaPct}%)`, moneyUsd(c.iva)),
        campo("perc_iva", "Percepción IVA", moneyUsd(c.percIva)),
        campo("perc_gan", "Percepción Ganancias", moneyUsd(c.percGan)),
        campo("iibb", "Percepción IIBB", moneyUsd(c.iibb)),
        campo("total_vep", "Total tributos (VEP)", moneyUsd(totalTributos)),
        campo(
          "recuperable",
          "Recuperable (crédito / pago a cuenta)",
          moneyUsd(c.recuperable),
        ),
        campo("vep_check", "VEP generado", vepOk ? "Sí" : null),
        campo("pago_check", "VEP pagado", pagoOk ? "Sí" : null),
      ],
    },
  ];

  return {
    titulo: "Ficha para Malvina (pre-oficialización)",
    secciones,
  };
}
