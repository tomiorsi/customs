/**
 * Workflow interno del despachante (vista del operador), separado de lo que ve
 * el cliente. Modela el paso a paso real de una operación en Argentina (2026):
 * 8 etapas con sub-tareas y una "guía" que indica qué revisar en cada una.
 *
 * No es "server-only": se usa también en componentes cliente.
 */

import {
  ESTADO_CANAL,
  ESTADO_ENTREGADA,
  ESTADO_LIBERADA,
  ESTADO_PREPARACION,
  ESTADO_PRESENTADA,
  ESTADO_RECIBIDA,
} from "./estados";
import {
  INCOTERMS,
  formaPagoMeta,
  incotermMeta,
  type FormaPagoMeta,
  type IncotermMeta,
} from "./cotizador";
import {
  blEsOriginal,
  guiaEmbarqueImportacion,
  labelPagoLogistica,
  ordenarSubtareasEmbarque,
} from "./retiro-transporte";

export type SubTarea = { id: string; label: string };

export type EtapaDef = {
  id: string;
  label: string;
  /** Qué tiene que revisar el operador antes de dar por buena la etapa. */
  guia: string;
  subtareas: SubTarea[];
  /** Estado simple que ve el cliente cuando la operación está en esta etapa. */
  estadoCliente: string;
};

/* ───────────────────────── Etapas de importación ───────────────────────── */

