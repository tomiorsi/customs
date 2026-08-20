/**
 * La cadena completa, desde una operación del sistema.
 *
 * Las otras pruebas del pre-SIM parten de un archivo real y lo reconstruyen:
 * eso demuestra que el mapeo es invertible, pero no que una carpeta cargada en
 * la plataforma salga bien. Esta empieza donde empieza el trabajo de verdad —
 * una operación— y la lleva hasta el archivo validado.
 *
 *     operación → OperacionSim → declaración → validación → texto
 *
 * Además prueba lo contrario, que importa igual: que una operación incompleta
 * **no** produzca un archivo, y que diga qué falta en vez de rellenarlo.
 *
 * Uso: npx tsx --require ./scripts/register-server-only-stub.cjs \
 *        scripts/presim-pruebas-cadena.mjs
 */
import { armarDeclaracion } from "../src/lib/presim/armar.ts";
import { escribirDeclaracion } from "../src/lib/presim/archivo.ts";
import { operacionSimDesde, situacionDeArribo } from "../src/lib/presim/desde-operacion.ts";
import { resumirHallazgos, validarDeclaracion } from "../src/lib/presim/validar.ts";

let fallas = 0;
const chequear = (nombre, ok, detalle = "") => {
  if (!ok) fallas++;
  console.log(`   ${ok ? "✓" : "✗"} ${nombre.padEnd(52)} ${detalle}`);
};

/** Una carpeta como la carga el estudio. Datos inventados, formato real. */
const OPERACION = {
  id: "op-1",
  ref: "IMP-2026-0001",
  tipo: "importacion",
  destinacion: "impo_consumo",
  aduana: "001",
  client_cuit: "30500001234",
  // La DJ del importador vive en su ficha y se repite en todas sus carpetas.
  client_domicilio_establecimiento: "ALFEREZ BOUCHARD 4191 (1605) MUNRO, BS.AS.",
  client_inicio_actividad: "1997-06-01",
  // El del proveedor cambia con cada operación. Formato del país, sin validar.
  idtrib_proveedor: "913307825739954632",
  incoterm: "CFR",
  // `DOL`, no `002`: el código numérico del dólar venció el 11/01/2024 y el
  // vigente es alfabético. Lo cacé escribiendo esta prueba con el viejo.
  moneda: "DOL",
  valor_fob: "60192.00",
  flete: "4686.80",
  seguro: "648.79",
  contraparte: "PROVEEDOR DEL EXTERIOR SA",
  ncm: "1513.19.00.000P",
  unidad: "Kilogramos",
  cantidad: "22800.00",
  peso_neto: "22800.00",
  peso_bruto: "23100.00",
  bultos: "12",
  tipo_embalaje: "BULTOS",
  marca: "S/M",
  pais_origen: "Brasil",
  pais_procedencia: "Brasil",
  nro_factura: "AR1-26008",
  transporte_doc_nro: "MSCU1234567",
  eta: "2026-07-01",
  contenedor: "MSCU1234567",
};

/* ── 1. la cadena entera ── */

console.log("1. De la operación al archivo\n");

const { operacion, faltantes } = operacionSimDesde(OPERACION, {
  cuitDespachante: "30710308043",
});

chequear("la operación se traduce entera", faltantes.length === 0, faltantes.map((f) => `${f.campo}: ${f.porque}`).join(" · "));
chequear("devuelve una operación del SIM", operacion !== null);

