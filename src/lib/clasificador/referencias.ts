import "server-only";
import path from "node:path";
import { leerFilas } from "@/lib/parquet-store";

/**
 * Lo que el Arancel publica alrededor de una posición y no entra en el propio
 * texto legal: la unidad estadística, los sufijos de valor y las notas de
 * sección y capítulo.
 *
 * Son archivos aparte del nomenclador y se leen una sola vez por proceso.
 */

const DIR = path.join(process.cwd(), "data", "Nomenclatura");
const NOTAS_PATH = path.join(DIR, "notas.parquet");
const SUFIJOS_PATH = path.join(DIR, "sufijos.parquet");

const NOTAS_COLS = ["tipo", "referencia", "titulo", "texto"] as const;
const SUFIJOS_COLS = ["partida", "sufijo", "tipo", "descripcion"] as const;

export type NotaLegal = {
  /** "nota_seccion" | "nota_capitulo" | "rgi" */
  tipo: string;
  /** "Sección I", "Capítulo 85". */
  referencia: string;
  titulo: string;
  texto: string;
};

export type SufijoValor = {
  /** Código de dos letras y dos dígitos: "NA01". */
  sufijo: string;
  /** Norma que lo crea ("R.", "IG11/2000"). */
  tipo: string;
  descripcion: string;
};

/**
 * Unidad estadística del Arancel. El nomenclador guarda el código y no la
 * leyenda; el significado de cada uno se estableció cruzando qué mercadería
 * lleva cada código (01 en carne y cemento, 04 en gases, 08 en calzado).
 */
const UNIDADES: Record<string, string> = {
  "01": "Kilogramo",
  "02": "Metro",
  "03": "Metro cuadrado",
  "04": "Metro cúbico",
  "05": "Litro",
  "06": "Kilowatt-hora",
  "07": "Unidad",
  "08": "Par",
  "25": "Mazo",
};

export function etiquetaUnidad(codigo: string | null | undefined): string | null {
  const c = (codigo ?? "").trim();
  if (!c) return null;
  return UNIDADES[c] ?? `Código ${c}`;
}

let notasPromesa: Promise<NotaLegal[]> | null = null;

async function todasLasNotas(): Promise<NotaLegal[]> {
  if (!notasPromesa) {
    notasPromesa = leerFilas(NOTAS_PATH, NOTAS_COLS).then((filas) =>
      filas.map((f) => ({
        tipo: (f["tipo"] ?? "").trim(),
        referencia: (f["referencia"] ?? "").trim(),
        titulo: (f["titulo"] ?? "").trim(),
        texto: (f["texto"] ?? "").trim(),
      })),
    );
  }
  return notasPromesa;
}

/**
 * Notas de la sección y del capítulo de una posición. Son las que deciden
 * exclusiones e inclusiones, así que valen tanto como el texto de la partida.
 */
export async function notasDeNcm(ncm: string): Promise<NotaLegal[]> {
  const digitos = (ncm ?? "").replace(/\D/g, "");
  if (digitos.length < 2) return [];
  const capitulo = String(Number(digitos.slice(0, 2)));
  const notas = await todasLasNotas();

  const delCapitulo = notas.filter(
    (n) => n.tipo === "nota_capitulo" && n.referencia === `Capítulo ${capitulo}`,
  );
  const seccion = seccionDeCapitulo(Number(capitulo));
  const deSeccion = seccion
    ? notas.filter(
        (n) => n.tipo === "nota_seccion" && n.referencia === `Sección ${seccion}`,
      )
    : [];
  return [...deSeccion, ...delCapitulo];
}

/**
 * Capítulos que abarca cada sección del Sistema Armonizado. El código de la
 * posición no dice a qué sección pertenece, y solo 8 de las 20 notas declaran
 * su rango en el texto —esas 8 coinciden con esta tabla—, así que se usa la
 * división del Sistema, que es la misma en todos los países.
 */
const SECCIONES: { romano: string; desde: number; hasta: number }[] = [
  { romano: "I", desde: 1, hasta: 5 },
  { romano: "II", desde: 6, hasta: 14 },
  { romano: "III", desde: 15, hasta: 15 },
  { romano: "IV", desde: 16, hasta: 24 },
  { romano: "V", desde: 25, hasta: 27 },
  { romano: "VI", desde: 28, hasta: 38 },
  { romano: "VII", desde: 39, hasta: 40 },
  { romano: "VIII", desde: 41, hasta: 43 },
  { romano: "IX", desde: 44, hasta: 46 },
  { romano: "X", desde: 47, hasta: 49 },
  { romano: "XI", desde: 50, hasta: 63 },
  { romano: "XII", desde: 64, hasta: 67 },
  { romano: "XIII", desde: 68, hasta: 70 },
  { romano: "XIV", desde: 71, hasta: 71 },
  { romano: "XV", desde: 72, hasta: 83 },
  { romano: "XVI", desde: 84, hasta: 85 },
  { romano: "XVII", desde: 86, hasta: 89 },
  { romano: "XVIII", desde: 90, hasta: 92 },
  { romano: "XIX", desde: 93, hasta: 93 },
  { romano: "XX", desde: 94, hasta: 96 },
  { romano: "XXI", desde: 97, hasta: 97 },
];

function seccionDeCapitulo(capitulo: number): string | null {
  return (
    SECCIONES.find((s) => capitulo >= s.desde && capitulo <= s.hasta)?.romano ??
    null
  );
}

let sufijosPromesa: Promise<Map<string, SufijoValor[]>> | null = null;

async function indiceSufijos(): Promise<Map<string, SufijoValor[]>> {
  if (!sufijosPromesa) {
    sufijosPromesa = leerFilas(SUFIJOS_PATH, SUFIJOS_COLS).then((filas) => {
      const idx = new Map<string, SufijoValor[]>();
      for (const f of filas) {
        const clave = (f["partida"] ?? "").trim();
        const sufijo = (f["sufijo"] ?? "").trim();
        if (!clave || !sufijo) continue;
        const lista = idx.get(clave) ?? [];
        lista.push({
          sufijo,
          tipo: (f["tipo"] ?? "").trim(),
          descripcion: (f["descripcion"] ?? "").trim(),
        });
        idx.set(clave, lista);
      }
      return idx;
    });
  }
  return sufijosPromesa;
}

/**
 * Sufijos de valor de una posición: el detalle que la aduana pide declarar
 * además del código (de herrero / de carpintero, con mango de madera…).
 *
 * El archivo los indexa por el código sin la letra verificadora, y algunos
 * cuelgan de la partida formateada ("01.02"), así que se prueban ambos.
 */
export async function sufijosDeNcm(ncm: string): Promise<SufijoValor[]> {
  const idx = await indiceSufijos();
  const limpio = (ncm ?? "").trim();
  const sinLetra = limpio.replace(/[A-Za-z]$/, "");
  const digitos = limpio.replace(/\D/g, "");

  const claves = [
    sinLetra,
    digitos.length >= 4 ? `${digitos.slice(0, 2)}.${digitos.slice(2, 4)}` : "",
  ].filter(Boolean);

  for (const c of claves) {
    const hit = idx.get(c);
    if (hit?.length) return hit;
  }
  return [];
}