const ETAPAS_IMPO: EtapaDef[] = [
  {
    id: "apertura",
    label: "Apertura de carpeta",
    guia: "La BASE son los datos que ya cargó el cliente al abrir: tipo (impo/expo), vía, forma de pago, país, mercadería y estado (nuevo/usado). Con eso solo ya armás el primer borrador del paso a paso (y orientás NCM, intervenciones y certificado de origen). Después: si todavía no subió la factura, pedila (con el pedido o la proforma ya abrís la carpeta). Cuando llegue la factura, corré la IA: la analiza y la CRUZA con lo que cargó el cliente. Dos caminos: (1) coincide → confirmás y seguís; (2) hay diferencias (el cliente se confundió o la factura cambia vía / Incoterm / pago / mercadería) → corregís los datos y los pasos se reordenan solos. Revisá y aplicá tipo, vía, forma de pago e Incoterm antes de avanzar. De acá sale una COTIZACIÓN PRELIMINAR (tributos estimados + logística por defecto); el contenedor y los gastos finos llegan con el transporte en el paso siguiente.",
    estadoCliente: ESTADO_RECIBIDA,
    subtareas: [
      { id: "datos_cliente", label: "Datos del cliente revisados (tipo, vía, pago, país, mercadería, estado)" },
      { id: "doc_comercial", label: "Documento comercial recibido (pedido, proforma o factura)" },
      { id: "ficha", label: "Ficha técnica / catálogo recibido (si aplica)" },
      { id: "incoterm", label: "Incoterm confirmado (define el reparto de tareas)" },
      { id: "importador", label: "Datos del importador verificados" },
      { id: "cotizacion_prelim", label: "Cotización preliminar compartida con el cliente" },
    ],
  },
  {
    id: "documentacion",
    label: "Clasificación y documentación",
    guia: "Trabajo DOCUMENTAL que se hace apenas el cliente confirma la cotización (igual para marítimo, aéreo y terrestre). Con la factura comercial definitiva, el packing list y la NCM cerrada corrés la validación y pasás al transporte. Intervenciones, prueba de origen, seguro, certificados y el resto de la carpeta se gestionan y alertan en el Paso 3 (IA + marco normativo + VUCE).",
    estadoCliente: ESTADO_PREPARACION,
    subtareas: [
      { id: "factura", label: "Factura comercial definitiva" },
      { id: "packing", label: "Packing list (peso, bultos y volumen/CBM)" },
      { id: "ncm", label: "NCM definida" },
    ],
  },
  {
    id: "embarque",
    label: "Transporte, embarque y arribo",
    guia: "Etapa que llega cuando la carga EMBARCA y ARRIBA. El paso a paso del retiro del documento de transporte y el cobro de logística se adapta según la vía y la forma de pago que figure en los documentos (anticipado, cobranza, carta de crédito…). Los tributos los paga aparte por VEP.",
    estadoCliente: ESTADO_PREPARACION,
    subtareas: [
      { id: "transporte", label: "Documento de transporte (BL / AWB / CRT)" },
      { id: "aviso_arribo", label: "Aviso de arribo recibido" },
      { id: "carta_garantia", label: "Carta de garantía firmada ante escribano (anual o puntual) para retirar el contenedor" },
      { id: "bl_liberado", label: "BL liberado / Orden de entrega obtenida" },
      { id: "adelanto", label: "Logística en destino pagada" },
    ],
  },
  {
    id: "liquidacion",
    label: "Liquidación y pago de tributos",
    guia: "Verificá el valor en aduana (CIF) y la liquidación de derechos, tasa estadística, IVA y percepciones. El panel arma el resumen de fondos (VEP + adelanto logístico) según la NCM y el perfil fiscal del cliente. Generá el VEP y confirmá que el pago esté acreditado antes de oficializar. El VEP lo paga el cliente directo desde su CUIT; el adelanto de logística cubre los gastos de destino que el despachante adelanta.",
    estadoCliente: ESTADO_PREPARACION,
    subtareas: [
      { id: "cif", label: "Valor en aduana (CIF) determinado" },
      { id: "tributos", label: "Derechos, tasa, IVA y percepciones liquidados" },
      { id: "cotizacion_total", label: "Resumen de fondos confirmado con el cliente" },
      { id: "vep", label: "VEP generado" },
      { id: "pago", label: "Pago del VEP confirmado (cliente)" },
    ],
  },
  {
    id: "oficializacion",
    label: "Oficialización en SIM (Malvina)",
    guia: "Armá la carátula con la ficha y oficializá en Malvina. Después descargá el despacho oficializado y subilo en Documentos (la IA lo cruza contra la ficha). Cuando Aduana asigne el canal (verde / naranja / rojo), registrálo acá y avanzá a verificación.",
    estadoCliente: ESTADO_PRESENTADA,
    subtareas: [
      { id: "caratula", label: "Carátula armada y revisada" },
      { id: "oficializada", label: "Destinación oficializada en SIM" },
      { id: "despacho", label: "Despacho oficializado cargado" },
      { id: "canal", label: "Canal asignado registrado" },
    ],
  },
  {
    id: "verificacion",
    label: "Verificación / Libramiento",
    guia: "Naranja: presentá la documentación. Rojo: coordiná la verificación física con Aduana y, si corresponde, reservá turno en la terminal o depósito fiscal. Obtené el libramiento antes de avanzar al retiro.",
    estadoCliente: ESTADO_CANAL,
    subtareas: [
      { id: "presentacion", label: "Documentación presentada (naranja)" },
      { id: "terminal_verificacion", label: "Terminal / depósito de verificación identificado (rojo)" },
      { id: "turno_verificacion", label: "Turno de verificación en terminal / depósito reservado (rojo)" },
      { id: "fisica", label: "Verificación física coordinada con Aduana (rojo)" },
      { id: "libramiento", label: "Libramiento obtenido" },
    ],
  },
  {
    id: "retiro",
    label: "Retiro y entrega",
    guia: "Con el libramiento obtenido, confirmá terminal o depósito, libre deuda de la naviera/terminal y free time. Acá se pagan los gastos de terminal (THC/entrega, ZAP, energía reefer, almacenaje si se excedió el forzoso) y el transporte interno. Reservá el turno de retiro, obtené el gate pass si aplica y coordiná el transporte hasta el destino del cliente.",
    estadoCliente: ESTADO_LIBERADA,
    subtareas: [
      { id: "terminal", label: "Terminal / depósito de retiro identificado" },
      { id: "libre_deuda", label: "Libre deuda de naviera / terminal confirmado" },
      { id: "free_time", label: "Free time y vencimientos revisados" },
      { id: "gastos_terminal", label: "Gastos de terminal pagados (THC, ZAP, almacenaje)" },
      { id: "turno_retiro", label: "Turno de retiro de terminal / depósito reservado" },
      { id: "gate_pass", label: "Gate pass / pase de puerta obtenido (si aplica)" },
      { id: "transporte", label: "Transporte a destino coordinado" },
      { id: "entregado", label: "Mercadería entregada" },
    ],
  },
  {
    id: "cierre",
    label: "Cierre de carpeta",
    guia: "Facturá honorarios y gastos de despacho, controlá que el contenedor vacío se devuelva en fecha (la carta de garantía compromete a devolverlo; pasada la fecha corre demurrage) y conciliá el adelanto con los gastos reales. Entregá la documentación al cliente y archivá la carpeta (digitalización y guarda 5 años): el despachante es depositario fiel.",
    estadoCliente: ESTADO_ENTREGADA,
    subtareas: [
      { id: "facturacion", label: "Honorarios y gastos de despacho facturados" },
      { id: "contenedor_devuelto", label: "Contenedor vacío devuelto en fecha (evita demurrage)" },
      { id: "conciliacion", label: "Adelanto conciliado con gastos reales" },
      { id: "entrega_doc", label: "Documentación entregada al cliente" },
      { id: "archivo", label: "Carpeta archivada (digitalización y guarda 5 años)" },
    ],
  },
];

