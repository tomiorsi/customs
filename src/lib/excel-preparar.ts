import "server-only";

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ejecutarPythonScript } from "@/lib/python-runtime";

/**
 * Facturas y listas de empaque en Excel.
 *
 * Muchos proveedores —sobre todo los asiáticos— mandan la proforma y el packing
 * list en planilla, no en PDF. Antes eso obligaba al despachante a imprimirlo a
 * PDF para poder subirlo, y en el camino se perdía lo mejor que tiene el Excel:
 * que los ítems ya vienen en filas, uno por renglón, sin que nadie tenga que
 * adivinar dónde empieza y termina cada mercadería.
 *
 * Sale **Markdown**, no CSV: la IA lee mucho mejor una tabla con encabezados
 * alineados, y una proforma casi siempre trae filas de datos del proveedor
 * antes de la tabla de mercaderías.
 *
 * Corre en Python porque ahí están las librerías —y porque el puente ya existe
 * para los PDF escaneados—. Son dos librerías y no una porque se reparten los
 * formatos sin superponerse: `xlrd` 2.x solo lee `.xls`, `openpyxl` solo `.xlsx`.
 */

const SCRIPT = join(process.cwd(), "scripts", "excel_texto.py");

/** Extensiones que sabemos abrir. */
export const EXTENSIONES_EXCEL = [".xls", ".xlsx", ".xlsm"] as const;

/**
 * Tipos MIME con que llegan las planillas.
 *
 * Se mira además la extensión: el navegador manda `application/octet-stream`
 * bastante seguido, sobre todo con `.xls` viejo, y quedarse solo con el MIME
 * rechazaría archivos válidos.
 */
export const MIMES_EXCEL = [
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
] as const;

/** Si el archivo es una planilla, por nombre o por tipo declarado. */
export function esExcel(nombre: string | null | undefined, mime?: string | null): boolean {
  const n = (nombre ?? "").toLowerCase();
  if (EXTENSIONES_EXCEL.some((e) => n.endsWith(e))) return true;
  return MIMES_EXCEL.includes((mime ?? "").toLowerCase() as (typeof MIMES_EXCEL)[number]);
}

/** La extensión con la que hay que guardarlo para que Python elija librería. */
function extensionDe(nombre: string): string {
  const n = nombre.toLowerCase();
  const hit = EXTENSIONES_EXCEL.find((e) => n.endsWith(e));
  // Sin extensión reconocible se asume `.xls`: es el formato que más llega sin
  // nombre correcto, y si no es, el script falla con un mensaje claro.
  return hit ?? ".xls";
}

/**
 * Planilla → texto en Markdown, una tabla por hoja.
 *
 * Devuelve `null` cuando no se pudo leer, para que quien llame decida: puede
 * ser una planilla protegida con contraseña, un archivo corrupto o un `.csv`
 * con nombre engañoso. No se lanza excepción porque un documento ilegible no
 * debería voltear la subida entera de una carpeta.
 */
export async function extraerTextoExcel(
  buf: Buffer,
  nombreOriginal = "planilla.xls",
): Promise<string | null> {
  const dir = mkdtempSync(join(tmpdir(), "desp-xls-"));
  const path = join(dir, `doc${extensionDe(nombreOriginal)}`);
  try {
    writeFileSync(path, buf);
    const out = await ejecutarPythonScript(SCRIPT, [path]);
    const texto = out.trim();
    return texto || null;
  } catch {
    return null;
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}