if (operacion) {
  console.log(`       subrégimen elegido: ${operacion.subregimen}`);
  chequear("con documento de transporte y arribo pasado → IC04", operacion.subregimen === "IC04");
  chequear("la unidad se tradujo a código", operacion.items[0].unidad === "01", `Kilogramos → ${operacion.items[0].unidad}`);
  chequear("el país se tradujo a código", operacion.items[0].paisOrigen === "203", `Brasil → ${operacion.items[0].paisOrigen}`);
  chequear("la fecha va en formato del SIM", operacion.arriboTransporte === "01/07/2026", operacion.arriboTransporte);

  const d = armarDeclaracion(operacion);
  const h = validarDeclaracion(d);
  const r = resumirHallazgos(h);
  chequear("la declaración armada no tiene errores", r.errores === 0, `${r.errores} error(es), ${r.avisos} aviso(s)`);
  for (const x of h) console.log(`       [${x.nivel}] ${x.seccion}/${x.nart} ${x.clave}: ${x.detalle}`);

  const texto = escribirDeclaracion(d);
  chequear("el archivo se escribe", texto.includes("[DDT]") && texto.endsWith("\n"), `${texto.split("\n").length} líneas`);
  chequear("lleva el subrégimen y la posición", texto.includes("ISTA=IC04") && texto.includes("IESPNCE=1513.19.00.000P"));
  chequear("los sufijos salen armados", texto.includes("CSBTSVL=AA(S/M)-"));

  // Los tres complementarios de cabecera están en los 13 despachos de
  // importación del archivo, sin excepción: si no salen, el archivo está
  // incompleto aunque valide.
  chequear(
    "sale el domicilio del establecimiento",
    texto.includes("CCPL=DOMICIL.ESTABLEC") &&
      texto.includes("MCPL=ALFEREZ BOUCHARD 4191 (1605) MUNRO, BS.AS."),
  );
  chequear(
    "sale el inicio de actividades en formato del SIM",
    texto.includes("CCPL=FECHA INIC.ACTIV") && texto.includes("MCPL=01/06/1997"),
  );
  chequear(
    "sale el ID tributario del proveedor tal cual",
    texto.includes("CCPL=IDTRIB-PROVEEDOR") && texto.includes("MCPL=913307825739954632"),
  );
  chequear(
    "los tres van en cabecera y como dato declarado",
    texto.split("[CPL]").length === 4 &&
      !/\[CPL\][^[]*ICPLDIF=S/.test(texto) &&
      !/\[CPL\][^[]*NART=(?!0000)/.test(texto),
  );
}

/* ── 1 bis. la misma carpeta, pero de exportación ── */

console.log("\n1 bis. Exportación: no declara lo mismo\n");

const EXPORTACION = {
  ...OPERACION,
  destinacion: "expo_consumo",
  pais_destino: "Brasil",
  contraparte: "GERALD MC DONALD & COMPANY LTD.",
  lugar_mercaderia_736: "CAPITAN CORTES - CABA",
  gastos_origen: null,
  comision_exterior: null,
  // El transporte, que la exportación declara en cabecera y la importación no.
  aduana_salida: "001",
  medio_transporte: "maritima",
  cuit_transportista: "30-69318494-7",
  identificacion_medio: "MSC LORETO",
  bandera_medio: "Liberia",
};

const expo = operacionSimDesde(EXPORTACION, { cuitDespachante: "30710308043" });
chequear("la exportación se traduce entera", expo.faltantes.length === 0, expo.faltantes.map((f) => `${f.campo}: ${f.porque}`).join(" · "));
chequear("elige subrégimen de exportación", expo.operacion?.subregimen === "EC01", expo.operacion?.subregimen ?? "");

if (expo.operacion) {
  const texto = escribirDeclaracion(armarDeclaracion(expo.operacion));
  chequear("sale el lugar del art. 736", texto.includes("CCPL=LUGAR-ART736CA") && texto.includes("MCPL=CAPITAN CORTES - CABA"));
  chequear("sin gastos anteriores declara 0", texto.includes("CCPL=GTOSANT736CA") && /CCPL=GTOSANT736CA\nMCPL=0\n/.test(texto));
  chequear("la comisión al exterior va por ítem", /CCPL=COMISIONALEXT\nMCPL=0\nNART=0001/.test(texto));
  chequear("y el comprador también", texto.includes("CCPL=DATO-COMPRADOR") && texto.includes("MCPL=GERALD MC DONALD & COMPANY LTD."));

  // Lo que importa de verdad: que NO se cuele nada de importación. Los tres de
  // la DJ del importador están en 0 de 8 exportaciones del archivo.
  // El medio sale de `cod_via.csv`, del lado de Sintia: la tabla no está en el
  // Kit. Marítima → 8 (ACUATICO), que es el que las declaraciones reales usan
  // con bandera de buque.
  chequear("la vía se tradujo a medio del SIM", texto.includes("CDDTMDETRN=8"), "marítima → 8");
  chequear("el CUIT del transportista va sin guiones", texto.includes("CDDTTRANSP=30693184947"));
  chequear("el buque va en su campo", texto.includes("NDDTIMMTRN=MSC LORETO"));
  chequear("la bandera se tradujo a código de país", texto.includes("CDDTPAYTRN=122"), "Liberia → 122");
  chequear("la aduana de salida también", texto.includes("CDDTBURDST=001"));

  chequear(
    "no se cuela ningún complementario de importación",
    !texto.includes("DOMICIL.ESTABLEC") &&
      !texto.includes("FECHA INIC.ACTIV") &&
      !texto.includes("IDTRIB-PROVEEDOR"),
  );
  const val = resumirHallazgos(validarDeclaracion(armarDeclaracion(expo.operacion)));
  chequear("la declaración de exportación valida", val.errores === 0, `${val.errores} error(es), ${val.avisos} aviso(s)`);
}

// Y al revés: una importación no lleva los de exportación.
chequear(
  "la importación no lleva los del art. 736",
  operacion !== null &&
    !escribirDeclaracion(armarDeclaracion(operacion)).includes("736") &&
    !escribirDeclaracion(armarDeclaracion(operacion)).includes("COMISIONALEXT"),
);

const expoSinLugar = operacionSimDesde({ ...EXPORTACION, lugar_mercaderia_736: null }, { cuitDespachante: "30710308043" });
chequear(
  "sin lugar de carga → avisa",
  expoSinLugar.faltantes.some((f) => f.campo === "Lugar donde está la mercadería"),
  expoSinLugar.faltantes.find((f) => f.campo === "Lugar donde está la mercadería")?.porque ?? "",
);

/* ── 1 ter. una carpeta con varios productos ── */

console.log("\n1 ter. Multi-ítem: los renglones de una carpeta real\n");

/**
 * Los cinco renglones del despacho 26001IC04003280 del archivo, con sus
 * valores y sus posiciones. Los importes de cabecera son los de esa
 * declaración, así que el prorrateo tiene que reproducir el flete y el seguro
 * que el despachante declaró en cada ítem — no un número parecido, el mismo.
 */
const RENGLONES = [
  { orden: 1, mercaderia: "CAJONES DE MADERA", ncm: "4415.10.00.190Y", unidad: "Unidades", cantidad: "1020,00", peso_neto: "157,46", valor: "3898,44" },
  { orden: 2, mercaderia: "GORROS", ncm: "6505.00.19.100L", unidad: "Unidades", cantidad: "30000,00", peso_neto: "349,88", valor: "8662,50" },
  { orden: 3, mercaderia: "PARAGUAS", ncm: "6601.91.10.100P", unidad: "Unidades", cantidad: "540,00", peso_neto: "70,99", valor: "1757,70" },
  { orden: 4, mercaderia: "VAJILLA DE CERAMICA", ncm: "6912.00.00.191F", unidad: "Kilogramos", cantidad: "7123,20", peso_neto: "7123,20", valor: "6239,92" },
  { orden: 5, mercaderia: "ARTICULOS DE HIERRO", ncm: "7324.10.00.100Q", unidad: "Unidades", cantidad: "100,00", peso_neto: "169,64", valor: "4200,00" },
];

const CARPETA = {
  ...OPERACION,
  pais_origen: "China",
  pais_procedencia: "China",
  valor_fob: "24758,56",
  flete: "1000,00",
  seguro: "245,80",
  items_json: JSON.stringify(RENGLONES),
};

const multi = operacionSimDesde(CARPETA, { cuitDespachante: "30710308043" });
chequear("la carpeta con 5 renglones se traduce entera", multi.faltantes.length === 0, multi.faltantes.map((f) => `${f.campo}: ${f.porque}`).join(" · "));
chequear("salen cinco ítems", multi.operacion?.items.length === 5, String(multi.operacion?.items.length));

if (multi.operacion) {
  const its = multi.operacion.items;
  chequear("cada ítem con su posición", its.map((i) => i.ncm).join(",") === RENGLONES.map((r) => r.ncm).join(","));
  chequear("y con su unidad, que no es la misma en todos", its[3].unidad === "01" && its[0].unidad === "07", `${its[0].unidad} … ${its[3].unidad}`);

  // Lo declarado por el despachante en el despacho real, ítem por ítem.
  const FLETE_REAL = [157.46, 349.88, 70.99, 252.03, 169.64];
  const SEGURO_REAL = [38.7, 86.0, 17.45, 61.95, 41.7];
  const FOB_REAL = [3898.44, 8662.5, 1757.7, 6239.92, 4200.0];
  chequear("el FOB de cada ítem es el del despacho real", its.every((it, i) => it.fob === FOB_REAL[i]), its.map((i) => i.fob).join(" "));
  chequear("el flete prorrateado da el del despacho real", its.every((it, i) => it.flete === FLETE_REAL[i]), its.map((i) => i.flete).join(" "));
  chequear("y el seguro también", its.every((it, i) => it.seguro === SEGURO_REAL[i]), its.map((i) => i.seguro).join(" "));

  const suma = (f) => Math.round(its.reduce((a, i) => a + (f(i) ?? 0), 0) * 100) / 100;
  chequear("los ítems cierran contra la cabecera", suma((i) => i.fob) === 24758.56 && suma((i) => i.flete) === 1000 && suma((i) => i.seguro) === 245.8, `${suma((i) => i.fob)} / ${suma((i) => i.flete)} / ${suma((i) => i.seguro)}`);

  const texto = escribirDeclaracion(armarDeclaracion(multi.operacion));
  chequear("el archivo lleva los cinco ítems", (texto.match(/\[ART\]/g) ?? []).length === 5);
  chequear("numerados en orden", texto.includes("NART=0001") && texto.includes("NART=0005"));
  const val = resumirHallazgos(validarDeclaracion(armarDeclaracion(multi.operacion)));
  chequear("la declaración de 5 ítems valida", val.errores === 0, `${val.errores} error(es), ${val.avisos} aviso(s)`);
}

// El peso no se estima: es lo único del renglón que no se puede derivar.
const sinPeso = JSON.parse(JSON.stringify(RENGLONES));
delete sinPeso[2].peso_neto;
const faltaPeso = operacionSimDesde({ ...CARPETA, items_json: JSON.stringify(sinPeso) }, { cuitDespachante: "30710308043" });
chequear(
  "un renglón sin peso no se inventa",
  faltaPeso.operacion === null && faltaPeso.faltantes.some((f) => f.campo.startsWith("Peso neto")),
  faltaPeso.faltantes.map((f) => f.campo).join(", "),
);

// Un renglón sin clasificar tampoco pasa: es el estado normal a mitad de carpeta.
const sinNcm = JSON.parse(JSON.stringify(RENGLONES));
delete sinNcm[1].ncm;
const faltaNcm = operacionSimDesde({ ...CARPETA, items_json: JSON.stringify(sinNcm) }, { cuitDespachante: "30710308043" });
chequear(
  "un renglón sin clasificar avisa cuál es",
  faltaNcm.operacion === null && faltaNcm.faltantes.some((f) => f.campo === "Posición NCM (GORROS)"),
  faltaNcm.faltantes.map((f) => f.campo).join(", "),
);

// Con un solo renglón nada cambia: se siguen leyendo los campos planos.
const uno = operacionSimDesde({ ...OPERACION, items_json: JSON.stringify([RENGLONES[0]]) }, { cuitDespachante: "30710308043" });
chequear(
  "con un solo producto se lee la carpeta como siempre",
  uno.operacion?.items.length === 1 && uno.operacion?.items[0].ncm === OPERACION.ncm,
  uno.operacion?.items[0].ncm ?? "",
);

/* ── 2. la situación de arribo ── */

console.log("\n2. Cómo se deduce la situación de arribo\n");

const hoy = new Date("2026-08-18");
chequear(
  "sin documento de transporte → sin_documento",
  situacionDeArribo({ transporte_doc_nro: null, eta: "2026-09-01" }, hoy) === "sin_documento",
);
chequear(
  "con documento y arribo futuro → directo a plaza",
  situacionDeArribo({ transporte_doc_nro: "BL-1", eta: "2026-09-01" }, hoy) === "directo_a_plaza",
);
chequear(
  "con documento y ya arribado → con documento",
  situacionDeArribo({ transporte_doc_nro: "BL-1", eta: "2026-07-01" }, hoy) === "con_documento",
);

/* ── 3. lo que falta se dice, no se rellena ── */

console.log("\n3. Una operación incompleta no produce archivo\n");

for (const [quitar, campoEsperado] of [
  ["client_cuit", "CUIT del cliente"],
  ["valor_fob", "Valor FOB"],
  ["ncm", "Posición NCM"],
  ["destinacion", "Destinación"],
]) {
  const rota = { ...OPERACION, [quitar]: null };
  const r = operacionSimDesde(rota, { cuitDespachante: "30710308043" });
  const lo = r.faltantes.some((f) => f.campo === campoEsperado);
  chequear(`sin ${quitar} → no emite y avisa`, r.operacion === null && lo, r.faltantes.map((f) => f.campo).join(", "));
}

// La DJ del importador y del proveedor: falta un dato, se dice cuál. A
// diferencia de los de arriba, estos NO frenan el archivo —la declaración se
// arma igual— pero quedan a la vista antes de emitir.
for (const [quitar, campoEsperado] of [
  ["client_domicilio_establecimiento", "Domicilio del establecimiento"],
  ["client_inicio_actividad", "Inicio de actividades"],
  ["idtrib_proveedor", "ID tributario del proveedor"],
]) {
  const sinDato = { ...OPERACION, [quitar]: null };
  const r = operacionSimDesde(sinDato, { cuitDespachante: "30710308043" });
  chequear(
    `sin ${quitar} → avisa y no lo inventa`,
    r.faltantes.some((f) => f.campo === campoEsperado) &&
      !(r.operacion?.complementarios ?? []).some((c) => !c.valor),
    r.faltantes.find((f) => f.campo === campoEsperado)?.porque ?? "",
  );
}

// Un país que no es un país: el caso del formulario de cotización.
const sinPais = operacionSimDesde({ ...OPERACION, pais_origen: "Otro país (extrazona)" }, { cuitDespachante: "30710308043" });
chequear(
  "«Otro país (extrazona)» no se traduce",
  sinPais.operacion === null && sinPais.faltantes.some((f) => f.campo === "País de origen"),
  sinPais.faltantes.find((f) => f.campo === "País de origen")?.porque ?? "",
);

// Una aduana escrita a mano que no existe.
const aduanaMal = operacionSimDesde({ ...OPERACION, aduana: "Puerto de Rosario" }, { cuitDespachante: "30710308043" });
chequear(
  "una aduana inventada no pasa",
  aduanaMal.operacion === null && aduanaMal.faltantes.some((f) => f.campo === "Aduana"),
  aduanaMal.faltantes.find((f) => f.campo === "Aduana")?.porque ?? "",
);

console.log(`\n${fallas === 0 ? "Todo en orden." : `${fallas} fallas.`}`);
process.exit(fallas === 0 ? 0 : 1);