/* Overrides de texto y subtareas para exportación (misma estructura de etapas,
 * distinto vocabulario y tareas). El alcance del despachante de exportación
 * llega hasta poner la mercadería A BORDO con el permiso de embarque
 * oficializado, y luego el CUMPLIDO de embarque que cierra la destinación. */
const EXPO_OVERRIDES: Record<string, Partial<EtapaDef>> = {
  embarque: {
    label: "Transporte y embarque",
    guia: "Contratá / coordiná el transporte internacional según el Incoterm y emití el documento de transporte (BL / AWB / CRT). En grupo C/D el flete (y a veces el seguro) corre por el exportador.",
    subtareas: [
      { id: "transporte", label: "Documento de transporte (BL / AWB / CRT) emitido" },
      { id: "aviso_arribo", label: "Booking / aviso de embarque confirmado" },
      { id: "bl_liberado", label: "BL emitido (cargado a bordo)" },
    ],
  },
  liquidacion: {
    label: "Derechos de exportación y pago",
    guia: "Determiná el valor FOB (base imponible). Liquidá el DERECHO DE EXPORTACIÓN (retención) según la NCM y calculá el REINTEGRO que le corresponde al exportador (se cobra después del cumplido). Armá el COSTO de exportar hasta a bordo (retención + honorarios + gastos en origen). Si la posición tributa, generá y confirmá el pago de la retención antes de oficializar el permiso de embarque. El reintegro NO es parte del costo: es un recupero posterior.",
    subtareas: [
      { id: "fob", label: "Valor FOB (base imponible) determinado" },
      { id: "derecho_exportacion", label: "Derecho de exportación (retención) liquidado" },
      { id: "reintegro", label: "Reintegro calculado (recupero posterior al cumplido)" },
      { id: "costo_total", label: "Costo de exportar confirmado con el cliente" },
      { id: "vep", label: "VEP de derechos de exportación generado (si tributa)" },
      { id: "pago", label: "Pago de la retención confirmado (si corresponde)" },
    ],
  },
  oficializacion: {
    label: "Permiso de embarque (oficialización)",
    guia: "Armá y revisá la carátula del PERMISO DE EMBARQUE y oficializalo en SIM (Malvina). Verificá datos del comprador del exterior, NCM, valor FOB, cantidades y el régimen. Una vez oficializado no se corrige fácil.",
    subtareas: [
      { id: "caratula", label: "Carátula del permiso de embarque armada y revisada" },
      { id: "oficializada", label: "Permiso de embarque oficializado en SIM" },
    ],
  },
  verificacion: {
    label: "Verificación / Autorización de embarque",
    guia: "Según el canal asignado: verde libra directo; naranja presentás la documentación; rojo coordinás la verificación física con Aduana en zona primaria antes de autorizar el embarque. Obtené la autorización de embarque.",
    subtareas: [
      { id: "presentacion", label: "Documentación presentada (naranja)" },
      { id: "fisica", label: "Verificación física en zona primaria coordinada (rojo)" },
      { id: "autorizacion_embarque", label: "Autorización de embarque obtenida" },
    ],
  },
  retiro: {
    label: "Embarque (mercadería a bordo)",
    guia: "Coordiná el ingreso de la mercadería a ZONA PRIMARIA (terminal/depósito de exportación), pagá los gastos de origen (terminal/THC, consolidación) y confirmá el EMBARQUE: la mercadería queda a bordo del medio de transporte. Acá termina nuestro alcance operativo.",
    subtareas: [
      { id: "zona_primaria", label: "Ingreso a zona primaria / terminal de exportación" },
      { id: "gastos_origen", label: "Gastos en origen pagados (terminal/THC, consolidación)" },
      { id: "embarcado", label: "Mercadería embarcada / a bordo" },
      { id: "doc_transporte", label: "Documento de transporte emitido (BL / AWB / CRT)" },
    ],
  },
  cierre: {
    label: "Cumplido y cierre",
    guia: "Gestioná el CUMPLIDO DE EMBARQUE: el transportista confirma lo efectivamente cargado y la Aduana cierra el permiso de embarque. Facturá honorarios y gastos, entregá la documentación al cliente y dejá encaminado el cobro del reintegro y la liquidación de divisas. Archivá la carpeta (guarda 5 años).",
    subtareas: [
      { id: "cumplido", label: "Cumplido de embarque gestionado (cierra el permiso)" },
      { id: "facturacion", label: "Honorarios y gastos de despacho facturados" },
      { id: "reintegro_tramite", label: "Reintegro y liquidación de divisas encaminados" },
      { id: "entrega_doc", label: "Documentación de exportación entregada al cliente" },
      { id: "archivo", label: "Carpeta archivada (guarda 5 años)" },
    ],
  },
};

