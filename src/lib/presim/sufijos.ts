import "server-only";

import fs from "node:fs";
import path from "node:path";

/**
 * El string de sufijos del subítem (`CSBTSVL`).
 *
 * Es un formato propio, con esta forma:
 *
 *     AA(S/M)-AI(RBD)-AJ(TAMBOR X 190 KG)-CA03-NA01-
 *
 * Las tres reglas salen de medir los 72.549 subítems reales de
 * `desp_subitems.csv`, no de suponerlas — y las tres se cumplen en el 100%:
 *
 * 1. Cierra con `-`. 72.549 de 72.549.
 * 2. Los sufijos van **ordenados alfabéticamente** por su clave de dos letras.
 *    72.549 a favor, ningún contraejemplo.
 * 3. Cada clave es de un solo tipo: o siempre texto entre paréntesis, o siempre
 *    un código de dos dígitos. De las 51 claves en uso, ninguna mezcla.
 *
 * El tipo no se hardcodea: sale de `cod_SUFIDOS.csv`, donde una clave de dos
 * caracteres (`AA` = MARCA) es texto libre y una de cuatro (`NA03` = "CON
 * POLIPROPILENO") es uno de los valores admitidos.
 */

/** Un sufijo declarado: texto libre o código de la tabla. */
export type Sufijo =
  | { clave: string; texto: string; codigo?: never }
  | { clave: string; codigo: string; texto?: never };

/** Qué admite una posición en un sufijo dado. */
export type SufijoDeCatalogo = {
  clave: string;
  /** `texto` acepta cualquier cosa; `codigo` solo los valores de `valores`. */
  tipo: "texto" | "codigo";
  /** Qué pide el SIM: MARCA, MODELO, TIPO DE ENVASE… */
  detalle: string;
  /** Para los codificados: código → qué significa. Vacío en los de texto. */
  valores: { codigo: string; detalle: string }[];
};

/* ─────────────────────────── formato ─────────────────────────── */

/** Una clave de sufijo son dos letras mayúsculas. */
const CLAVE = /^[A-Z]{2}$/;

/**
 * Texto → sufijos.
 *
 * Lo que no encaje en el formato se descarta en vez de adivinarle una forma:
 * un sufijo mal leído viaja al SIM como un dato inventado.
 */
export function parsearSufijos(s: string | null | undefined): Sufijo[] {
  const salida: Sufijo[] = [];
  for (const parte of (s ?? "").split("-")) {
    if (!parte) continue;
    const m = /^([A-Z]{2})(?:\((.*)\)|(\d{2}))$/.exec(parte.trim());
    if (!m) continue;
    salida.push(
      m[2] !== undefined
        ? { clave: m[1], texto: m[2] }
        : { clave: m[1], codigo: m[3] },
    );
  }
  return salida;
}

/**
 * Sufijos → texto, listo para `CSBTSVL`.
 *
 * Ordena y cierra con `-` porque así vienen todos los reales; el orden de
 * entrada no importa, para que quien llame no tenga que saberlo.
 */
export function armarSufijos(sufijos: Sufijo[]): string {
  const validos = sufijos.filter((x) => CLAVE.test(x.clave));
  if (!validos.length) return "";

  // Una clave repetida sería ambigua para el SIM: gana la última cargada, que
  // es lo que esperaría quien corrige un dato.
  const unicos = new Map<string, Sufijo>();
  for (const s of validos) unicos.set(s.clave, s);

  return (
    [...unicos.values()]
      .sort((a, b) => a.clave.localeCompare(b.clave, "en"))
      .map((s) => (s.texto !== undefined ? `${s.clave}(${s.texto})` : `${s.clave}${s.codigo}`))
      .join("-") + "-"
  );
}

/* ─────────────────────────── catálogo ─────────────────────────── */

const ARCHIVO = path.join(
  process.cwd(),
  "data",
  "Normas",
  "SIM",
  "sintia",
  "cod_SUFIDOS.csv",
);

type Fila = { sim: string; sufijo: string; detalle: string };

let catalogo: Map<string, Fila[]> | null = null;

function cargar(): Map<string, Fila[]> {
  if (catalogo) return catalogo;
  catalogo = new Map();
  let crudo: string;
  try {
    crudo = fs.readFileSync(ARCHIVO, "utf8");
  } catch {
    // Sin la tabla se sigue pudiendo armar y validar el formato del string;
    // lo único que se pierde es saber qué sufijos pide cada posición.
    return catalogo;
  }

  const lineas = crudo.split(/\r?\n/);
  lineas.shift();
  for (const linea of lineas) {
    if (!linea.trim()) continue;
    const campos = separarCsv(linea);
    if (campos.length < 4) continue;
    const [sim, sufijo, , detalle] = campos;
    const clave = sim.replace(/^﻿/, "").trimEnd();
    if (!clave || !sufijo.trim()) continue;
    const arr = catalogo.get(clave);
    const fila = { sim: clave, sufijo: sufijo.trim(), detalle: detalle.trim() };
    if (arr) arr.push(fila);
    else catalogo.set(clave, [fila]);
  }
  return catalogo;
}

