import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { leerFilas } from "@/lib/parquet-store";

const NOTAS_PATH = path.join(process.cwd(), "data", "Nomenclatura", "notas.parquet");
const RGI_TXT_PATH = path.join(
  process.cwd(),
  "data",
  "Nomenclatura",
  "reglas_generales_interpretacion.txt",
);

const MAX_CHARS_NOTA = 3500;
const MAX_CHARS_MARCO = 14000;

type NotaRow = {
  tipo: string;
  referencia: string;
  titulo: string;
  texto: string;
};

/** Capítulo HS (2 dígitos) → Sección NCM (texto en notas.parquet). */
const SECCION_POR_CAPITULO: [number, number, string][] = [
  [1, 5, "Sección I"],
  [6, 14, "Sección II"],
  [15, 15, "Sección III"],
  [16, 24, "Sección IV"],
  [25, 27, "Sección V"],
  [28, 38, "Sección VI"],
  [39, 40, "Sección VII"],
  [41, 43, "Sección VIII"],
  [44, 46, "Sección IX"],
  [47, 49, "Sección X"],
  [50, 63, "Sección XI"],
  [64, 67, "Sección XII"],
  [68, 70, "Sección XIII"],
  [71, 71, "Sección XIV"],
  [72, 83, "Sección XV"],
  [84, 85, "Sección XVI"],
  [86, 89, "Sección XVII"],
  [90, 92, "Sección XVIII"],
  [93, 93, "Sección XIX"],
  [94, 96, "Sección XX"],
  [97, 97, "Sección XXI"],
];

let notasPromesa: Promise<Map<string, NotaRow>> | null = null;
let rgiTxtPromesa: Promise<string> | null = null;

function truncar(texto: string, max: number): string {
  const t = (texto ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

async function cargarNotas(): Promise<Map<string, NotaRow>> {
  if (!notasPromesa) {
    notasPromesa = leerFilas(NOTAS_PATH, ["tipo", "referencia", "titulo", "texto"]).then((filas) => {
      const map = new Map<string, NotaRow>();
      for (const f of filas) {
        const ref = (f.referencia ?? "").trim();
        if (!ref) continue;
        map.set(ref, {
          tipo: f.tipo ?? "",
          referencia: ref,
          titulo: f.titulo ?? "",
          texto: f.texto ?? "",
        });
      }
      return map;
    });
  }
  return notasPromesa;
}

async function cargarRgiTxt(): Promise<string> {
  if (!rgiTxtPromesa) {
    rgiTxtPromesa = fs.readFile(RGI_TXT_PATH, "utf8").catch(() => "");
  }
  return rgiTxtPromesa;
}

export function capituloDesdePartida(partida4: string): number {
  const n = parseInt((partida4 ?? "").slice(0, 2), 10);
  return Number.isFinite(n) ? n : 0;
}

export function seccionDesdeCapitulo(cap: number): string | null {
  for (const [desde, hasta, sec] of SECCION_POR_CAPITULO) {
    if (cap >= desde && cap <= hasta) return sec;
  }
  return null;
}

function claveCapitulo(cap: number): string {
  return `Capítulo ${cap}`;
}

/** Marco legal completo para Fase B: RGI/RGC + notas de sección y capítulo de las partidas involucradas. */
export async function marcoLegalClasificacion(partidas4: string[]): Promise<string> {
  const notas = await cargarNotas();
  const partes: string[] = [];

  const rgiParquet = ["RGI - Sistema Armonizado", "RGC - Complementarias"]
    .map((k) => notas.get(k))
    .filter(Boolean) as NotaRow[];
  if (rgiParquet.length) {
    partes.push(
      "REGLAS GENERALES DE INTERPRETACIÓN (NCM):\n" +
        rgiParquet.map((n) => `${n.referencia}\n${truncar(n.texto, MAX_CHARS_NOTA)}`).join("\n\n"),
    );
  } else {
    const txt = await cargarRgiTxt();
    if (txt.trim()) {
      partes.push(`REGLAS GENERALES DE INTERPRETACIÓN (NCM):\n${truncar(txt, MAX_CHARS_NOTA)}`);
    }
  }

  const caps = new Set<number>();
  const secs = new Set<string>();
  for (const p4 of partidas4) {
    const cap = capituloDesdePartida(p4);
    if (cap > 0) caps.add(cap);
    const sec = seccionDesdeCapitulo(cap);
    if (sec) secs.add(sec);
  }

  for (const sec of [...secs].sort()) {
    const n = notas.get(sec);
    if (n) {
      partes.push(`${sec} — ${n.titulo}\n${truncar(n.texto, MAX_CHARS_NOTA)}`);
    }
  }

  for (const cap of [...caps].sort((a, b) => a - b)) {
    const n = notas.get(claveCapitulo(cap));
    if (n) {
      partes.push(`${n.referencia} — ${n.titulo}\n${truncar(n.texto, MAX_CHARS_NOTA)}`);
    }
  }

  const marco = partes.join("\n\n---\n\n");
  return truncar(marco, MAX_CHARS_MARCO);
}
