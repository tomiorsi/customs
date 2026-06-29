// Extrae del Tariff Schedule oficial del ARTI (USTR, Schedule 1 – Argentina)
// las posiciones NCM por categoría de staging y genera un .md de referencia.
//
// Categorías (Anexo I, Nota General 4):
//   EIF -> arancel eliminado (0%) a la entrada en vigor.
//   R2  -> reducido al 2% ad valorem a la entrada en vigor.
//   TRQ -> sujeto a cupo (Apéndice 1).
//   Z   -> sin cambios (sigue el arancel NMF vigente).
import { readFileSync, writeFileSync } from "node:fs";

const file = process.argv[2];
const salida = process.argv[3] ?? "docs/acuerdo-eeuu-ncm.md";
const raw = readFileSync(file, "utf8");

const tokens = raw.split(/[\s|]+/).filter(Boolean);
const CATS = new Set(["EIF", "TRQ", "Z", "R2"]);
const esNcm = (t) => /^\d{8}$/.test(t);
const esNum = (t) => /^[\d]+([.,][\d]+)?$/.test(t);

const filas = [];
let ncmActual = null;
let prevNum = "";
let yaAsignado = true;

for (const t of tokens) {
  if (esNcm(t)) {
    ncmActual = t;
    yaAsignado = false;
    prevNum = "";
    continue;
  }
  if (CATS.has(t)) {
    if (!yaAsignado && ncmActual) {
      filas.push({ ncm: ncmActual, cat: t, rate: prevNum });
      yaAsignado = true;
    }
  } else if (esNum(t)) {
    prevNum = t;
  }
}

const porCat = { EIF: [], R2: [], TRQ: [] };
const vistos = new Set();
for (const f of filas) {
  if (!porCat[f.cat]) continue;
  const key = f.cat + f.ncm;
  if (vistos.has(key)) continue;
  vistos.add(key);
  porCat[f.cat].push(f);
}

const dot = (n) => `${n.slice(0, 4)}.${n.slice(4, 6)}.${n.slice(6, 8)}`;

function tabla(items, conRate) {
  const head = conRate
    ? "| NCM | Arancel NMF base |\n| --- | --- |"
    : "| NCM |\n| --- |";
  const rows = items
    .sort((a, b) => a.ncm.localeCompare(b.ncm))
    .map((f) =>
      conRate ? `| ${dot(f.ncm)} | ${f.rate || "—"}% |` : `| ${dot(f.ncm)} |`,
    );
  return [head, ...rows].join("\n");
}

const md = `# Acuerdo Argentina–EE.UU. (ARTI) — Posiciones NCM

> Fuente: **USTR — U.S.–Argentina Agreement on Reciprocal Trade and Investment**, Anexo I, Schedule 1 (Tariff Schedule of Argentina). Aranceles base NMF al 30/10/2025.
> Documento: \`US Argentina Schedules February 2026.pdf\` (ustr.gov).
>
> ⚠️ **Estado:** firmado el 5/2/2026, **pendiente de ratificación del Congreso argentino**. Entra en vigor 60 días después del intercambio de notificaciones. Hasta entonces, no aplica.
>
> Categorías (Nota General 4 del Anexo I):
> - **EIF**: arancel eliminado (0%) desde la entrada en vigor.
> - **R2**: reducido al **2%** ad valorem desde la entrada en vigor.
> - **TRQ**: sujeto a **cupo** (Apéndice 1); fuera de cupo sigue el arancel NMF.
>
> Conteo extraído del schedule oficial: **EIF ${porCat.EIF.length}**, **R2 ${porCat.R2.length}**, **TRQ ${porCat.TRQ.length}**.
> (La prensa mencionó "221 posiciones"; la cifra oficial del cronograma es la de arriba.)

## EIF — Eliminación inmediata a 0% (${porCat.EIF.length})

${tabla(porCat.EIF, true)}

## R2 — Reducción al 2% (${porCat.R2.length})

${tabla(porCat.R2, true)}

## TRQ — Sujetas a cupo (${porCat.TRQ.length})

${tabla(porCat.TRQ, true)}
`;

writeFileSync(salida, md);
console.log(
  `OK -> ${salida}  (EIF ${porCat.EIF.length}, R2 ${porCat.R2.length}, TRQ ${porCat.TRQ.length})`,
);