export function esExportacion(tipo: string | null | undefined): boolean {
  return (tipo ?? "").toLowerCase().startsWith("exp");
}

/** Contexto que hace variable el paso a paso (del pedido de compra y la vía). */
export type EtapasOpts = {
  /** Incoterm 2020 (EXW, FOB, CIF, DAP, DDP…). Define el reparto de tareas. */
  incoterm?: string | null;
  /** Vía: marítima (BL) / aérea (AWB) / terrestre (CRT). */
  via?: string | null;
  /** Liberación del documento de transporte: "original" / "telex" / "waybill". */
  liberacion?: string | null;
  /** Forma de pago (anticipado, cuenta abierta, cobranza, carta de crédito): define cuándo se libera el BL. */
  formaPago?: string | null;
};

function metaIncotermDe(incoterm?: string | null): IncotermMeta | null {
  const v = (incoterm ?? "").trim().toUpperCase();
  if (!v) return null;
  const inc = INCOTERMS.find((i) => i.value === v);
  return inc ? incotermMeta(inc) : null;
}

/** Nombre del documento de transporte según la vía. */
function docTransporteNombre(via?: string | null): string {
  const v = (via ?? "").toLowerCase();
  if (v.startsWith("aer")) return "AWB";
  if (v.startsWith("terr")) return "CRT";
  if (v.startsWith("mar")) return "BL";
  return "BL / AWB / CRT";
}

/** Nombre legible de la vía (para la guía). */
function viaLabel(via?: string | null): string | null {
  const v = (via ?? "").toLowerCase();
  if (v.startsWith("aer")) return "aérea";
  if (v.startsWith("terr")) return "terrestre";
  if (v.startsWith("mar")) return "marítima";
  return null;
}

function esViaMaritima(via?: string | null): boolean {
  const v = (via ?? "").toLowerCase();
  return v === "" || v.startsWith("mar"); // sin vía asumimos marítima
}

