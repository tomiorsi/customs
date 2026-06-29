#!/usr/bin/env python3
"""
Genera src/lib/categorias-cotizador.ts para el estimador de importación.

Claves del método:
- El Derecho de Importación (di) sale del dato real (ncm.parquet, ar3 = DIE/AEC).
  Se calcula como la MODA a nivel NCM-8 (no sobre cada posición SIM), para no
  sesgar las partidas heterogéneas (p. ej. plásticos daba 35% por SIM y es 18%).
- Se agrega el rango real (diMin–diMax) como referencia.
- COBERTURA: cada capítulo del nomenclador queda asignado al menos a un grupo
  (campo 'chapters'), así "no queda nada afuera": con 'General' se llega a todo.
- IVA: 21 general; 10,5 reducido (agro/alimentos básicos, bienes de capital);
  0 exento (libros). Editable por el usuario en el cotizador.

Uso:
    python3 scripts/build_categorias_cotizador.py
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
NCM = ROOT / "data" / "Nomenclatura" / "ncm.parquet"
OUT = ROOT / "src" / "lib" / "categorias-cotizador.ts"

# (id, label, iva, nota, chapters[cobertura, 2 díg.], subs[(label, prefijo[, iva])])
CURACION = [
    ("informatica", "Informática y telecomunicaciones", 21,
     "Régimen BIT: gran parte queda en 0% de derecho.", [], [
         ("Computadoras y notebooks", "8471"),
         ("Monitores y proyectores", "8528"),
         ("Impresoras y multifunción", "8443"),
         ("Almacenamiento y soportes (SSD, discos)", "8523"),
         ("Equipos de red (routers, switches)", "851762"),
         ("Circuitos integrados y chips", "8542"),
         ("Partes y accesorios de PC", "8473"),
     ]),
    ("electronica", "Electrónica de consumo", 21, None, [], [
        ("Celulares y smartphones", "851713"),
        ("Televisores", "852872"),
        ("Equipos de audio y parlantes", "8518"),
        ("Cámaras de foto y video", "8525"),
        ("Radios y reproductores", "8527"),
        ("Consolas y videojuegos", "9504"),
    ]),
    ("electrodomesticos", "Electrodomésticos", 21, None, [], [
        ("Heladeras y freezers", "8418"),
        ("Lavarropas y secarropas", "8450"),
        ("Aires acondicionados", "8415"),
        ("Cocinas, hornos y microondas", "8516"),
        ("Aspiradoras", "8508"),
        ("Ventiladores", "841451"),
        ("Pequeños electrodomésticos de cocina", "8509"),
        ("Termotanques y calefones", "8419"),
    ]),
    ("maquinaria", "Maquinaria y bienes de capital", 10.5,
     "Bienes de capital: suelen tributar IVA 10,5% (según planilla BK).",
     ["84", "85"], [
         ("Bombas y compresores", "8413"),
         ("Motores y generadores eléctricos", "8501"),
         ("Máquinas herramienta", "8458"),
         ("Maquinaria agrícola", "8432"),
         ("Maquinaria para construcción", "8429"),
         ("Equipos de frío/aire industrial", "8414"),
         ("Motores de combustión", "8408"),
         ("Transformadores y tableros eléctricos", "8504"),
     ]),
    ("herramientas", "Herramientas", 21, None, ["82"], [
        ("Herramientas manuales", "8205"),
        ("Herramientas eléctricas", "8467"),
        ("Útiles intercambiables (mechas, discos)", "8207"),
        ("Cuchillería y cubiertos", "8211"),
    ]),
    ("autopartes", "Autopartes y repuestos", 21, None, [], [
        ("Partes de carrocería y mecánica", "8708"),
        ("Neumáticos", "4011"),
        ("Baterías", "8507"),
        ("Filtros", "842123"),
        ("Bujías y encendido eléctrico", "8511"),
        ("Vidrios para vehículos", "7007"),
    ]),
    ("vehiculos", "Vehículos y transporte", 21,
     "Régimen automotor: condiciones particulares.",
     ["86", "87", "88", "89"], [
         ("Automóviles", "8703"),
         ("Camionetas y camiones", "8704"),
         ("Motos y ciclomotores", "8711"),
         ("Bicicletas", "8712"),
         ("Tractores", "8701"),
         ("Remolques", "8716"),
         ("Embarcaciones", "8903"),
     ]),
    ("indumentaria", "Indumentaria y accesorios", 21,
     None, ["61", "62", "63", "65", "66", "67"], [
         ("Prendas de punto (remeras, buzos)", "61"),
         ("Prendas no de punto (camisas, pantalones)", "62"),
         ("Ropa de hogar y blanquería", "63"),
         ("Gorros y sombreros", "65"),
         ("Paraguas y bastones", "66"),
     ]),
    ("textil_telas", "Telas, hilados y fibras", 21,
     None, ["50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60"], [
         ("Telas de algodón", "52"),
         ("Filamentos sintéticos", "54"),
         ("Fibras sintéticas discontinuas", "55"),
         ("Tejidos de punto", "60"),
         ("Alfombras", "57"),
         ("Lana y pelo fino", "51"),
     ]),
    ("calzado", "Calzado", 21, None, ["64"], [
        ("Calzado de cuero", "6403"),
        ("Calzado deportivo / textil", "6404"),
        ("Calzado de caucho o plástico", "6402"),
        ("Partes de calzado", "6406"),
    ]),
    ("juguetes", "Juguetes y artículos deportivos", 21, None, ["95"], [
        ("Juguetes", "9503"),
        ("Consolas y videojuegos", "9504"),
        ("Artículos deportivos y gimnasia", "9506"),
        ("Artículos de fiesta", "9505"),
    ]),
    ("muebles", "Muebles e iluminación", 21, None, ["94"], [
        ("Asientos y sillas", "9401"),
        ("Muebles (otros)", "9403"),
        ("Colchones y sommiers", "9404"),
        ("Artefactos de iluminación", "9405"),
    ]),
    ("plasticos", "Plásticos y caucho", 21, None, ["39", "40"], [
        ("Manufacturas de plástico", "3926"),
        ("Envases y tapas", "3923"),
        ("Tubos y accesorios", "3917"),
        ("Placas, films y láminas", "3920"),
        ("Resinas plásticas (materia prima)", "3901"),
        ("Manufacturas de caucho", "4016"),
    ]),
    ("metales", "Metales y sus manufacturas", 21,
     None, ["72", "73", "74", "75", "76", "78", "79", "80", "81", "83"], [
         ("Manufacturas de hierro o acero", "73"),
         ("Productos de acero (chapas, barras)", "72"),
         ("Aluminio y sus manufacturas", "76"),
         ("Cobre y sus manufacturas", "74"),
         ("Herrajes, cerraduras y bazar metálico", "83"),
     ]),
    ("construccion", "Construcción: vidrio, cerámica y piedra", 21,
     None, ["25", "68", "69", "70"], [
         ("Cerámica y porcelana", "69"),
         ("Vidrio y sus manufacturas", "70"),
         ("Manufacturas de piedra, yeso, cemento", "68"),
         ("Cemento, cal y yeso", "2523"),
     ]),
    ("quimicos", "Químicos e insumos industriales", 21,
     None, ["28", "29", "32", "35", "36", "37", "38"], [
         ("Químicos orgánicos", "29"),
         ("Químicos inorgánicos", "28"),
         ("Pinturas y barnices", "32"),
         ("Productos diversos de la química", "38"),
         ("Productos fotográficos", "37"),
     ]),
    ("fertilizantes", "Abonos y fertilizantes", 10.5,
     "Fertilizantes de uso agrícola: IVA reducido 10,5%.", ["31"], [
         ("Abonos minerales o químicos", "3105"),
         ("Abonos nitrogenados", "3102"),
     ]),
    ("farma", "Productos farmacéuticos y salud", 21,
     "Medicamentos: el tratamiento de IVA depende del producto y la etapa.",
     ["30"], [
         ("Medicamentos", "3004"),
         ("Material de curación y apósitos", "3005"),
         ("Reactivos de diagnóstico", "3822"),
     ]),
    ("medico", "Instrumentos y equipos médicos", 21, None, [], [
        ("Instrumentos de medicina", "9018"),
        ("Aparatos de terapia y rehabilitación", "9019"),
        ("Prótesis y ortopedia", "9021"),
        ("Equipos de rayos X", "9022"),
    ]),
    ("instrumentos", "Óptica, precisión, relojería e instrumentos", 21,
     None, ["90", "91", "92"], [
         ("Óptica y anteojos", "9004"),
         ("Instrumentos de medición y precisión", "9031"),
         ("Relojes", "9102"),
         ("Instrumentos musicales", "92"),
         ("Cámaras y proyectores ópticos", "9006"),
     ]),
    ("cosmetica", "Cosmética, perfumería y limpieza", 21,
     None, ["33", "34"], [
         ("Perfumes y fragancias", "3303"),
         ("Maquillaje y cuidado de la piel", "3304"),
         ("Cuidado capilar", "3305"),
         ("Higiene bucal y personal", "3307"),
         ("Jabones y productos de limpieza", "3401"),
     ]),
    ("cuero", "Cuero y marroquinería", 21, None, ["41", "42", "43"], [
        ("Bolsos, carteras y billeteras", "4202"),
        ("Cueros y pieles curtidas", "41"),
        ("Prendas de cuero", "4203"),
        ("Peletería", "43"),
    ]),
    ("madera", "Madera, corcho y cestería", 21, None, ["44", "45", "46"], [
        ("Manufacturas de madera", "4421"),
        ("Tableros y aglomerados", "4411"),
        ("Madera en bruto o aserrada", "4407"),
        ("Corcho y sus manufacturas", "45"),
    ]),
    ("papel", "Papel, cartón y librería", 21, None, ["47", "48"], [
        ("Papel y cartón", "4802"),
        ("Cajas y envases de cartón", "4819"),
        ("Artículos de librería de papel", "4820"),
        ("Pañales y artículos de higiene", "4818"),
    ]),
    ("libros", "Libros e impresos", 0,
     "Venta de libros exenta de IVA; otros impresos pueden tributar 21%.",
     ["49"], [
         ("Libros", "4901"),
         ("Diarios y revistas", "4902"),
         ("Mapas y otros impresos", "4911", 21),
     ]),
    ("alimentos", "Alimentos y bebidas (procesados)", 21,
     None, ["16", "17", "18", "19", "20", "21", "23"], [
         ("Conservas de carne y pescado", "16"),
         ("Azúcar y confitería", "17"),
         ("Cacao y chocolate", "18"),
         ("Galletitas y panificados", "19"),
         ("Conservas de frutas y verduras", "20"),
         ("Preparaciones alimenticias diversas", "21"),
     ]),
    ("bebidas", "Bebidas y tabaco", 21, None, ["22", "24"], [
        ("Vinos", "2204"),
        ("Bebidas espirituosas (licores)", "2208"),
        ("Cervezas", "2203"),
        ("Aguas y gaseosas", "2202"),
        ("Tabaco y derivados", "24"),
    ]),
    ("agro", "Agro: animales, granos y frescos", 10.5,
     "Alimentos básicos sin elaborar: IVA reducido 10,5%.",
     ["01", "02", "03", "04", "05", "06", "07", "08", "09",
      "10", "11", "12", "13", "14", "15"], [
         ("Carnes y despojos", "02"),
         ("Pescados y mariscos", "03"),
         ("Lácteos, huevos y miel", "04"),
         ("Frutas y frutos", "08"),
         ("Hortalizas y legumbres", "07"),
         ("Cereales y granos", "10"),
         ("Semillas y oleaginosas", "12"),
         ("Café, té y especias", "09"),
         ("Aceites y grasas", "15"),
     ]),
    ("mineria", "Minería y combustibles", 21,
     None, ["26", "27"], [
         ("Combustibles y aceites minerales", "27"),
         ("Minerales y escorias", "26"),
     ]),
    ("joyeria", "Joyería y piedras preciosas", 21, None, ["71"], [
        ("Joyas de metal precioso", "7113"),
        ("Bijouterie / fantasía", "7117"),
        ("Piedras preciosas", "7103"),
    ]),
    ("armas", "Armas y municiones", 21, None, ["93"], [
        ("Armas", "9303"),
        ("Municiones y partes", "9306"),
    ]),
    ("arte", "Obras de arte y antigüedades", 21, None, ["97"], [
        ("Cuadros y pinturas", "9701"),
        ("Antigüedades", "9706"),
    ]),
    ("diversas", "Manufacturas diversas (bazar, etc.)", 21,
     None, ["96"], [
         ("Artículos de escritura (lapiceras)", "9608"),
         ("Cepillos y artículos de higiene", "9603"),
         ("Encendedores", "9613"),
         ("Artículos varios", "96"),
     ]),
    ("otros", "Otros / no estoy seguro", 21,
     "Si no encontrás el rubro, usá esta opción; lo afinamos por NCM.", [], []),
]


def fmt_codigo(d: str) -> str:
    if len(d) == 2:
        return d
    if len(d) == 4:
        return f"{d[:2]}.{d[2:]}"
    if len(d) == 6:
        return f"{d[:4]}.{d[4:]}"
    if len(d) >= 8:
        return f"{d[:4]}.{d[4:6]}.{d[6:8]}"
    return d


def die_repr(rows: pd.DataFrame):
    """(di representativo = moda a nivel NCM-8, diMin, diMax) o None."""
    rows = rows.dropna(subset=["ar3"])
    if rows.empty:
        return None
    por_ncm = rows.groupby("ncm8")["ar3"].agg(lambda x: x.value_counts().idxmax())
    di = float(por_ncm.value_counts().idxmax())
    return round(di, 1), round(float(rows["ar3"].min()), 1), round(float(rows["ar3"].max()), 1)


def main():
    ncm = pd.read_parquet(NCM)
    s = ncm[ncm["ar3"].notna()].copy()
    s["ncm8"] = s["codigo_num"].str[:8]

    chapters_disponibles = set(
        ncm[ncm["nivel"] == "capitulo"]["codigo_num"]
    )

    grupos = []
    cobertura = set()
    dropped = []
    for cid, label, iva, nota, chapters, subs in CURACION:
        cobertura.update(chapters)

        # filas del grupo (por capítulos de cobertura, o por subs si no hay)
        if chapters:
            grow = s[s["codigo_num"].str.startswith(tuple(chapters))]
        else:
            prefs = tuple(p for (_, p, *_) in subs)
            grow = s[s["codigo_num"].str.startswith(prefs)] if prefs else s.iloc[0:0]

        g_die = die_repr(grow)
        di_grupo = g_die[0] if g_die else 18.0
        di_grupo_min = g_die[1] if g_die else 18.0
        di_grupo_max = g_die[2] if g_die else 18.0

        sub_out = []
        for sub in subs:
            slabel, pref = sub[0], sub[1]
            siva = sub[2] if len(sub) > 2 else None
            rows = s[s["codigo_num"].str.startswith(pref)]
            d = die_repr(rows)
            if d is None:
                dropped.append((cid, slabel, pref))
                continue
            di, dmin, dmax = d
            sub_out.append({
                "id": f"{cid}-{pref}",
                "label": slabel,
                "ncm": fmt_codigo(pref),
                "di": di,
                "diMin": dmin,
                "diMax": dmax,
                **({"iva": siva} if siva is not None else {}),
            })

        grupos.append({
            "id": cid,
            "label": label,
            "iva": iva,
            "di": di_grupo,
            "diMin": di_grupo_min,
            "diMax": di_grupo_max,
            "nota": nota,
            "subs": sub_out,
        })

    # Coberturra: ¿quedó algún capítulo afuera?
    faltan = sorted(c for c in chapters_disponibles if c not in cobertura and c != "00")
    if faltan:
        print("AVISO: capítulos sin asignar a ningún grupo:", faltan)
    if dropped:
        print("AVISO: subs sin datos (omitidas):", dropped)

    cabecera = (
        "// ARCHIVO GENERADO por scripts/build_categorias_cotizador.py — NO editar a mano.\n"
        "// di / diMin / diMax = Derecho de Importación (%) del nomenclador (ncm.parquet, ar3).\n"
        "// di = moda a nivel NCM-8. iva: 21 general, 10,5 reducido, 0 exento.\n\n"
        "export type SubCategoria = {\n"
        "  id: string;\n"
        "  label: string;\n"
        "  ncm: string;\n"
        "  di: number;\n"
        "  diMin: number;\n"
        "  diMax: number;\n"
        "  /** IVA propio si difiere del grupo. */\n"
        "  iva?: number;\n"
        "};\n\n"
        "export type Grupo = {\n"
        "  id: string;\n"
        "  label: string;\n"
        "  iva: number;\n"
        "  di: number;\n"
        "  diMin: number;\n"
        "  diMax: number;\n"
        "  nota?: string;\n"
        "  subs: SubCategoria[];\n"
        "};\n\n"
    )
    cuerpo = "export const GRUPOS: Grupo[] = " + json.dumps(
        grupos, ensure_ascii=False, indent=2
    ) + ";\n"
    cuerpo = cuerpo.replace('  "nota": null,\n', "")
    OUT.write_text(cabecera + cuerpo, encoding="utf-8")

    print("OK ->", OUT.relative_to(ROOT))
    print(f"grupos={len(grupos)}  capítulos cubiertos={len(cobertura)}")
    for g in grupos:
        print(f"  {g['label']:42} di={g['di']:>5}  iva={g['iva']:>4}  subs={len(g['subs'])}")


if __name__ == "__main__":
    main()