/** CSV con comillas dobles, igual que en `tablas.ts`: son cuatro reglas. */
function separarCsv(linea: string): string[] {
  const out: string[] = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (comillas) {
      if (c === '"') {
        if (linea[i + 1] === '"') {
          campo += '"';
          i++;
        } else comillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') comillas = true;
    else if (c === ",") {
      out.push(campo);
      campo = "";
    } else campo += c;
  }
  out.push(campo);
  return out;
}

/**
 * Las claves con las que `SUFIDOS` indexa una posición, de la más específica a
 * la más general.
 *
 * El SIM rellena con espacios los niveles que no distingue: `7213.10.00.000` es
 * la posición exacta y `7213.  .  .` es toda la partida. Un sufijo declarado a
 * nivel partida aplica a todo lo que cuelga de ella, así que hay que mirar los
 * cuatro niveles y no solo el exacto.
 */
function clavesJerarquicas(ncm: string): string[] {
  const p = ncm.trim().slice(0, 14).split(".");
  if (p.length !== 4) return [];
  const [a, b, c, d] = p;
  return [
    `${a}.${b}.${c}.${d}`,
    `${a}.${b}.${c}.   `.trimEnd(),
    `${a}.${b}.  .   `.trimEnd(),
    `${a}.  .  .   `.trimEnd(),
  ];
}

/**
 * Qué sufijos pide una posición.
 *
 * **La tabla local está incompleta y hay que saberlo**: `cod_SUFIDOS.csv` cubre
 * 11.672 posiciones y el nomenclador tiene 33.172. Medido contra los subítems
 * reales, para el 51,7% de los casos no dice nada. Es el mismo cuadro que los
 * complementarios de `ZCP`: el catálogo completo lo baja el Kit del SIM.
 *
 * Por eso devolver vacío significa «no sé», nunca «no lleva sufijos», y quien
 * llame no debe tratar la lista vacía como una respuesta.
 */
export function sufijosDePosicion(ncm: string): SufijoDeCatalogo[] {
  const tabla = cargar();
  const porClave = new Map<string, SufijoDeCatalogo>();

  // De lo general a lo específico: si la partida y la posición definen la
  // misma clave, queda la definición de la posición.
  for (const nivel of clavesJerarquicas(ncm).reverse()) {
    for (const f of tabla.get(nivel) ?? []) {
      const clave = f.sufijo.slice(0, 2);
      if (!CLAVE.test(clave)) continue;
      const codigo = f.sufijo.length >= 4 ? f.sufijo.slice(2, 4) : null;

      let entrada = porClave.get(clave);
      if (!entrada) {
        entrada = {
          clave,
          tipo: codigo ? "codigo" : "texto",
          detalle: codigo ? "" : f.detalle,
          valores: [],
        };
        porClave.set(clave, entrada);
      }
      if (codigo) {
        entrada.tipo = "codigo";
        if (!entrada.valores.some((v) => v.codigo === codigo)) {
          entrada.valores.push({ codigo, detalle: f.detalle });
        }
      } else if (f.detalle) {
        entrada.detalle = f.detalle;
      }
    }
  }

  const salida = [...porClave.values()];
  for (const s of salida) s.valores.sort((a, b) => a.codigo.localeCompare(b.codigo, "en"));
  return salida.sort((a, b) => a.clave.localeCompare(b.clave, "en"));
}

/**
 * Controla un string de sufijos contra lo que la posición admite.
 *
 * Todo sale como **aviso**: la tabla local está incompleta, así que un sufijo
 * que no figura puede ser perfectamente válido. Frenar una emisión por eso
 * sería peor que dejarla pasar.
 */
export function revisarSufijos(
  ncm: string,
  texto: string | null | undefined,
): { clave: string; detalle: string }[] {
  const catalogo = sufijosDePosicion(ncm);
  if (!catalogo.length) return [];

  const avisos: { clave: string; detalle: string }[] = [];
  const declarados = parsearSufijos(texto);
  const puestos = new Set(declarados.map((s) => s.clave));

  for (const s of declarados) {
    const def = catalogo.find((c) => c.clave === s.clave);
    if (!def) {
      avisos.push({ clave: s.clave, detalle: `${ncm} no tiene declarado el sufijo ${s.clave}.` });
      continue;
    }
    if (def.tipo === "codigo" && s.codigo === undefined) {
      avisos.push({ clave: s.clave, detalle: `${s.clave} lleva un código, no texto libre.` });
    } else if (def.tipo === "texto" && s.codigo !== undefined) {
      avisos.push({ clave: s.clave, detalle: `${s.clave} (${def.detalle}) lleva texto, no un código.` });
    } else if (
      s.codigo !== undefined &&
      def.valores.length &&
      !def.valores.some((v) => v.codigo === s.codigo)
    ) {
      const admitidos = def.valores.map((v) => v.codigo).join(", ");
      avisos.push({
        clave: s.clave,
        detalle: `${s.clave}${s.codigo} no está entre los valores de la posición (${admitidos}).`,
      });
    }
  }

  for (const def of catalogo) {
    if (!puestos.has(def.clave)) {
      avisos.push({
        clave: def.clave,
        detalle: `Falta ${def.clave}${def.detalle ? ` (${def.detalle})` : ""}, que la posición pide.`,
      });
    }
  }

  return avisos;
}
