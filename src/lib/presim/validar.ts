import "server-only";

import fs from "node:fs";
import path from "node:path";

import { buscar, tabla } from "@/lib/presim/tablas";
import { bloque, bloques, nartDe, subregimenDe, valor } from "@/lib/presim/archivo";
import type { DeclaracionSim } from "@/lib/presim/tipos";
import { CLAVES_NCM, NART_CABECERA, TABLA_DE_CLAVE } from "@/lib/presim/tipos";

/**
 * Validación previa a emitir.
 *
 * El SIM rechaza la declaración entera por un código inválido o un campo que
 * ese subrégimen no admite, y el rechazo llega después de haber cargado todo.
 * Acá se adelanta ese control con los mismos datos que usa el SIM: la
 * parametría de `GEN` y las tablas codificadoras del Kit.
 *
 * No inventa reglas: si `GEN` no dice nada de un campo, no se opina.
 */

export type Hallazgo = {
  nivel: "error" | "aviso";
  seccion: string;
  /** `0000` para la cabecera, `0001`… para un ítem. */
  nart: string;
  clave: string;
  detalle: string;
};

/**
 * Qué significa cada valor de `GEN`.
 *
 * Medido contra tres declaraciones reales que la aduana aceptó, y el resultado
 * es asimétrico:
 *
 * - `P` (prohibido) se cumplió 3 de 3: ningún campo marcado P aparece nunca.
 *   Por eso violarlo es ERROR.
 * - `O` (obligatorio) NO se cumplió: `CDDTPRFTIT` está marcado O para IC04 y
 *   IT04 y las dos declaraciones reales lo omiten. Y no es un caso aislado que
 *   se pueda listar aparte — es O en 60 de los 250 subregímenes.
 *
 * La explicación es que el archivo es la ENTRADA al Kit, no la declaración
 * final: hay campos obligatorios que el Kit completa después. Así que la
 * ausencia de un obligatorio es AVISO, no error — bloquear la emisión ahí
 * rechazaría archivos que en la realidad se oficializaron.
 *
 * El resto —`F`, `V`, `N`, `1`, `D`— se trata como permisivo: no bloqueamos
 * por una convención que no terminamos de entender.
 */
function exigencia(v: string): "obligatorio" | "prohibido" | "libre" {
  if (v === "O") return "obligatorio";
  if (v === "P") return "prohibido";
  return "libre";
}

/**
 * Complementarios de ítem que el catálogo `ZCP` no trae.
 *
 * `ZCP` tiene 634 códigos pero solo 3 de nivel ítem, y las declaraciones usan
 * 82 más. Se verificó barriendo las dos bases del Kit: ese catálogo no está
 * guardado localmente, el Kit lo pide al SIM. Lo que sí tenemos es el set en
 * uso, derivado de las declaraciones del estudio — sirve para no avisar de un
 * código que en la práctica se usa todos los días.
 */
let complementariosEnUso: Set<string> | null = null;

function esComplementarioConocido(codigo: string): boolean {
  if (!complementariosEnUso) {
    complementariosEnUso = new Set();
    const p = path.join(
      process.cwd(),
      "data/Normas/SIM/kit/complementarios-en-uso.json",
    );
    try {
      const j = JSON.parse(fs.readFileSync(p, "utf8")) as {
        complementarios?: { codigo?: string }[];
      };
      for (const c of j.complementarios ?? []) {
        if (c.codigo) complementariosEnUso.add(c.codigo);
      }
    } catch {
      // Sin el archivo se sigue validando contra ZCP nada más.
    }
  }
  return complementariosEnUso.has(codigo);
}

/** Fila de `GEN` para un subrégimen, vigente a la fecha dada. */
function parametria(subregimen: string, fecha?: Date): Record<string, string> | null {
  const gen = tabla("GEN");
  const versiones = gen.porCodigo.get(subregimen);
  if (!versiones?.length) return null;
  const cuando = fecha ?? new Date();
  const v =
    versiones.find((x) => (!x.desde || x.desde <= cuando) && (!x.hasta || x.hasta > cuando)) ??
    versiones[versiones.length - 1];
  return v.campos;
}

