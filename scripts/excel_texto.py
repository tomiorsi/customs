#!/usr/bin/env python3
"""Convierte una planilla a texto, para que la lea la IA como si fuera un PDF.

Muchos proveedores mandan la factura y el packing list en Excel, no en PDF.
Antes eso obligaba al despachante a imprimirlo a PDF para poder subirlo.

Se emite Markdown y no CSV a propósito: la IA lee mucho mejor una tabla con
encabezados alineados que una lista de valores separados por comas, sobre todo
cuando la planilla trae varias hojas y filas de encabezado antes de la tabla —
que es justo la forma de una proforma.

Uso:  excel_texto.py <archivo.xls|.xlsx>
Sale por stdout. Un error va a stderr con código distinto de cero.
"""
import sys
import os


# Una planilla de proveedor no tiene miles de filas. Si aparece una, es un
# listado de stock y no una factura: se corta y se avisa, en vez de mandarle
# cien mil renglones a la IA.
MAX_FILAS = 2000
MAX_COLUMNAS = 60


def _celda(v):
    """Valor de celda a texto, sin notación científica ni decimales de más."""
    if v is None:
        return ""
    if isinstance(v, float):
        # 10.0 → «10», pero 0.025 se conserva: son precios unitarios.
        if v == int(v) and abs(v) < 1e15:
            return str(int(v))
        return repr(round(v, 6))
    return str(v).strip()


def _tabla(nombre, filas):
    """Filas → tabla Markdown, recortando columnas y filas vacías."""
    filas = [f for f in filas if any(_celda(c) for c in f)]
    if not filas:
        return f"## Hoja: {nombre}\n\n_(vacía)_\n"

    ancho = max(len(f) for f in filas)
    # Columnas que están vacías en toda la hoja: no aportan y ensucian.
    usadas = [j for j in range(ancho) if any(_celda(f[j]) if j < len(f) else "" for f in filas)]
    if not usadas:
        return f"## Hoja: {nombre}\n\n_(vacía)_\n"

    out = [f"## Hoja: {nombre}", ""]
    for i, f in enumerate(filas):
        celdas = [_celda(f[j]) if j < len(f) else "" for j in usadas]
        out.append("| " + " | ".join(c.replace("|", "\\|") for c in celdas) + " |")
        # El separador va después de la PRIMERA fila con contenido, que en una
        # planilla no siempre es el encabezado de la tabla — a veces arriba hay
        # datos del proveedor. No importa: la IA lee el conjunto igual, y así
        # el Markdown queda bien formado.
        if i == 0:
            out.append("|" + "---|" * len(usadas))
    out.append("")
    return "\n".join(out)


def leer_xls(path):
    import xlrd

    libro = xlrd.open_workbook(path)
    partes = []
    for hoja in libro.sheets():
        filas = []
        for i in range(min(hoja.nrows, MAX_FILAS)):
            filas.append([hoja.cell_value(i, j) for j in range(min(hoja.ncols, MAX_COLUMNAS))])
        if hoja.nrows > MAX_FILAS:
            filas.append([f"(recortado: la hoja tiene {hoja.nrows} filas)"])
        partes.append(_tabla(hoja.name, filas))
    return partes


def leer_xlsx(path):
    import openpyxl

    # `data_only` toma el resultado de las fórmulas, no la fórmula: al
    # despachante le importa el importe, no cómo se calculó.
    libro = openpyxl.load_workbook(path, data_only=True, read_only=True)
    partes = []
    for hoja in libro.worksheets:
        filas = []
        for i, fila in enumerate(hoja.iter_rows(values_only=True)):
            if i >= MAX_FILAS:
                filas.append([f"(recortado en {MAX_FILAS} filas)"])
                break
            filas.append(list(fila[:MAX_COLUMNAS]))
        partes.append(_tabla(hoja.title, filas))
    libro.close()
    return partes


def main():
    if len(sys.argv) < 2:
        print("Falta el archivo.", file=sys.stderr)
        return 2
    path = sys.argv[1]
    if not os.path.exists(path):
        print(f"No existe: {path}", file=sys.stderr)
        return 2

    ext = os.path.splitext(path)[1].lower()
    try:
        # Se elige por extensión y no por contenido porque las dos librerías se
        # reparten los formatos sin superponerse: xlrd 2.x dejó de leer .xlsx y
        # openpyxl nunca leyó .xls.
        if ext == ".xls":
            partes = leer_xls(path)
        elif ext in (".xlsx", ".xlsm"):
            partes = leer_xlsx(path)
        else:
            print(f"Formato no soportado: {ext}", file=sys.stderr)
            return 3
    except Exception as e:  # noqa: BLE001
        print(f"No se pudo leer la planilla: {e}", file=sys.stderr)
        return 4

    texto = "\n".join(partes).strip()
    if not texto:
        print("La planilla no tiene contenido legible.", file=sys.stderr)
        return 5
    sys.stdout.write(texto + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
