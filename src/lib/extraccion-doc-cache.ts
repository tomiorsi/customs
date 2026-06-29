import "server-only";
import {
  extraccionDocVigente,
  parseExtraccionDoc,
  type DocumentRow,
} from "@/lib/data";

type DocCacheMeta = Pick<DocumentRow, "stored_name" | "size" | "extraccion_ia">;

/**
 * Pipeline de subida (por documento):
 *
 * 1. Capa embebida (PyMuPDF, $0) si el PDF es nativo y confiable.
 * 2. Haiku visión si escaneo, capa rota, o validación dual en nativos.
 * 3. Nativos + API: capa embebida y visión deben ser idénticas al 100%; si no, Haiku texto arbitra.
 * 4. Haiku texto: interpretación → datos estructurados.
 * 5. Guarda lectura + datos + meta_lectura en caché. Cruce normativo = manual.
 */

export function rawDatosDesdeCache(doc: DocCacheMeta): unknown | null {
  const cache = parseExtraccionDoc(doc.extraccion_ia);
  if (!extraccionDocVigente(doc, cache) || cache?.datos == null) return null;
  return cache.datos;
}

export function documentoTieneCacheVigente(doc: DocCacheMeta): boolean {
  const cache = parseExtraccionDoc(doc.extraccion_ia);
  if (!extraccionDocVigente(doc, cache)) return false;
  if (cache?.lectura_bruta) return true;
  return cache?.datos != null;
}
