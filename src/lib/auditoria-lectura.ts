import {
  esContenedorIso6346Valido,
  extraerCodigosContenedor,
} from "@/lib/costos-logistica";

export type AlertaLectura = {
  tipo: "iso_invalido" | "lectura_vacia" | "lectura_dual";
  fragmento: string;
  detalle: string;
};

export type ResultadoAuditoria = {
  alertas: AlertaLectura[];
  /** Códigos contenedor a re-leer con visión (segunda pasada). */
  revisar: string[];
};

/**
 * Auditoría sin ground truth: solo dígito verificador ISO 6346 y lectura vacía.
 * No compara contra OCR local ni listas de muestras.
 */
export function auditarLectura(texto: string): ResultadoAuditoria {
  const alertas: AlertaLectura[] = [];
  const revisar = new Set<string>();

  if (!texto.trim()) {
    alertas.push({
      tipo: "lectura_vacia",
      fragmento: "",
      detalle: "La IA no devolvió texto",
    });
    return { alertas, revisar: [] };
  }

  for (const c of extraerCodigosContenedor(texto)) {
    if (!esContenedorIso6346Valido(c)) {
      alertas.push({
        tipo: "iso_invalido",
        fragmento: c,
        detalle: "Dígito verificador ISO 6346 inválido",
      });
      revisar.add(c);
    }
  }

  return { alertas, revisar: [...revisar] };
}

/** Aplica correcciones "ANTERIOR -> NUEVO" sobre la transcripción. */
export function aplicarCorreccionesLectura(
  texto: string,
  correcciones: string,
): string {
  let out = texto;
  for (const line of correcciones.split("\n")) {
    const m = line.match(/^\s*(\S+)\s*->\s*(\S+)\s*$/);
    if (!m) continue;
    const [, antes, despues] = m;
    if (!antes || !despues || despues.includes("[") || despues.includes("ILEGIBLE"))
      continue;
    out = out.split(antes).join(despues);
  }
  return out;
}
