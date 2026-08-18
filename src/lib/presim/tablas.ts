import "server-only";

import fs from "node:fs";
import path from "node:path";

/**
 * Tablas codificadoras del SIM, tal como las tiene el Kit Malvina instalado.
 *
 * De acá salen los valores que el SIM acepta: aduanas, países, divisas,
 * unidades, documentos, motivos. Si el archivo del pre-SIM lleva un código que
 * no está en estas tablas, la declaración rebota — por eso se valida antes de
 * emitir y no después del rechazo.
 *
 * Cada fila tiene VIGENCIA. El mismo código puede aparecer varias veces con
 * períodos distintos: Burkina Faso figura dos veces, 1992-2018 y 2018-en
 * adelante. `31/12/3000` es el centinela de «sin vencimiento». Por eso todas
 * las consultas piden fecha: una declaración de 2019 se valida contra lo que
 * regía en 2019, no contra lo de hoy.
 */

const DIR = path.join(process.cwd(), "data", "Normas", "SIM", "kit");

/** Fin de vigencia que usa el SIM para decir «sigue vigente». */
const SIN_VENCIMIENTO = "31/12/3000";

export type FilaSim = {
  codigo: string;
  descripcion: string | null;
  desde: Date | null;
  hasta: Date | null;
  /** La fila completa, para los campos propios de cada tabla. */
  campos: Record<string, string>;
};

export type TablaSim = {
  nombre: string;
  filas: FilaSim[];
  porCodigo: Map<string, FilaSim[]>;
};

/* ─────────────────────────── lectura ─────────────────────────── */

/**
 * CSV con comillas dobles y comas adentro de los valores. No usamos una
 * librería porque es el único formato que entra y son cuatro reglas.
 */
function parsearCsv(texto: string): Record<string, string>[] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else enComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') enComillas = true;
    else if (c === ",") {
      fila.push(campo);
      campo = "";
    } else if (c === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else if (c !== "\r") campo += c;
  }
  if (campo || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }

  const cab = (filas.shift() ?? []).map((h) => h.replace(/^﻿/, "").trim());
  return filas
    .filter((f) => f.some((v) => v !== ""))
    .map((f) => Object.fromEntries(cab.map((h, i) => [h, (f[i] ?? "").trim()])));
}

/** `28/02/2023 0:00:00` → Date. Devuelve null si no parsea. */
function fechaSim(raw: string | undefined): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec((raw ?? "").trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Detecta qué columna es el código, cuál la descripción y cuáles las de
 * vigencia. El SIM nombra las columnas por convención —`CPOR`/`LPOR`,
 * `DPOREFF`/`DPORFIN`— así que se deducen en vez de mantener un mapa a mano
 * que se desactualiza cada vez que aparece una tabla nueva.
 */
function detectarColumnas(cols: string[]) {
  const codigo = cols[0];
  const descripcion =
    cols.find((c) => /^L/.test(c) && !/ABR$/i.test(c)) ??
    cols.find((c) => /^L/.test(c)) ??
    cols.find((c) => /DESC/i.test(c)) ??
    null;
  const desde = cols.find((c) => /^D.*(EFF|INI)$/i.test(c)) ?? null;
  const hasta = cols.find((c) => /^D.*FIN$/i.test(c)) ?? null;
  return { codigo, descripcion, desde, hasta };
}

function construir(nombre: string): TablaSim {
  const archivo = path.join(DIR, `${nombre}.csv`);
  if (!fs.existsSync(archivo)) {
    throw new Error(
      `Falta la tabla ${nombre} del SIM en ${DIR}. Se exporta desde el Kit Malvina; ver scripts/kit-sim/.`,
    );
  }
  const crudo = parsearCsv(fs.readFileSync(archivo, "utf8"));
  const cols = Object.keys(crudo[0] ?? {});
  const { codigo, descripcion, desde, hasta } = detectarColumnas(cols);

  const filas: FilaSim[] = crudo.map((c) => ({
    codigo: (c[codigo] ?? "").trim(),
    descripcion: descripcion ? (c[descripcion] ?? "").trim() || null : null,
    desde: desde ? fechaSim(c[desde]) : null,
    hasta: hasta && !(c[hasta] ?? "").startsWith(SIN_VENCIMIENTO) ? fechaSim(c[hasta]) : null,
    campos: c,
  }));

  const porCodigo = new Map<string, FilaSim[]>();
  for (const f of filas) {
    if (!f.codigo) continue;
    const arr = porCodigo.get(f.codigo);
    if (arr) arr.push(f);
    else porCodigo.set(f.codigo, [f]);
  }
  return { nombre, filas, porCodigo };
}

const cache = new Map<string, TablaSim>();

export function tabla(nombre: string): TablaSim {
  let t = cache.get(nombre);
  if (!t) {
    t = construir(nombre);
    cache.set(nombre, t);
  }
  return t;
}

/* ─────────────────────────── consultas ─────────────────────────── */

/**
 * La versión de un código vigente a una fecha. Sin fecha, la vigente hoy.
 * Devuelve null si el código no existe o no regía en ese momento.
 */
export function buscar(
  nombreTabla: string,
  codigo: string | null | undefined,
  fecha?: Date,
): FilaSim | null {
  const cod = (codigo ?? "").trim();
  if (!cod) return null;
  const versiones = tabla(nombreTabla).porCodigo.get(cod);
  if (!versiones?.length) return null;

  const cuando = fecha ?? new Date();
  const vigente = versiones.find(
    (v) => (!v.desde || v.desde <= cuando) && (!v.hasta || v.hasta > cuando),
  );
  // Si ninguna versión cubre la fecha, el código existe pero no regía: eso lo
  // decide quien llama, así que devolvemos null y no la versión más parecida.
  return vigente ?? null;
}

/** `true` si el código existe y regía en esa fecha. */
export function existe(
  nombreTabla: string,
  codigo: string | null | undefined,
  fecha?: Date,
): boolean {
  return buscar(nombreTabla, codigo, fecha) != null;
}

/** Los códigos vigentes de una tabla, para poblar un selector. */
export function vigentes(nombreTabla: string, fecha?: Date): FilaSim[] {
  const cuando = fecha ?? new Date();
  const salida: FilaSim[] = [];
  for (const versiones of tabla(nombreTabla).porCodigo.values()) {
    const v = versiones.find(
      (x) => (!x.desde || x.desde <= cuando) && (!x.hasta || x.hasta > cuando),
    );
    if (v) salida.push(v);
  }
  return salida.sort((a, b) => a.codigo.localeCompare(b.codigo, "es"));
}