/** Reemplaza/inserta sub-tareas de una etapa según Incoterm, vía y forma de pago. */
function adaptarEtapa(
  e: EtapaDef,
  esImpo: boolean,
  meta: IncotermMeta | null,
  fp: FormaPagoMeta,
  opts: EtapasOpts,
): EtapaDef {
  const doc = docTransporteNombre(opts.via);
  const aerea = (opts.via ?? "").toLowerCase().startsWith("aer");
  const terrestre = (opts.via ?? "").toLowerCase().startsWith("terr");

  // APERTURA: la BASE son los datos que cargó el cliente (tipo, vía, forma de
  // pago, país, mercadería, estado). El documento/IA agrega el Incoterm y se
  // CRUZA con esa base: si coincide, se sigue; si difiere, se reordenan los pasos.
  if (e.id === "apertura") {
    const yaCargo: string[] = [esImpo ? "Importación" : "Exportación"];
    const via = viaLabel(opts.via);
    if (via) yaCargo.push(`vía ${via}`);
    if (fp.categoria !== "desconocido") yaCargo.push(`pago ${fp.label}`);

    let guia = `BASE = lo que ya cargó el cliente: ${yaCargo.join(" · ")} (más país, mercadería y estado nuevo/usado). Con eso solo ya tenés el primer borrador del paso a paso y orientás NCM, intervenciones y certificado de origen. `;
    guia += meta
      ? `Incoterm declarado: ${(opts.incoterm ?? "").trim().toUpperCase()}. `
      : "Falta el Incoterm: sale del pedido / proforma / factura (decide si seguimos desde origen, EXW/FCA). ";
    guia +=
      "Si todavía no subió la factura, pedila (con el pedido o la proforma ya abrís la carpeta). Cuando llegue la factura, corré la IA: la analiza y la CRUZA con lo que cargó el cliente. Dos caminos: (1) coincide → confirmás y seguís; (2) hay diferencias (se confundió o la factura cambia vía / Incoterm / pago / mercadería) → corregís los datos y los pasos se reordenan solos. Revisá y aplicá tipo, vía, forma de pago e Incoterm antes de avanzar. De acá sale la COTIZACIÓN PRELIMINAR.";
    return { ...e, guia };
  }

  // DOCUMENTACIÓN: trabajo documental/clasificación. Los subtareas son fijos
  // (no varían por vía); solo ajustamos la guía en exportación.
  if (e.id === "documentacion") {
    if (!esImpo) {
      return {
        ...e,
        guia:
          "Definí la NCM de exportación, revisá intervenciones y el certificado de origen para el comprador del exterior. El transporte y el embarque se trabajan en la etapa siguiente.",
      };
    }
    return e;
  }

  if (e.id === "embarque" && esImpo) {
    let subtareas: SubTarea[] = e.subtareas.map((s) => {
      if (s.id === "transporte") {
        return { ...s, label: `Documento de transporte (${doc})` };
      }
      if (s.id === "aviso_arribo") {
        return {
          ...s,
          label: aerea ? "Aviso de llegada recibido" : "Aviso de arribo recibido",
        };
      }
      if (s.id === "bl_liberado") {
        return {
          ...s,
          label: aerea
            ? "Guía aérea liberada (aviso de llegada)"
            : terrestre
              ? "CRT / carga liberada en frontera"
              : "BL liberado / Orden de entrega obtenida",
        };
      }
      if (s.id === "adelanto") {
        return { ...s, label: labelPagoLogistica(fp) };
      }
      return s;
    });

    // Terrestre (ATIT): el TRÁNSITO aduanero se ampara con el MIC/DTA electrónico
    // (SINTIA), que lleva la CRT asociada y declara en el campo 40 la RUTA y el
    // plazo. La Aduana de origen precinta la unidad; al arribo se verifica el
    // precinto íntegro y se pesa el camión (peso bruto vs. lo declarado).
    if (terrestre) {
      const idx = subtareas.findIndex((s) => s.id === "transporte");
      const extra: SubTarea[] = [
        {
          id: "mic_dta",
          label:
            "MIC/DTA en SINTIA (tránsito aduanero): CRT asociada + ruta y plazo declarados (campo 40)",
        },
        {
          id: "precinto",
          label:
            "Precinto aduanero: colocado en origen y verificado ÍNTEGRO al arribo (si está violado → acta y verificación)",
        },
        {
          id: "pesaje",
          label:
            "Pesaje en báscula: peso bruto del camión controlado contra lo declarado (CRT / packing); diferencias relevantes = alerta",
        },
      ];
      if (idx >= 0) subtareas.splice(idx + 1, 0, ...extra);
      else subtareas.push(...extra);
    }

    // Transbordo (marítimo): si la carga transborda en un puerto intermedio, el
    // transportista emite una declaración de trasbordo para la Aduana (la ruta
    // efectiva). No siempre aplica, por eso queda como control opcional.
    if (esViaMaritima(opts.via)) {
      const idx = subtareas.findIndex((s) => s.id === "transporte");
      const extra: SubTarea = {
        id: "transbordo",
        label:
          "Transbordo (si aplica): declaración de trasbordo del transportista (ruta efectiva a la Aduana)",
      };
      if (idx >= 0) subtareas.splice(idx + 1, 0, extra);
      else subtareas.push(extra);
    }

    // Origen a cargo del importador (EXW/FCA): coordinación previa al embarque.
    if (meta?.seguimientoOrigen) {
      const origen: SubTarea[] = meta.despachoExportacionImportador
        ? [
            { id: "origen_retiro", label: "Retiro en fábrica / origen coordinado (EXW)" },
            { id: "origen_export", label: "Despacho de EXPORTACIÓN en origen gestionado (EXW)" },
            { id: "origen_transporte", label: "Transporte en origen hasta la terminal de embarque" },
          ]
        : [
            { id: "origen_retiro", label: "Retiro / entrega al transportista en origen coordinado (FCA)" },
            { id: "origen_transporte", label: "Transporte en origen hasta la terminal de embarque" },
          ];
      subtareas = [...origen, ...subtareas];
    }

    // Forma de pago: intervención bancaria (cobranza / carta de crédito).
    if (fp.liberaBanco) {
      const idx = subtareas.findIndex((s) => s.id === "bl_liberado");
      let labelBanco: string;
      if (fp.categoria === "carta_credito") {
        labelBanco = aerea
          ? "Carta de liberación del banco (presentación conforme · L/C · consignación AWB al banco)"
          : terrestre
            ? "Documentos comerciales levantados en el banco (L/C · carta de liberación para CRT)"
            : "Documentos levantados en el banco (presentación conforme · carta de crédito · BL original)";
      } else if (fp.cobranzaSubtipo === "da") {
        labelBanco = aerea
          ? "Carta de liberación del banco (aceptación D/A · consignación AWB al banco)"
          : terrestre
            ? "Documentos levantados en el banco (aceptación D/A · CRT en frontera)"
            : "Documentos levantados en el banco (aceptación D/A · BL original)";
      } else {
        labelBanco = aerea
          ? "Carta de liberación del banco (pago D/P · consignación AWB al banco)"
          : terrestre
            ? "Documentos levantados en el banco (pago D/P · CRT en frontera)"
            : "Documentos levantados en el banco (pago D/P · BL original)";
      }
      const extra: SubTarea = { id: "banco_docs", label: labelBanco };
      if (idx >= 0) subtareas.splice(idx, 0, extra);
      else subtareas.push(extra);
    }

    // Consignación al banco (AWB/CRT): verificar antes del embarque.
    if ((aerea || terrestre) && fp.liberaBanco) {
      const idxEmb = subtareas.findIndex((s) => s.id === "transporte");
      const extra: SubTarea = {
        id: "consignacion_banco",
        label: aerea
          ? "Consignación AWB al banco emisor confirmada (antes del vuelo)"
          : "Consignatario en CRT verificado (banco vs importador)",
      };
      if (idxEmb >= 0) subtareas.splice(idxEmb, 0, extra);
      else subtareas.unshift(extra);
    }

    // BL original a canjear (sólo marítimo + cobranza/L/C): hay que recibirlo del exterior.
    if (esViaMaritima(opts.via) && blEsOriginal(opts.liberacion, fp)) {
      const idx = subtareas.findIndex((s) => s.id === "bl_liberado");
      const extra: SubTarea = {
        id: "bl_original",
        label: "BL original recibido del exterior (canje)",
      };
      if (idx >= 0) subtareas.splice(idx, 0, extra);
      else subtareas.push(extra);
    }

    subtareas = ordenarSubtareasEmbarque(subtareas);

    // Guía según vía, forma de pago y liberación del transporte.
    let guia = guiaEmbarqueImportacion(
      {
        via: opts.via,
        formaPago: opts.formaPago,
        liberacion: opts.liberacion,
      },
      fp,
    );
    if (meta?.seguimientoOrigen) {
      guia +=
        meta.despachoExportacionImportador
          ? " OJO: Incoterm EXW → el origen lo hacemos nosotros (retiro, despacho de exportación y transporte hasta la terminal). Cargá esos costos y seguí cada paso."
          : " OJO: Incoterm FCA → coordinamos el transporte en origen hasta el transportista (la exportación la despacha el vendedor).";
    } else if (meta?.entregaEnDestino) {
      guia +=
        " Incoterm de grupo D: el vendedor entrega en destino (flete y seguro ya en el precio); la coordinación de naviera es mínima, enfocate en la importación.";
    }
    return { ...e, subtareas, guia };
  }

  // EXPORTACIÓN: el reparto se invierte. En grupo C/D el EXPORTADOR contrata el
  // transporte internacional (más trabajo nuestro); en EXW/FCA/FOB lo hace el
  // comprador del exterior.
  if (e.id === "embarque" && !esImpo) {
    let subtareas: SubTarea[] = e.subtareas.map((s) => {
      if (s.id === "transporte") {
        return { ...s, label: `Documento de transporte (${doc}) emitido` };
      }
      if (s.id === "aviso_arribo") {
        return { ...s, label: "Booking / aviso de embarque confirmado" };
      }
      if (s.id === "bl_liberado") {
        return {
          ...s,
          label: aerea
            ? "AWB emitida (carga aceptada)"
            : terrestre
              ? "CRT emitida"
              : "BL emitido (cargado a bordo)",
        };
      }
      return s;
    });

    // Terrestre (ATIT): el tránsito de exportación se ampara con el MIC/DTA
    // (SINTIA), con la CRT asociada y la ruta/plazo (campo 40). La Aduana de
    // salida precinta la unidad tras pesarla (peso bruto vs. lo declarado).
    if (terrestre) {
      const idx = subtareas.findIndex((s) => s.id === "transporte");
      const extra: SubTarea[] = [
        {
          id: "mic_dta",
          label:
            "MIC/DTA en SINTIA (tránsito de exportación): CRT asociada + ruta y plazo declarados (campo 40)",
        },
        {
          id: "pesaje",
          label:
            "Pesaje en báscula: peso bruto del camión controlado contra lo declarado (CRT / packing)",
        },
        {
          id: "precinto",
          label: "Precinto aduanero colocado en la unidad por la Aduana de salida",
        },
      ];
      if (idx >= 0) subtareas.splice(idx + 1, 0, ...extra);
      else subtareas.push(...extra);
    }

    const internacional: SubTarea[] = [];
    const grupoCD = meta?.grupo === "C" || meta?.grupo === "D";
    if (grupoCD) {
      internacional.push({
        id: "flete_internacional",
        label: "Flete internacional contratado y reservado (a cargo del exportador)",
      });
    }
    if (meta?.seguroObligatorioVendedor) {
      internacional.push({
        id: "seguro_internacional",
        label: "Seguro internacional contratado (a cargo del exportador)",
      });
    }
    if (meta?.entregaEnDestino) {
      internacional.push({
        id: "entrega_destino",
        label: "Entrega en destino coordinada (grupo D)",
      });
    }
    if (meta?.grupo === "E") {
      internacional.push({
        id: "retiro_planta",
        label: "Retiro del comprador en planta coordinado (EXW)",
      });
    }
    if (internacional.length) {
      const idx = subtareas.findIndex((s) => s.id === "transporte");
      if (idx >= 0) subtareas = [...subtareas.slice(0, idx), ...internacional, ...subtareas.slice(idx)];
      else subtareas = [...internacional, ...subtareas];
    }

    let guia =
      "Coordiná el transporte internacional y emití el documento de transporte. " +
      (aerea
        ? "El documento es la GUÍA AÉREA (AWB)."
        : terrestre
          ? "El documento comercial es el CRT (carta de porte Mercosur) y el tránsito se ampara con el MIC/DTA electrónico (SINTIA), con la CRT asociada y la ruta y el plazo (campo 40); lo registra el ATA. Antes de la salida, la Aduana pesa la unidad (báscula) y la precinta."
          : "El documento es el BL.");
    if (meta?.grupo === "E") {
      guia += " Incoterm EXW: el comprador retira en planta y se hace cargo del transporte; nosotros coordinamos la carga y el despacho de exportación.";
    } else if (meta?.grupo === "F") {
      guia += " Incoterm de grupo F (FCA/FAS/FOB): el comprador contrata el transporte internacional; nosotros entregamos al transportista / a bordo.";
    } else if (meta?.grupo === "C") {
      guia += " Incoterm de grupo C (CFR/CIF/CPT/CIP): el EXPORTADOR contrata y paga el flete internacional" + (meta.seguroObligatorioVendedor ? " y el seguro" : "") + "; sumalos y seguilos.";
    } else if (meta?.grupo === "D") {
      guia += " Incoterm de grupo D (DAP/DPU/DDP): el EXPORTADOR lleva la mercadería hasta destino; coordinamos flete, seguro y entrega final" + (meta.importacionVendedor ? " e incluso la importación en destino (DDP)" : "") + ".";
    }
    return { ...e, subtareas, guia };
  }

  if (e.id === "retiro") {
    const subtareas = e.subtareas.map((s) => {
      if (s.id === "gastos_terminal") {
        return {
          ...s,
          label: aerea
            ? "Gastos de depósito fiscal aéreo pagados"
            : terrestre
              ? "Gastos de depósito fiscal pagados"
              : "Gastos de terminal pagados (THC, ZAP, almacenaje)",
        };
      }
      return s;
    });
    return { ...e, subtareas };
  }

  if (e.id === "liquidacion" && meta?.importacionVendedor) {
    return {
      ...e,
      guia:
        e.guia +
        " Incoterm DDP: los tributos los paga el vendedor; confirmá quién figura como importador y qué gastos quedan realmente a cargo del cliente.",
    };
  }

  return e;
}

