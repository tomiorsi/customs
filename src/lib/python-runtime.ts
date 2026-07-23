import "server-only";

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Cola global: un script Python a la vez (servidor liviano). */
let colaPython: Promise<unknown> = Promise.resolve();

/** Intérprete Python del proyecto (.venv) o python3 del sistema. */
export function pythonBin(): string {
  const venv = join(process.cwd(), ".venv", "bin", "python3");
  if (existsSync(venv)) return venv;
  const venvWin = join(process.cwd(), ".venv", "Scripts", "python.exe");
  if (existsSync(venvWin)) return venvWin;
  return "python3";
}

/** Variables de entorno para scripts Python (modelos OCR dentro del proyecto). */
export function envPythonScripts(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DESPACHANTE_ROOT: process.cwd(),
    EASYOCR_MODEL_DIR: join(process.cwd(), "data", "easyocr-models"),
  };
}

/**
 * Ejecuta un script Python en serie (nunca dos PDFs/OCR en paralelo).
 * El candado en disco (pdf_lock.py) refuerza esto si hay varios workers.
 */
export async function ejecutarPythonScript(
  script: string,
  args: string[] = [],
  maxBuffer = 20 * 1024 * 1024,
): Promise<string> {
  const run = async () => {
    const { stdout } = await execFileAsync(pythonBin(), [script, ...args], {
      encoding: "utf8",
      maxBuffer,
      env: envPythonScripts(),
    });
    return stdout;
  };
  const job = colaPython.then(run, run);
  colaPython = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}
