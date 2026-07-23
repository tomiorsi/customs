import "server-only";

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { extraerCapaTextoPdf } from "@/lib/capa-texto-pdf";
import { ejecutarPythonScript } from "@/lib/python-runtime";

export type PaginaImagen = {
  n: number;
  base64: string;
  mediaType: "image/jpeg" | "image/png";
};

const SCRIPT_IMAGENES = join(process.cwd(), "scripts", "pdf_imagenes.py");

function pdfEnTemp(buf: Buffer): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "desp-pdf-"));
  const path = join(dir, "doc.pdf");
  writeFileSync(path, buf);
  return { dir, path };
}

function limpiarTemp(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

/** Texto embebido del PDF, o null si es escaneo sin capa de texto. */
export async function extraerTextoEmbebidoPdf(buf: Buffer): Promise<string | null> {
  const capa = await extraerCapaTextoPdf(buf);
  return capa.tieneTexto ? capa.texto : null;
}

/** Escaneo: imágenes JPEG por página (zoom 2× estándar). */
export async function imagenesPdfEscaneo(buf: Buffer): Promise<PaginaImagen[]> {
  const { dir, path } = pdfEnTemp(buf);
  try {
    const out = await ejecutarPythonScript(SCRIPT_IMAGENES, [path], 80 * 1024 * 1024);
    const raw = JSON.parse(out.trim()) as { paginas?: unknown[] };
    const paginas: PaginaImagen[] = [];
    if (Array.isArray(raw.paginas)) {
      for (const p of raw.paginas) {
        if (!p || typeof p !== "object") continue;
        const o = p as Record<string, unknown>;
        const b64 = String(o.base64 ?? "").trim();
        if (!b64) continue;
        paginas.push({
          n: Number(o.n ?? paginas.length + 1),
          base64: b64,
          mediaType:
            String(o.media_type ?? "") === "image/png" ? "image/png" : "image/jpeg",
        });
      }
    }
    return paginas;
  } finally {
    limpiarTemp(dir);
  }
}