/** Lista de etapas internas según el tipo de operación, Incoterm y vía. */
export function etapasDe(
  tipo: string | null | undefined,
  opts?: EtapasOpts,
): EtapaDef[] {
  const esImpo = !esExportacion(tipo);
  const base = esImpo
    ? ETAPAS_IMPO
    : ETAPAS_IMPO.map((e) => {
        const ov = EXPO_OVERRIDES[e.id];
        return ov ? { ...e, ...ov } : e;
      });
  if (!opts) return base;
  const meta = metaIncotermDe(opts.incoterm);
  const fp = formaPagoMeta(opts.formaPago, opts.via);
  return base.map((e) => adaptarEtapa(e, esImpo, meta, fp, opts));
}

export const ETAPA_INICIAL = ETAPAS_IMPO[0].id;
export const ETAPA_IDS = ETAPAS_IMPO.map((e) => e.id);

/**
 * Etapas que ya no existen y a dónde se mapean (para operaciones viejas).
 * "clasificacion" se fusionó dentro de "documentacion".
 */
const MIGRACION_ETAPAS: Record<string, string> = {
  clasificacion: "documentacion",
  /** El pago del VEP se unificó con la liquidación de tributos. */
  pago: "liquidacion",
  /** El canal de selectividad se unificó con la oficialización en SIM. */
  canal: "oficializacion",
};

