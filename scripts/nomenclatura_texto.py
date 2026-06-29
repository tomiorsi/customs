"""
Texto del nomenclador NCM: recuperación de acentos ARCA y normalización para búsqueda.

ARCA exporta vocales acentuadas como '?'. `fix_accents` solo corrige tokens que
contienen '?' y están en CORR. Los que queden sin mapear se reparan con
`scripts/fix_acentos_parquet.py` (corrector + diccionario extendido).
"""
from __future__ import annotations

import re
import unicodedata

# Tokens con '?' → forma correcta (minúsculas; fix_accents respeta mayúsculas).
CORR: dict[str, str] = {
    "dem?s": "demás", "m?s": "más", "n?mero": "número", "n?": "n°",
    "di?metro": "diámetro", "di?metros": "diámetros", "seg?n": "según",
    "designaci?n": "designación", "micr?metros": "micrómetros",
    "micr?metro": "micrómetro", "t?tulo": "título", "t?tulos": "títulos",
    "?cido": "ácido", "?cidos": "ácidos", "?ndice": "índice",
    "art?culo": "artículo", "art?culos": "artículos", "?tem": "ítem", "?tems": "ítems",
    "ca?ones": "cañones", "ca?on": "cañón", "percusi?n": "percusión",
    "dioptr?as": "dioptrías", "dioptr?a": "dioptría", "pl?stico": "plástico", "pl?sticos": "plásticos",
    "m?quina": "máquina", "m?quinas": "máquinas", "m?trico": "métrico",
    "m?trica": "métrica", "m?tricos": "métricos", "m?tricas": "métricas",
    "veh?culo": "vehículo", "veh?culos": "vehículos", "tama?o": "tamaño",
    "tama?os": "tamaños", "concentraci?n": "concentración",
    "a?o": "año", "a?os": "años", "disoluci?n": "disolución",
    "pol?mero": "polímero", "pol?meros": "polímeros", "resoluci?n": "resolución",
    "autom?vil": "automóvil", "autom?viles": "automóviles", "algod?n": "algodón",
    "com?n": "común", "comu?n": "común", "secci?n": "sección",
    "acr?lico": "acrílico", "acr?licos": "acrílicos", "acr?lica": "acrílica",
    "acr?licas": "acrílicas", "frigor?as": "frigorías", "cap?tulo": "capítulo",
    "cap?tulos": "capítulos", "impresi?n": "impresión", "fabricaci?n": "fabricación",
    "?xido": "óxido", "?xidos": "óxidos", "presi?n": "presión",
    "te?ido": "teñido", "te?idos": "teñidos", "te?ida": "teñida",
    "te?idas": "teñidas", "poli?ster": "poliéster", "poli?steres": "poliésteres",
    "az?car": "azúcar", "fen?lico": "fenólico", "fen?licos": "fenólicos",
    "fen?lica": "fenólica", "fen?licas": "fenólicas", "ray?n": "rayón",
    "el?ctrico": "eléctrico", "el?ctricos": "eléctricos", "el?ctrica": "eléctrica",
    "el?ctricas": "eléctricas", "ure?cas": "ureicas", "ure?ca": "ureica",
    "dise?ado": "diseñado", "dise?ados": "diseñados", "dise?ada": "diseñada",
    "dise?adas": "diseñadas", "dise?ar": "diseñar", "todav?a": "todavía",
    "?ptico": "óptico", "?pticos": "ópticos", "?ptica": "óptica",
    "?pticas": "ópticas", "s?dico": "sódico", "s?dica": "sódica",
    "cil?ndrico": "cilíndrico", "cil?ndrica": "cilíndrica",
    "cil?ndricos": "cilíndricos", "cil?ndricas": "cilíndricas",
    "ni?o": "niño", "ni?os": "niños", "ni?a": "niña", "ni?as": "niñas",
    "petr?leo": "petróleo", "c?scara": "cáscara", "r?o": "río",
    "tensi?n": "tensión", "adici?n": "adición", "?nicamente": "únicamente",
    "?nico": "único", "?nica": "única", "?nicos": "únicos", "?nicas": "únicas",
    "cart?n": "cartón", "autom?tico": "automático", "autom?tica": "automática",
    "autom?ticos": "automáticos", "autom?ticas": "automáticas",
    "electr?nico": "electrónico", "electr?nica": "electrónica",
    "electr?nicos": "electrónicos", "electr?nicas": "electrónicas",
    "qu?mico": "químico", "qu?mica": "química", "qu?micos": "químicos",
    "qu?micas": "químicas", "org?nico": "orgánico", "org?nica": "orgánica",
    "org?nicos": "orgánicos", "org?nicas": "orgánicas",
    "inorg?nico": "inorgánico", "inorg?nica": "inorgánica",
    "inorg?nicos": "inorgánicos", "inorg?nicas": "inorgánicas",
    "l?quido": "líquido", "l?quidos": "líquidos", "l?quida": "líquida",
    "l?quidas": "líquidas", "s?lido": "sólido", "s?lidos": "sólidos",
    "s?lida": "sólida", "s?lidas": "sólidas", "t?rmico": "térmico",
    "t?rmica": "térmica", "t?rmicos": "térmicos", "t?rmicas": "térmicas",
    "mec?nico": "mecánico", "mec?nica": "mecánica", "mec?nicos": "mecánicos",
    "mec?nicas": "mecánicas", "hidr?ulico": "hidráulico", "hidr?ulica": "hidráulica",
    "hidr?ulicos": "hidráulicos", "hidr?ulicas": "hidráulicas",
    "neum?tico": "neumático", "neum?tica": "neumática", "neum?ticos": "neumáticos",
    "neum?ticas": "neumáticas", "v?lvula": "válvula", "v?lvulas": "válvulas",
    "cer?mico": "cerámico", "cer?mica": "cerámica", "cer?micos": "cerámicos",
    "cer?micas": "cerámicas", "met?lico": "metálico", "met?lica": "metálica",
    "met?licos": "metálicos", "met?licas": "metálicas", "el?stico": "elástico",
    "el?sticos": "elásticos", "el?stica": "elástica", "el?sticas": "elásticas",
    "fundici?n": "fundición", "aleaci?n": "aleación", "protecci?n": "protección",
    "aplicaci?n": "aplicación", "preparaci?n": "preparación",
    "composici?n": "composición", "producci?n": "producción",
    "prote?na": "proteína", "prote?nas": "proteínas", "caf?": "café",
    "ma?z": "maíz", "l?nea": "línea", "l?neas": "líneas", "pa?s": "país",
    "pa?ses": "países", "nitr?geno": "nitrógeno", "hidr?geno": "hidrógeno",
    "ox?geno": "oxígeno", "f?sforo": "fósforo", "c?digo": "código",
    "c?digos": "códigos", "m?dulo": "módulo", "m?dulos": "módulos",
    "estampaci?n": "estampación", "graduaci?n": "graduación",
    "obtenci?n": "obtención", "fijaci?n": "fijación", "n?cleo": "núcleo",
    "n?cleos": "núcleos", "art?stico": "artístico", "art?sticos": "artísticos",
    "gr?fico": "gráfico", "gr?fica": "gráfica", "gr?ficos": "gráficos",
    "gr?ficas": "gráficas", "fotogr?fico": "fotográfico",
    "fotogr?ficos": "fotográficos", "fotogr?fica": "fotográfica",
    "fotogr?ficas": "fotográficas", "telef?nico": "telefónico",
    "telef?nica": "telefónica", "telef?nicos": "telefónicos",
    "anal?gico": "analógico", "anal?gicos": "analógicos",
    "?ngulo": "ángulo", "?ngulos": "ángulos", "m?ximo": "máximo",
    "m?xima": "máxima", "m?ximos": "máximos", "m?ximas": "máximas",
    "m?nimo": "mínimo", "m?nima": "mínima", "m?nimos": "mínimos",
    "m?nimas": "mínimas", "kil?metro": "kilómetro", "kil?metros": "kilómetros",
    "di?xido": "dióxido", "tri?xido": "trióxido", "per?xido": "peróxido",
    "per?xidos": "peróxidos", "hidr?xido": "hidróxido", "hidr?xidos": "hidróxidos",
    "?steres": "ésteres", "?ster": "éster", "?teres": "éteres", "?ter": "éter",
    "alcali?": "alcalí", "soluci?n": "solución", "soluci?nes": "soluciones",
    "secaci?n": "secación", "fundaci?n": "fundación", "vac?o": "vacío",
    "fr?o": "frío", "calor?fico": "calorífico", "el?ctrodo": "eléctrodo",
}

WORD_RE = re.compile(r"[A-Za-zÁÉÍÓÚÑÜáéíóúñü?]+")


def _fix_token(m: re.Match) -> str:
    tok = m.group(0)
    if "?" not in tok:
        return tok
    rep = CORR.get(tok.lower())
    if rep is None:
        return tok
    if tok.isupper():
        return rep.upper()
    if tok[:1].isupper():
        return rep[:1].upper() + rep[1:]
    return rep


def fix_accents(text: str) -> str:
    """Recupera acentos en tokens con '?' usando CORR."""
    if not text:
        return ""
    text = WORD_RE.sub(_fix_token, text)
    return " ".join(text.split())


def normalizar(text: str) -> str:
    """Texto para búsqueda: minúsculas, sin acentos."""
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower().replace("?", " ")
    text = re.sub(r"[^a-z0-9ñ ]+", " ", text)
    return " ".join(text.split())
