import "server-only";
import type { OperationWithClient } from "./data";
import { getDocumentsByOperation } from "./data";
import { arancelPorNcm } from "./clasificador/motor";
import { ivaEstimado } from "./clasificador/datos";
import {
  calcularLogistica,
  resolverContextoLogistica,
  modalidadDe,
  type LogisticaResult,
  type TipoContenedor,
} from "./costos-logistica";
import {
  cotizar,
  buscarPais,
  formaPagoMeta,
  incotermMeta,
  perfilDesdeCondicionIva,
  regimenPercepciones,
  preferenciaLabel,
  PERFILES_FISCALES,
  INCOTERMS,
  VIAS,
  type CotizarResult,
  type Destino,
  type PerfilFiscal,
  type Pais,
  type Incoterm,
  type Via,
} from "./cotizador";

export type LiquidacionResult = {
  /** Datos que faltan en la operación y limitan/impiden la estimación. */
  faltan: string[];
  /** Avisos informativos (no bloqueantes): seguro según Incoterm, EXW origen, etc. */
  avisos: string[];
  perfil: PerfilFiscal;
  perfilLabel: string;
  destino: Destino;
  certExencion: boolean;
  ncm: string | null;
  diPct: number;
  /** "parquet": DIE aplicable (VUCE + nomenclador); "estimado": sin NCM. */
  diFuente: "parquet" | "estimado";
  tePct: number | null;
  /**
   * Origen del flete del CIF: "incluido" (CIF/CIP, ya en el valor), "manual" (lo
   * cargó el operador) o "estimado" (respaldo mientras no hay flete real).
   */
  fleteFuente: "incluido" | "manual" | "estimado";
  ivaPct: number;
  pais: string;
  preferencia: string;
  incoterm: string;
  via: string;
  valor: number;
  valorFuente: string;
  peso: number;
  cantidad: number;
  regimen: {
    percIvaPct: number;
    percGanPct: number;
    iibbPct: number;
    eximido: boolean;
  };
  cotiz: CotizarResult;
  /** Contenedor detectado y costos de logística nacional. */
  tipoContenedor: TipoContenedor | null;
  cantidadContenedores: number;
  logistica: LogisticaResult;
  /** Costo total estimado de la operación (tributos no recuperables + logística + honorarios). */
  costoTotal: number;
  /** Adelanto de logística sugerido (no incluye tributos: el VEP lo paga el cliente). */
  adelanto: number;
};