/** Normaliza una etapa vieja a su equivalente actual. */
export function normalizarEtapa(etapaId: string | null): string {
  const id = etapaId ?? "";
  return MIGRACION_ETAPAS[id] ?? id;
}

export function etapaIndex(etapaId: string | null): number {
  const i = ETAPA_IDS.indexOf(normalizarEtapa(etapaId));
  return i < 0 ? 0 : i;
}

export function esEtapaValida(etapaId: string): boolean {
  return ETAPA_IDS.includes(normalizarEtapa(etapaId));
}

export function etapaDef(
  etapaId: string | null,
  tipo: string | null | undefined,
): EtapaDef {
  return etapasDe(tipo)[etapaIndex(etapaId)];
}

/** Estado simple (para el cliente) que corresponde a una etapa interna. */
export function estadoClienteDeEtapa(etapaId: string | null): string {
  return ETAPAS_IMPO[etapaIndex(etapaId)].estadoCliente;
}

/** Mapea los estados viejos (5 estados clásicos) a la nueva etapa interna. */
export function etapaDesdeEstadoViejo(estado: string | null): string | null {
  switch (estado) {
    case "Nueva operación":
      return "apertura";
    case "Documentación":
      return "documentacion";
    case "Canal":
      return "oficializacion";
    case "Liberada":
      return "retiro";
    case "Finalizada":
      return "cierre";
    default:
      return null;
  }
}

