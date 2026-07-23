#!/usr/bin/env python3
"""
Auditoría interpretación vs PDF real (sin cruce).
Compara cada campo extraído contra la transcripción PyMuPDF.

Uso:
  python3 scripts/audit-interpretacion.py 1 2 3 4 5
  python3 scripts/audit-interpretacion.py 1 --json
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "data/a fijarse"


def load_pdf_text(pdf: Path) -> str:
    out = subprocess.run(
        [sys.executable, str(ROOT / "scripts/pdf_texto.py"), str(pdf)],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(out.stdout)["texto"]


def norm_digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def norm_alpha(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


def monto_en_texto(valor: str | None, texto: str) -> str:
    if not valor:
        return "skip"
    v = str(valor).strip()
    if not v:
        return "skip"
    dig = norm_digits(v)
    if len(dig) < 2:
        return "no_verificable"
    td = norm_digits(texto)
    if dig in td:
        return "ok"
    # tolerancia coma/punto: buscar prefijo significativo
    if len(dig) >= 4 and dig[:4] in td:
        return "parcial"
    # variantes con coma decimal en PDF
    alt = v.replace(".", ",")
    if alt in texto or v.replace(",", ".") in texto:
        return "ok"
    return "inventado"


def texto_en_pdf(fragmento: str | None, texto: str, min_len: int = 4) -> str:
    if not fragmento:
        return "skip"
    f = str(fragmento).strip()
    if not f:
        return "skip"
    if f.upper() in texto.upper():
        return "ok"
    # nombre empresa: primer token significativo
    tok = re.sub(r"[^A-Za-z0-9]", " ", f).split()
    tok = [t for t in tok if len(t) >= 4]
    if tok and tok[0].upper() in texto.upper():
        return "parcial"
    dig = norm_digits(f)
    if len(dig) >= 6 and dig in norm_digits(texto):
        return "ok"
    if len(f) >= min_len and f[: min(len(f), 12)].upper() in texto.upper():
        return "parcial"
    return "inventado"


def ncm_en_texto(ncm: str | None, texto: str) -> str:
    if not ncm:
        return "skip"
    n = str(ncm).strip().upper()
    if n in texto.upper():
        return "ok"
    dig = norm_digits(n)
    if len(dig) >= 8 and dig in norm_digits(texto):
        return "ok"
    return "inventado"


def auditar_campo(campo: str, estado: str, valor, nota: str = "") -> dict:
    return {"campo": campo, "valor": valor, "estado": estado, "nota": nota}


def auditar_item(carpeta: str, item: dict, pdf_path: Path) -> dict:
    texto = load_pdf_text(pdf_path)
    datos = item.get("datos") or {}
    com = datos.get("comercial") or {}
    merc = datos.get("mercaderia") or {}
    orig = datos.get("origen") or {}
    trans = datos.get("transporte") or {}
    pago = datos.get("pago") or {}

    campos: list[dict] = []

    campos.append(
        auditar_campo(
            "lectura_pdf",
            "ok" if len(texto) > 80 else "fallo",
            len(texto),
            "chars en PDF",
        )
    )

    # NCM
    e = ncm_en_texto(merc.get("ncm"), texto)
    campos.append(
        auditar_campo("mercaderia.ncm", e, merc.get("ncm"), "debe figurar en PDF")
    )

    for k in ("valor_factura", "valor_fob", "valor_cif", "flete", "seguro"):
        e = monto_en_texto(com.get(k), texto)
        if e != "skip":
            campos.append(auditar_campo(f"comercial.{k}", e, com.get(k)))

    if com.get("incoterm"):
        e = texto_en_pdf(com["incoterm"], texto, 3)
        campos.append(auditar_campo("comercial.incoterm", e, com["incoterm"]))

    if com.get("moneda"):
        e = texto_en_pdf(com["moneda"], texto, 3)
        campos.append(
            auditar_campo(
                "comercial.moneda",
                e,
                com["moneda"],
                "moneda debe aparecer en el doc",
            )
        )

    for k in ("cantidad", "peso_neto", "peso_bruto", "bultos"):
        v = merc.get(k)
        if v:
            e = monto_en_texto(str(v), texto)
            if e == "inventado":
                e = texto_en_pdf(str(v)[:20], texto)
            campos.append(auditar_campo(f"mercaderia.{k}", e, v))

    if merc.get("mercaderia"):
        e = texto_en_pdf(merc.get("mercaderia", "")[:30], texto)
        campos.append(auditar_campo("mercaderia.descripcion", e, merc.get("mercaderia", "")[:60]))

    for p in datos.get("partes") or []:
        etiqueta = p.get("etiqueta", "?")
        if p.get("nombre"):
            e = texto_en_pdf(p["nombre"], texto)
            campos.append(auditar_campo(f"partes.{etiqueta}.nombre", e, p["nombre"]))
        if p.get("identificacion"):
            e = texto_en_pdf(p["identificacion"], texto)
            campos.append(
                auditar_campo(f"partes.{etiqueta}.id", e, p["identificacion"])
            )

    for k in ("pais_origen", "pais_destino", "pais_procedencia"):
        v = orig.get(k)
        if v:
            e = texto_en_pdf(v, texto, 3)
            campos.append(auditar_campo(f"origen.{k}", e, v))

    if trans.get("transporte_doc_nro"):
        e = texto_en_pdf(trans["transporte_doc_nro"], texto)
        if e == "inventado":
            # nº parcial (sin puntos)
            n = re.sub(r"[^A-Z0-9]", "", trans["transporte_doc_nro"].upper())
            if n and n[:6] in norm_alpha(texto):
                e = "parcial"
        campos.append(
            auditar_campo("transporte.doc_nro", e, trans["transporte_doc_nro"])
        )

    if pago.get("fecha_factura"):
        f = pago["fecha_factura"]
        partes = re.findall(r"\d+", f)
        if partes and all(p in texto for p in partes[:3]):
            e = "ok"
        elif partes and partes[0] in texto:
            e = "parcial"
        else:
            e = "inventado"
        campos.append(auditar_campo("pago.fecha_factura", e, f))

    if datos.get("via"):
        # vía puede inferirse de CRT/BL — marcar parcial si no literal
        v = datos["via"]
        patrones = {
            "terrestre": r"CRT|CARRETERA|TRUCK|ROAD|TERREST",
            "maritima": r"BL|VESSEL|MARIT|MAERSK|CONTENEDOR",
            "aerea": r"AWB|AIR|AEREO|AÉRE",
        }
        if re.search(patrones.get(v, ""), texto, re.I):
            e = "ok"
        else:
            e = "no_verificable"
        campos.append(auditar_campo("via", e, v))

    inventados = [c for c in campos if c["estado"] == "inventado"]
    parciales = [c for c in campos if c["estado"] == "parcial"]
    verificados = [c for c in campos if c["estado"] == "ok"]

    ok_doc = len(inventados) == 0
    return {
        "carpeta": carpeta,
        "archivo": item.get("archivo"),
        "tipo": item.get("tipo_final"),
        "lectura_chars": len(texto),
        "ok": ok_doc,
        "resumen": f"{len(verificados)} ok · {len(parciales)} parcial · {len(inventados)} inventado",
        "inventados": inventados,
        "parciales": parciales,
        "campos": campos,
    }


def auditar_carpeta(carpeta: str) -> dict:
    fixture = ROOT / f"scripts/fixtures/benchmark-interpretacion-carpeta-{carpeta}.json"
    if not fixture.exists():
        raise FileNotFoundError(f"Sin fixture: {fixture}")
    data = json.loads(fixture.read_text())
    items = data.get("items") or []
    resultados = []
    for item in items:
        pdf = BASE / carpeta / item["archivo"]
        if not pdf.exists():
            resultados.append(
                {
                    "archivo": item["archivo"],
                    "ok": False,
                    "error": "pdf_no_encontrado",
                }
            )
            continue
        resultados.append(auditar_item(carpeta, item, pdf))

    ok_n = sum(1 for r in resultados if r.get("ok"))
    return {
        "carpeta": carpeta,
        "ok": ok_n,
        "total": len(resultados),
        "documentos": resultados,
    }


def main() -> None:
    carpetas = [a for a in sys.argv[1:] if a.isdigit()] or ["1", "2", "3", "4", "5"]
    json_out = "--json" in sys.argv
    informes = []
    for c in carpetas:
        informes.append(auditar_carpeta(c))

    out_path = ROOT / "scripts/fixtures/audit-interpretacion.json"
    out_path.write_text(json.dumps(informes, indent=2, ensure_ascii=False), encoding="utf-8")

    if json_out:
        print(json.dumps(informes, indent=2, ensure_ascii=False))
        return

    total_ok = sum(i["ok"] for i in informes)
    total = sum(i["total"] for i in informes)
    print(f"\n{'='*60}")
    print(f"AUDITORÍA INTERPRETACIÓN — {total_ok}/{total} PDFs sin campos inventados")
    print(f"{'='*60}")

    for inf in informes:
        print(f"\n--- Carpeta {inf['carpeta']} ({inf['ok']}/{inf['total']}) ---")
        for doc in inf["documentos"]:
            if doc.get("error"):
                print(f"  {doc['archivo']}: ERROR {doc['error']}")
                continue
            flag = "OK" if doc["ok"] else "FALLA"
            print(f"  [{flag}] {doc['archivo']} ({doc['tipo']}) — {doc['resumen']}")
            for c in doc.get("inventados") or []:
                print(f"       INVENTADO · {c['campo']} = {c['valor']}")
            for c in doc.get("parciales") or []:
                print(f"       parcial · {c['campo']} = {c['valor']}")

    print(f"\nGuardado: {out_path}")


if __name__ == "__main__":
    main()