/** Parsea un número que puede venir como "1.234,56", "1234.56" o "1,234.56". */
function num(raw: string | null | undefined): number {
  if (raw == null) return 0;
  let s = String(raw).replace(/[^\d.,-]/g, "").trim();
  if (!s) return 0;
  const tieneComa = s.includes(",");
  const tienePunto = s.includes(".");
  if (tieneComa && tienePunto) {
    // El último separador es el decimal.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (tieneComa) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function incotermDe(value: string | null): Incoterm {
  const v = (value ?? "").trim().toUpperCase();
  if (!v) return INCOTERMS[3]; // FOB por defecto
  // El documento suele traer el Incoterm con el lugar al lado (ej. "CFR Buenos
  // Aires, Argentina"). Tomamos el código de 3 letras (CFR, CIF, FOB...) de
  // cualquier token, no comparamos la cadena completa.
  const tokens = v.split(/[^A-Z]+/).filter(Boolean);
  return (
    INCOTERMS.find((i) => tokens.includes(i.value)) ??
    INCOTERMS.find((i) => v.startsWith(i.value)) ??
    INCOTERMS[3] // FOB por defecto
  );
}

function viaDe(value: string | null): Via {
  const v = (value ?? "").trim().toLowerCase();
  return (
    VIAS.find((x) => x.value === v) ??
    VIAS.find((x) => v.startsWith(x.value.slice(0, 4))) ??
    VIAS[0] // marítima por defecto
  );
}

/**
 * Liquidación estimada de tributos para una operación, calculada con el DIE
 * oficial del nomenclador (por NCM) y el perfil fiscal guardado del cliente.
 * El resultado varía según la empresa: para Responsable Inscripto el IVA y las
 * percepciones se recuperan; para el resto son costo real.
 */
export async function calcularLiquidacion(
  op: OperationWithClient,
  destino: Destino = "reventa",
): Promise<LiquidacionResult> {
  const faltan: string[] = [];
  const avisos: string[] = [];

  const perfil = perfilDesdeCondicionIva(op.client_iva_condition);
  const perfilLabel =
    PERFILES_FISCALES.find((p) => p.value === perfil)?.label ??
    "Responsable Inscripto";
  if (!op.client_iva_condition) {
    faltan.push(
      "El cliente no registró su condición de IVA: se estima como Responsable Inscripto.",
    );
  }
  const certExencion =
    (op.client_cert_exencion ?? "").trim().toLowerCase() === "si";

  // Derecho de importación: VUCE (DIE aplicable) + nomenclador por NCM.
  const arancel = await arancelPorNcm(op.ncm);
  let diPct = 0;
  let diFuente: "parquet" | "estimado" = "estimado";
  let tePct: number | null = null;
  if (arancel) {
    diPct = arancel.di;
    diFuente = "parquet";
    tePct = arancel.te;
  } else {
    faltan.push(
      op.ncm
        ? "No se encontró el arancel para la NCM en el nomenclador."
        : "Definí la NCM para tomar el arancel oficial.",
    );
  }

  const ncmDigitos = (op.ncm ?? "").replace(/\D/g, "");
  const ivaPct = arancel?.iva ?? (ncmDigitos.length >= 4 ? ivaEstimado(ncmDigitos) : 21);

  // País de origen → régimen de preferencia (puede desgravar el derecho).
  const paisReconocido = buscarPais(op.pais_origen);
  const pais: Pais = paisReconocido ?? {
    nombre: op.pais_origen ?? "Origen sin definir",
    preferencia: "extrazona",
  };
  if (!paisReconocido && !op.pais_origen) {
    faltan.push("Cargá el país de origen para ajustar la preferencia.");
  }

  const incoterm = incotermDe(op.incoterm);

  const docs = await getDocumentsByOperation(op.id, op.user_id);
  const ctxLog = resolverContextoLogistica({
    via: op.via,
    medioTransporte: op.medio_transporte,
    tipoContenedor: op.tipo_contenedor,
    contenedor: op.contenedor,
    tipoEmbalaje: op.tipo_embalaje,
    cantidadContenedores: op.cantidad_contenedores,
    docs: docs.map((d) => ({ doc_type: d.doc_type, file_name: d.file_name })),
  });

  const via = viaDe(ctxLog.via ?? op.via);

  // Valor en la condición del incoterm (USD).
  const fob = num(op.valor_fob);
  const cif = num(op.valor_cif);
  const factura = num(op.valor_factura);
  let valor = 0;
  let valorFuente = "—";
  const prefiereCif = incoterm.incluyeFlete && incoterm.incluyeSeguro;
  const cadena: { v: number; f: string }[] = prefiereCif
    ? [
        { v: cif, f: "CIF" },
        { v: fob, f: "FOB" },
        { v: factura, f: "factura" },
      ]
    : [
        { v: fob, f: "FOB" },
        { v: factura, f: "factura" },
        { v: cif, f: "CIF" },
      ];
  for (const c of cadena) {
    if (c.v > 0) {
      valor = c.v;
      valorFuente = c.f;
      break;
    }
  }
  if (valor <= 0) {
    faltan.push("Cargá el valor de la mercadería (FOB / CIF / factura).");
  }

  const peso = num(op.peso_bruto) || num(op.peso_neto);
  const cantidad = num(op.cantidad) || 1;

  const fleteOp = num(op.flete);
  const seguroOp = num(op.seguro);

  const regimen = regimenPercepciones({
    perfil,
    destino,
    ivaPct,
    certExclusion: certExencion,
  });

  // Logística nacional: tipo/cantidad según vía (mar/aer/terr) y documentos.
  const tipoContenedor = ctxLog.tipo;
  if (!ctxLog.modo) {
    faltan.push(
      "Definí la vía (marítima, aérea o terrestre) o subí el BL/AWB/CRT para listar los gastos de logística de esta operación.",
    );
  } else if (!tipoContenedor) {
    faltan.push(
      "Definí el tipo de carga (contenedor, LCL o aéreo; lo detecta la IA del documento de transporte) para afinar la logística.",
    );
  }
  const cantidadContenedores = ctxLog.cantidad;
  let overrides: Record<string, number> | undefined;
  if (op.costos_override) {
    try {
      const parsed = JSON.parse(op.costos_override) as Record<string, unknown>;
      overrides = {};
      for (const [k, val] of Object.entries(parsed)) {
        const n = Number(val);
        if (Number.isFinite(n)) overrides[k] = n;
      }
    } catch {
      overrides = undefined;
    }
  }
  const transporteInterno = num(op.transporte_interno);

  // ¿El BL llega como original a canjear? Prioriza la liberación explícita del
  // pedido; si no hay dato, lo deduce de la forma de pago (cobranza / L/C → original).
  const fpMeta = formaPagoMeta(op.forma_pago, op.via);
  const liberacion = (op.liberacion_doc ?? "").toLowerCase();
  const blOriginal = liberacion.includes("telex") || liberacion.includes("waybill")
    ? false
    : liberacion.includes("original")
      ? true
      : fpMeta.blOriginal;

  const tipoLog: TipoContenedor =
    tipoContenedor ??
    (ctxLog.modo === "aerea"
      ? "AEREO"
      : ctxLog.modo === "terrestre"
        ? "LCL"
        : "40HC");
  // Paso 1 / operación: motor en modo REAL (estimar:false). NO se inventa ningún
  // gasto local: las líneas arrancan en 0 y solo toman valor del dato real
  // (override del operador o factura del forwarder). El único estimado del
  // sistema es el seguro (1%), que se calcula en cotizar().
  let logistica = calcularLogistica({
    tipo: tipoLog,
    cantidad: modalidadDe(tipoLog) === "FCL" ? cantidadContenedores : 1,
    via: ctxLog.via ?? op.via,
    modo: ctxLog.modo,
    pesoKg: peso,
    cbm: num(op.volumen_cbm),
    blOriginal,
    overrides,
    transporteInterno: transporteInterno > 0 ? transporteInterno : undefined,
    estimar: false,
  });
  const gastosDestinoReal = num(op.gastos_destino);
  if (gastosDestinoReal > 0) {
    // Conservamos el transporte interno (carga manual del puerto → cliente): NO
    // forma parte de los gastos del forwarder y debe poder cargarse igual.
    const transpLinea = logistica.lineas.find(
      (l) => l.id === "transporte_interno",
    );
    const lineas = [
      {
        id: "gastos_destino_real",
        label: "Gastos en destino (aviso/factura naviera-forwarder)",
        grupo: "terminal" as const,
        etapa: "embarque" as const,
        monto: gastosDestinoReal,
        reembolsable: false,
        nota: "Tomado del aviso de llegada / factura de gastos; reemplaza la estimación automática.",
      },
      ...(transpLinea ? [transpLinea] : []),
    ];
    const total = gastosDestinoReal + (transpLinea?.monto ?? 0);
    logistica = {
      ...logistica,
      lineas,
      costoLogistica: total,
      adelanto: total,
    };
  }
  // Modo real: si todavía no hay gastos locales de nacionalización cargados (ni
  // del forwarder ni a mano), avisamos que falta el dato en vez de inventar. El
  // transporte interno (carga manual aparte) no cuenta para este chequeo.
  const gastosNacionalizacion = logistica.lineas
    .filter((l) => l.id !== "transporte_interno")
    .reduce((s, l) => s + l.monto, 0);
  if (gastosNacionalizacion <= 0) {
    faltan.push(
      "Faltan los gastos locales reales (naviera, terminal, despacho): cargá la factura/cotización del forwarder o ingresalos a mano en el detalle de logística.",
    );
  }

  // Avisos según el Incoterm: seguro y reparto de tareas (cambia el seguimiento).
  const meta = incotermMeta(incoterm);
  if (meta.seguroObligatorioVendedor) {
    avisos.push(
      incoterm.value === "CIF"
        ? "Seguro: en CIF lo contrata el vendedor con cobertura mínima (ICC-C), que no cubre robo ni manipuleo. Conviene contratar un seguro complementario ICC-A (todo riesgo)."
        : "Seguro: en CIP lo contrata el vendedor con cobertura amplia (ICC-A, 110% del valor).",
    );
  }
  // En modo real el flete NO se estima: si el Incoterm no lo incluye —o si el
  // valor base es FOB porque la factura abrió el flete por separado (en el Incoterm
  // que sea)— y todavía no se cargó el real, falta el dato (queda en 0 hasta cargarlo).
  const necesitaFleteReal = valorFuente === "FOB" || !incoterm.incluyeFlete;
  if (necesitaFleteReal && fleteOp <= 0) {
    faltan.push(
      "Falta el flete real: cargá el de la cotización/factura de la naviera o forwarder. No se estima (sólo el seguro se estima al 1%).",
    );
  }
  if (meta.despachoExportacionImportador) {
    avisos.push(
      "Incoterm EXW: el importador asume TODO el origen (retiro en fábrica, despacho de exportación y transporte hasta la terminal de origen). Hay que coordinar y sumar esos costos: el seguimiento lo hacemos nosotros.",
    );
  } else if (meta.seguimientoOrigen) {
    avisos.push(
      "Incoterm FCA: coordinamos el origen desde la entrega al transportista (el despacho de exportación lo hace el vendedor). Sumar el transporte en origen al flete principal.",
    );
  }
  if (meta.entregaEnDestino) {
    avisos.push(
      meta.importacionVendedor
        ? "Incoterm DDP: el vendedor entrega en destino y paga los tributos de importación. Verificar quién figura como importador/IM y qué gastos quedan realmente a cargo del cliente."
        : "Incoterm de grupo D: el vendedor lleva la mercadería hasta destino. Revisar qué incluye el precio para no duplicar flete/seguro en la cotización.",
    );
  }
  if (fpMeta.categoria !== "desconocido") {
    avisos.push(`Forma de pago (${fpMeta.label}): ${fpMeta.momentoBl}`);
    if (fpMeta.nota) avisos.push(fpMeta.nota);
  }
  const viaLower = (ctxLog.via ?? op.via ?? "").toLowerCase();
  const esMar = ctxLog.modo === "maritima" || (!ctxLog.modo && (!viaLower || viaLower.startsWith("mar")));
  if (blOriginal && esMar) {
    avisos.push(
      "El BL llega como ORIGINAL a canjear: hay que recibirlo del exterior (courier) antes de retirar. Suma tiempo y un costo de envío.",
    );
  }

  const cotiz = cotizar({
    valor,
    peso,
    cantidad,
    // La destinación decide si los tributos se pagan o se garantizan.
    destinacion: op.destinacion,
    categoria: { id: "op", label: "NCM operación", di: diPct, iva: ivaPct },
    pais,
    incoterm,
    via,
    diPctOverride: diPct,
    ivaPctOverride: ivaPct,
    tePctOverride: tePct,
    percIvaPct: regimen.percIvaPct,
    percGanPct: regimen.percGanPct,
    iibbPct: regimen.iibbPct,
    recIva: regimen.recIva,
    recPercIva: regimen.recPercIva,
    recPercGan: regimen.recPercGan,
    recIibb: regimen.recIibb,
    recHonorariosIva: regimen.recHonorariosIva,
    fleteOverride: fleteOp > 0 ? fleteOp : null,
    seguroOverride: seguroOp > 0 ? seguroOp : null,
    // Modo real: el flete NO se estima (debe ser el real del forwarder o 0). El
    // seguro 1% es la única estimación que el motor conserva.
    estimarFlete: false,
    // Si el valor base salió del FOB (la factura abrió FOB + flete + seguro, en el
    // Incoterm que sea), el motor suma el flete real sobre el FOB en vez de tratar
    // el precio como caja negra.
    fleteSeparado: valorFuente === "FOB",
    // Honorarios fuera del sistema: se acuerdan con la dirección en la reunión y
    // se suman aparte. No se calculan ni entran en el costo de la operación.
    honorariosPct: 0,
    honorariosMin: 0,
    gastosTerminal: 0,
    tipoCambio: null,
    otrosArs: 0,
  });

  return {
    faltan,
    avisos,
    perfil,
    perfilLabel,
    destino,
    certExencion,
    ncm: op.ncm,
    diPct: cotiz.diPct,
    diFuente,
    tePct,
    // Origen del flete usado: "incluido" (CIF/CIP con valor bundle, ya viene en el
    // precio), "manual" (lo cargó el operador / lo desglosó la factura) o
    // "estimado" (respaldo del sistema mientras no se carga el real). Si el valor
    // base es FOB, el flete NO está incluido aunque el Incoterm normalmente lo incluya.
    fleteFuente:
      valorFuente !== "FOB" && incoterm.incluyeFlete
        ? ("incluido" as const)
        : fleteOp > 0
          ? ("manual" as const)
          : ("estimado" as const),
    ivaPct,
    pais: pais.nombre,
    preferencia: preferenciaLabel(pais.preferencia),
    incoterm: incoterm.label,
    via: via.label,
    valor,
    valorFuente,
    peso,
    cantidad,
    regimen: {
      percIvaPct: regimen.percIvaPct,
      percGanPct: regimen.percGanPct,
      iibbPct: regimen.iibbPct,
      eximido: regimen.eximido,
    },
    cotiz,
    tipoContenedor,
    cantidadContenedores,
    logistica,
    // Costo total: lo que NO se recupera de tributos + honorarios + logística.
    costoTotal: cotiz.costoReal + logistica.costoLogistica,
    adelanto: logistica.adelanto,
  };
}