/* ───────────────────────────── Checklist ───────────────────────────── */

export type ChecklistMarca = { at: string; by: string | null };
export type ChecklistEstado = Record<string, ChecklistMarca>;

export function parseChecklist(raw: string | null): ChecklistEstado {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as unknown;
    if (obj && typeof obj === "object") {
      return migrarClavesChecklist(obj as ChecklistEstado);
    }
  } catch {
    /* ignorar JSON inválido */
  }
  return {};
}

/** Reescribe claves de etapas fusionadas (ej. pago.vep → liquidacion.vep). */
function migrarClavesChecklist(estado: ChecklistEstado): ChecklistEstado {
  const out: ChecklistEstado = {};
  for (const [clave, marca] of Object.entries(estado)) {
    const punto = clave.indexOf(".");
    const etapa = punto >= 0 ? clave.slice(0, punto) : clave;
    const sub = punto >= 0 ? clave.slice(punto + 1) : "";
    const etapaNueva = MIGRACION_ETAPAS[etapa] ?? etapa;
    const claveNueva = sub ? `${etapaNueva}.${sub}` : etapaNueva;
    if (!out[claveNueva]) out[claveNueva] = marca;
  }
  return out;
}

/** Clave única de una sub-tarea dentro de la operación: "<etapa>.<subtarea>". */
export function claveSubtarea(etapaId: string, subId: string): string {
  return `${etapaId}.${subId}`;
}

/* ─────────────────── Agrupación visual de sub-tareas ─────────────────── */

export type GrupoSubtareas = { label: string | null; subtareas: SubTarea[] };

/**
 * Devuelve las sub-tareas de una etapa en un único bloque sin encabezado. El
 * trabajo documental y el de transporte/arribo, que antes convivían en la misma
 * etapa, ahora son DOS etapas distintas ("documentacion" y "embarque"), así que
 * ya no hace falta agrupar visualmente dentro de una etapa.
 */
export function gruposDeEtapa(etapa: EtapaDef): GrupoSubtareas[] {
  return [{ label: null, subtareas: etapa.subtareas }];
}

/** Cuántas sub-tareas de una etapa están completas. */
export function progresoEtapa(
  etapa: EtapaDef,
  checklist: ChecklistEstado,
): { hechas: number; total: number } {
  const total = etapa.subtareas.length;
  let hechas = 0;
  for (const s of etapa.subtareas) {
    if (checklist[claveSubtarea(etapa.id, s.id)]) hechas++;
  }
  return { hechas, total };
}