/** Las claves que `GEN` parametriza (las de la cabecera de la declaración). */
function esClaveDeCabecera(k: string): boolean {
  return /^(CDDT|MDDT|NDDT|DDDT|QDDT|LDDT)/.test(k);
}

/**
 * `GEN` no solo dice qué campos van: también si una **sección entera** va.
 *
 * Las columnas con forma `I` + tres letras son marcas de sección, con la misma
 * escala `O`/`P`/`F` que los campos. Es lo que faltaba controlar, y no es
 * menor: `[BUL]` es obligatoria en 214 de los 257 subregímenes y está prohibida
 * en 42, así que una declaración sin bultos podía pasar en verde y rebotar en
 * el SIM.
 *
 * Verificado contra las tres declaraciones reales, 3 de 3: EC01 tiene
 * `IBUL=O` y lleva `[BUL]`; IC04 e IT04 la tienen en `F` y no la llevan.
 *
 * `IDSO` e `IDAL` quedan afuera a propósito: son marcas de `GEN` pero no hay
 * tabla ni sección con ese nombre —ni en el Kit ni en los archivos reales—, y
 * opinar sobre algo que no sabemos qué es sería inventar una regla.
 */
const SECCION_DE_MARCA: Record<string, string> = {
  ICPL: "CPL",
  IBUL: "BUL",
  ITRC: "TRC",
};

/**
 * Valida una declaración contra la parametría del SIM y sus tablas.
 *
 * `fecha` es la de la declaración, no la de hoy: un código que venció en 2020
 * era válido en 2019 y no tiene que dar error al revisar una carpeta vieja.
 */
