import "server-only";
import { lineaNcmEnParquet, descripcionPartida } from "./motor";
import type { PropuestaCruce } from "./ia";
import { textoLegalResumido } from "./motor";

function soloDigitos(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

const MAX_PROPUESTAS = 8;

function deduplicarPropuestas(propuestas: PropuestaCruce[]): PropuestaCruce[] {
  const vistos = new Set<string>();
  const out: PropuestaCruce[] = [];
  for (const p of propuestas) {
    const clave = soloDigitos(p.ncm);
    if (!clave || clave.length < 6 || vistos.has(clave)) continue;
    vistos.add(clave);
    out.push(p);
  }
  return out.slice(0, MAX_PROPUESTAS);
}

/** Propuestas validadas en parquet a partir de NCM elegidas por la IA. */
export async function propuestasDesdeNcMs(ncms: string[]): Promise<PropuestaCruce[]> {
  const propuestas: PropuestaCruce[] = [];
  for (const raw of ncms) {
    const d = soloDigitos(raw);
    if (d.length < 6) continue;
    const p4 = d.slice(0, 4);
    const linea = await lineaNcmEnParquet(raw);
    if (!linea) continue;
    const partidaDesc = (await descripcionPartida(p4)) || "";
    propuestas.push({
      partida: p4,
      partidaDesc,
      ncm: linea.codigo,
      descripcion: textoLegalResumido(linea),
    });
  }
  return deduplicarPropuestas(propuestas);
}