export function validarDeclaracion(
  d: DeclaracionSim,
  opts: { fecha?: Date; ncmValido?: (ncm: string) => boolean } = {},
): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  const fecha = opts.fecha;

  const sub = subregimenDe(d);
  if (!sub) {
    return [
      {
        nivel: "error",
        seccion: "DDT",
        nart: NART_CABECERA,
        clave: "ISTA",
        detalle: "La declaración no dice qué subrégimen es.",
      },
    ];
  }
  if (!buscar("STA", sub, fecha)) {
    hallazgos.push({
      nivel: "error",
      seccion: "DDT",
      nart: NART_CABECERA,
      clave: "ISTA",
      detalle: `El subrégimen ${sub} no existe o no regía en esa fecha.`,
    });
  }

  /* ── 1. campos obligatorios y prohibidos, según GEN ── */
  const param = parametria(sub, fecha);
  const ddt = bloque(d, "DDT");
  if (param && ddt) {
    const presentes = new Set(ddt.pares.map(([k]) => k));
    for (const [clave, marca] of Object.entries(param)) {
      if (!esClaveDeCabecera(clave)) continue;
      const regla = exigencia(marca);
      const esta = presentes.has(clave);
      if (regla === "obligatorio" && !esta) {
        hallazgos.push({
          nivel: "aviso",
          seccion: "DDT",
          nart: NART_CABECERA,
          clave,
          detalle: `${sub} lo marca obligatorio. Si el Kit no lo completa, el SIM lo va a pedir.`,
        });
      } else if (regla === "prohibido" && esta) {
        hallazgos.push({
          nivel: "error",
          seccion: "DDT",
          nart: NART_CABECERA,
          clave,
          detalle: `${sub} no admite este campo.`,
        });
      }
    }
  } else if (!param) {
    hallazgos.push({
      nivel: "aviso",
      seccion: "DDT",
      nart: NART_CABECERA,
      clave: "ISTA",
      detalle: `No hay parametría de ${sub} en GEN: no se pudo controlar qué campos exige.`,
    });
  }

  /* ── 1b. secciones enteras que el subrégimen exige o prohíbe ── */
  if (param) {
    for (const [marca, seccion] of Object.entries(SECCION_DE_MARCA)) {
      const regla = exigencia(param[marca] ?? "");
      const esta = bloques(d, seccion).length > 0;
      if (regla === "prohibido" && esta) {
        hallazgos.push({
          nivel: "error",
          seccion,
          nart: NART_CABECERA,
          clave: marca,
          detalle: `${sub} no admite la sección [${seccion}].`,
        });
      } else if (regla === "obligatorio" && !esta) {
        hallazgos.push({
          // Aviso y no error, por lo mismo que los campos obligatorios: el
          // archivo es la entrada al Kit y hay secciones que se completan
          // después. Igual conviene verlo antes de emitir.
          nivel: "aviso",
          seccion,
          nart: NART_CABECERA,
          clave: marca,
          detalle: `${sub} exige la sección [${seccion}] y no está.`,
        });
      }
    }
  }

  /* ── 2. cada valor contra su tabla ── */
  for (const b of d.bloques) {
    const nart = nartDe(b);
    for (const [clave, v] of b.pares) {
      if (!v) continue;

      if (CLAVES_NCM.includes(clave)) {
        if (opts.ncmValido && !opts.ncmValido(v)) {
          hallazgos.push({
            nivel: "error",
            seccion: b.seccion,
            nart,
            clave,
            detalle: `La posición ${v} no está en el nomenclador.`,
          });
        }
        continue;
      }

      if (clave === "CCPL" && esComplementarioConocido(v)) continue;

      const destino = TABLA_DE_CLAVE[clave];
      if (!destino) continue;
      const candidatas = Array.isArray(destino) ? destino : [destino];
      const encontrada = candidatas.some((t) => {
        try {
          return buscar(t, v, fecha) != null;
        } catch {
          return false;
        }
      });
      if (!encontrada) {
        hallazgos.push({
          // Aviso y no error: puede ser un código real que el Kit todavía no
          // bajó, y frenar la emisión por eso sería peor que dejarlo pasar.
          nivel: "aviso",
          seccion: b.seccion,
          nart,
          clave,
          detalle: `«${v}» no figura en ${candidatas.join(" ni ")} para esa fecha.`,
        });
      }
    }
  }

  /* ── 3. coherencia de la estructura ── */
  const arts = bloques(d, "ART");
  if (arts.length === 0) {
    hallazgos.push({
      nivel: "error",
      seccion: "ART",
      nart: NART_CABECERA,
      clave: "—",
      detalle: "La declaración no tiene ningún ítem.",
    });
  }
  const numeros = arts.map((a) => valor(a, "NARTEXT") ?? nartDe(a));
  const repetidos = numeros.filter((n, i) => numeros.indexOf(n) !== i);
  for (const n of new Set(repetidos)) {
    hallazgos.push({
      nivel: "error",
      seccion: "ART",
      nart: n,
      clave: "NARTEXT",
      detalle: `Hay más de un ítem con el número ${n}.`,
    });
  }

  return hallazgos;
}

/**
 * Qué secciones exige, admite o prohíbe un subrégimen.
 *
 * Se consulta **antes** de cargar, no después: si el subrégimen pide bultos,
 * la pantalla tiene que pedirlos; si los prohíbe, no tiene sentido mostrar el
 * campo. Validar al final está bien para atajar el error, pero llegar al final
 * para enterarse es hacerle perder el trabajo al que carga.
 */
export function seccionesDelSubregimen(
  subregimen: string,
  fecha?: Date,
): { seccion: string; regla: "obligatorio" | "prohibido" | "libre" }[] {
  const param = parametria(subregimen, fecha);
  return Object.entries(SECCION_DE_MARCA).map(([marca, seccion]) => ({
    seccion,
    regla: param ? exigencia(param[marca] ?? "") : "libre",
  }));
}

/** Resumen corto para mostrar en pantalla. */
export function resumirHallazgos(h: Hallazgo[]): {
  errores: number;
  avisos: number;
  emitible: boolean;
} {
  const errores = h.filter((x) => x.nivel === "error").length;
  return { errores, avisos: h.length - errores, emitible: errores === 0 };
}
