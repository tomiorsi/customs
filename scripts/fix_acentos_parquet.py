#!/usr/bin/env python3
"""
Repara acentos perdidos ('?') en los parquets de Nomenclatura ya generados.

El export oficial de ARCA reemplaza vocales acentuadas, 'ñ', comillas («»),
grados (°) y superíndices por '?'. Como el zip fuente ya no está, reparamos
directamente los parquets existentes:

  data/Nomenclatura/ncm.parquet   (descripcion, ruta, descripcion_busqueda)
  data/Nomenclatura/sufijos.parquet (descripcion, descripcion_busqueda)
  data/Nomenclatura/notas.parquet (titulo, texto)

Estrategia de recuperación de cada palabra rota:
  1) Mapa MANUAL (términos de dominio: químicos, peces, voces extranjeras).
  2) Corrector ortográfico español (pyspellchecker): genera candidatos
     sustituyendo cada '?' por vocal acentuada/ñ y elige la palabra conocida
     más frecuente.
Las comillas («»), grados y superíndices se resuelven por contexto (regex).

Uso:
    python3 scripts/fix_acentos_parquet.py            # repara in-place
    python3 scripts/fix_acentos_parquet.py --dry-run  # solo informa
"""
from __future__ import annotations

import argparse
import itertools
import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd
from spellchecker import SpellChecker

sys.path.insert(0, str(Path(__file__).resolve().parent))
from nomenclatura_texto import CORR as BASE_CORR, fix_accents

BASE = Path(__file__).resolve().parent.parent / "data" / "Nomenclatura"

SP = SpellChecker(language="es")
ACENTOS = "áéíóúñ"

# Casos de dominio que el corrector español no suele conocer o que no puede
# decidir solo. Se escriben en minúscula; restore_token preserva mayúsculas.
MANUAL = {
    **BASE_CORR,
    "aviaci?n": "aviación",
    "cinematogr?ficas": "cinematográficas",
    "cinematogr?fica": "cinematográfica",
    "suced?neos": "sucedáneos",
    "suced?neo": "sucedáneo",
    "gr?nulos": "gránulos",
    "gr?nulo": "gránulo",
    "ac?clicos": "acíclicos",
    "ac?clicas": "acíclicas",
    "h?bridos": "híbridos",
    "h?brido": "híbrido",
    "modacr?licas": "modacrílicas",
    "modacr?licos": "modacrílicos",
    "h?medos": "húmedos",
    "h?medas": "húmedas",
    "h?medo": "húmedo",
    "h?meda": "húmeda",
    "er?cico": "erúcico",
    "fotocrom?ticas": "fotocromáticas",
    "fotocrom?ticos": "fotocromáticos",
    "copol?meros": "copolímeros",
    "copol?mero": "copolímero",
    "ara?ita": "arañita",
    "dis?dico": "disódico",
    "dis?dica": "disódica",
    "di?ptrias": "dioptrías",
    "i?nicos": "iónicos",
    "an?logos": "análogos",
    "an?logas": "análogas",
    "an?logo": "análogo",
    "an?loga": "análoga",
    "?rboles": "árboles",
    "?rbol": "árbol",
    "alif?ticos": "alifáticos",
    "alif?tico": "alifático",
    "agroqu?micos": "agroquímicos",
    "agroqu?micas": "agroquímicas",
    "b?lsamos": "bálsamos",
    "l?mparas": "lámparas",
    "al?mbrico": "alámbrico",
    "pezu?as": "pezuñas",
    "aluminoc?lcicos": "aluminocálcicos",
    "sinterizaci?n": "sinterización",
    "extra?dos": "extraídos",
    "pre?adas": "preñadas",
    "tub?rculos": "tubérculos",
    "res?nicos": "resínicos",
    "su?teres": "suéteres",
    "muc?lagos": "mucílagos",
    "gl?ndulas": "glándulas",
    "inmunol?gicos": "inmunológicos",
    "ar?ndanos": "arándanos",
    "arroc?n": "arrocín",
    "but?rica": "butírica",
    "t?rminos": "términos",
    "metal?feras": "metalíferas",
    "sulf?nico": "sulfónico",
    "sulf?nicos": "sulfónicos",
    "tretino?na": "tretinoína",
    "pesta?as": "pestañas",
    "vin?lico": "vinílico",
    "vin?licos": "vinílicos",
    "vin?lideno": "vinilideno",
    "espect?culos": "espectáculos",
    "biol?gicos": "biológicos",
    "biol?gico": "biológico",
    "activaci?n": "activación",
    "monocil?ndricos": "monocilíndricos",
    "monocil?dricos": "monocilíndricos",
    "detecci?n": "detección",
    "extrusi?n": "extrusión",
    "grabaci?n": "grabación",
    "num?ricos": "numéricos",
    "num?rico": "numérico",
    "helic?pteros": "helicópteros",
    "espa?oles": "españoles",
    "pel?feros": "pelíferos",
    "?cidas": "ácidas",
    "?cido": "ácido",
    "?cidos": "ácidos",
    "asf?lticas": "asfálticas",
    "l?quenes": "líquenes",
    "degr?s": "degrás",
    "f?siles": "fósiles",
    "?nodos": "ánodos",
    "sint?tica": "sintética",
    "sint?ticas": "sintéticas",
    "sint?tico": "sintético",
    "sint?ticos": "sintéticos",
    "cordeler?a": "cordelería",
    "orfebrer?a": "orfebrería",
    "confiter?a": "confitería",
    "panader?a": "panadería",
    "pasteler?a": "pastelería",
    "perfumer?a": "perfumería",
    "relojer?a": "relojería",
    "bisuter?a": "bisutería",
    "talabarter?a": "talabartería",
    "guarnicioner?a": "guarnicionería",
    "cervecer?a": "cervecería",
    "destiler?a": "destilería",
    "sidrer?a": "sidrería",
    "lencer?a": "lencería",
    "corseter?a": "corsetería",
    "estucher?a": "estuchería",
    "cepiller?a": "cepillería",
    "galleter?a": "galletería",
    "boller?a": "bollería",
    "tapicer?a": "tapicería",
    "sastrer?a": "sastrería",
    "peluquer?a": "peluquería",
    "ingenier?a": "ingeniería",
    "tecnolog?a": "tecnología",
    "fotograf?a": "fotografía",
    "fotograf?as": "fotografías",
    "serigraf?a": "serigrafía",
    "fotogrametr?a": "fotogrametría",
    "tomograf?a": "tomografía",
    "mamograf?a": "mamografía",
    "mamograf?as": "mamografías",
    "neurolog?a": "neurología",
    "odontolog?a": "odontología",
    "cirug?a": "cirugía",
    "meteorolog?a": "meteorología",
    "geometr?a": "geometría",
    "telefon?a": "telefonía",
    "radiotelefon?a": "radiotelefonía",
    "f?sica": "física",
    "f?sicas": "físicas",
    "f?sico": "físico",
    "f?sicos": "físicos",
    "m?sica": "música",
    "m?dico": "médico",
    "m?dicos": "médicos",
    "m?dula": "médula",
    "c?maras": "cámaras",
    "c?mara": "cámara",
    "videoc?maras": "videocámaras",
    "l?minas": "láminas",
    "l?mina": "lámina",
    "ba?les": "baúles",
    "ca?a": "caña",
    "ca?as": "cañas",
    "ca?o": "caño",
    "ca?os": "caños",
    "ca?on": "cañón",
    "ca?ones": "cañones",
    "ca??n": "cañón",
    "ca?erias": "cañerías",
    "ca?er?as": "cañerías",
    "u?as": "uñas",
    "pi?as": "piñas",
    "pi?a": "piña",
    "pi?on": "piñón",
    "pi?ones": "piñones",
    "pi??n": "piñón",
    "se?al": "señal",
    "se?ales": "señales",
    "se?alizacion": "señalización",
    "se?alizaci?n": "señalización",
    "se?uelos": "señuelos",
    "se?alamiento": "señalamiento",
    "dise?o": "diseño",
    "entra?a": "entraña",
    "peque?o": "pequeño",
    "peque?os": "pequeños",
    "peque?a": "pequeña",
    "peque?as": "pequeñas",
    "extra?os": "extraños",
    "acompa?ado": "acompañado",
    "acompa?ada": "acompañada",
    "acompa?adas": "acompañadas",
    "acompa?ante": "acompañante",
    "acompa?an": "acompañan",
    "mu?ecas": "muñecas",
    "mu?equeras": "muñequeras",
    "mu?ecos": "muñecos",
    "orde?adoras": "ordeñadoras",
    "guada?adoras": "guadañadoras",
    "desempe?a": "desempeña",
    "desempe?e": "desempeñe",
    "desempe?en": "desempeñen",
    "mara??n": "marañón",
    "mara??n": "marañón",
    "?caj??": "«cajú»",
    "c??amo": "cáñamo",
    "c?amo": "cáñamo",
    "cigue?al": "cigüeñal",
    "acu?aci?n": "acuñación",
    "acu?acion": "acuñación",
    "acu?ticos": "acuáticos",
    "acu?ticas": "acuáticas",
    "acu?tica": "acuática",
    "acu?tico": "acuático",
    "subacu?tica": "subacuática",
    "crust?ceos": "crustáceos",
    "?crust?": "«crust»",
    "dec?podos": "decápodos",
    "s?balos": "sábalos",
    "s?balo": "sábalo",
    "surub?es": "surubíes",
    "surub?": "surubí",
    "manduv?es": "manduvíes",
    "manguruy?es": "manguruyúes",
    "pat?es": "patíes",
    "pac?es": "pacúes",
    "tambaqu?es": "tambaquíes",
    "tambac?es": "tambacúes",
    "pac?fico": "pacífico",
    "ant?rtica": "antártica",
    "ant?rticas": "antárticas",
    "tibur?n": "tiburón",
    "salm?n": "salmón",
    "salm?nidos": "salmónidos",
    "caz?n": "cazón",
    "r?balos": "róbalos",
    "esturi?n": "esturión",
    "centoll?n": "centollón",
    "conill?n": "conillón",
    "manat?es": "manatíes",
    "yacar?s": "yacarés",
    "pecar?es": "pecaríes",
    "mam?feros": "mamíferos",
    "b?falo": "búfalo",
    "b?fala": "búfala",
    "b?falos": "búfalos",
    "jabal?": "jabalí",
    "tej?n": "tejón",
    "rat?n": "ratón",
    "l?pulo": "lúpulo",
    "anan?s": "ananás",
    "anan?": "ananá",
    "d?tiles": "dátiles",
    "man?es": "maníes",
    "man?": "maní",
    "alforf?n": "alforfón",
    "c?rtamo": "cártamo",
    "fr?joles": "fríjoles",
    "fr?jol": "fríjol",
    "jud?as": "judías",
    "jud?a": "judía",
    "ch?charos": "chícharos",
    "az?cares": "azúcares",
    "c?tricos": "cítricos",
    "c?trico": "cítrico",
    "h?gados": "hígados",
    "h?gado": "hígado",
    "est?magos": "estómagos",
    "ra?ces": "raíces",
    "gri?ones": "griñones",
    "gra?ones": "grañones",
    "almid?n": "almidón",
    "reques?n": "requesón",
    "cusc?s": "cuscús",
    "lasa?as": "lasañas",
    "?oquis": "ñoquis",
    "t?": "té",
    "s?": "sí",
    "?l": "él",
    "as?": "así",
    "a?n": "aún",
    "est?": "está",
    "est?n": "están",
    "adem?s": "además",
    "alg?n": "algún",
    "ning?n": "ningún",
    "tambi?n": "también",
    "despu?s": "después",
    "detr?s": "detrás",
    "quiz?s": "quizás",
    "inter?s": "interés",
    "car?cter": "carácter",
    "caracter?sticas": "características",
    "caracter?sticos": "característicos",
    "d?a": "día",
    "d?as": "días",
    "v?a": "vía",
    "v?as": "vías",
    "gu?a": "guía",
    "gu?as": "guías",
    "pa?ales": "pañales",
    "pa?uelos": "pañuelos",
    "ba?o": "baño",
    "ba?os": "baños",
    "ba?eras": "bañeras",
    "esta?o": "estaño",
    "esta?ados": "estañados",
    "travesa?o": "travesaño",
    "desempa?ador": "desempañador",
    "p?as": "púas",
    "compa?ia": "compañía",
    "campa?a": "campaña",
    "campa?as": "campañas",
    "a?adido": "añadido",
    "a?adidos": "añadidos",
    "a?adida": "añadida",
    "a?adidas": "añadidas",
    "a?adiendo": "añadiendo",
    "a?adan": "añadan",
    "a?adir": "añadir",
    "a?adirse": "añadirse",
    "m?vil": "móvil",
    "m?viles": "móviles",
    "l?ser": "láser",
    "n?quel": "níquel",
    "lat?n": "latón",
    "carb?n": "carbón",
    "m?rmol": "mármol",
    "p?rfido": "pórfido",
    "p?mez": "pómez",
    "hormig?n": "hormigón",
    "alquitr?n": "alquitrán",
    "bet?n": "betún",
    "gas?leo": "gasóleo",
    "petr?leo": "petróleo",
    "fl?or": "flúor",
    "ars?nico": "arsénico",
    "s?lice": "sílice",
    "s?lices": "sílices",
    "al?mina": "alúmina",
    "corind?n": "corindón",
    "f?cula": "fécula",
    "f?culas": "féculas",
    "l?tex": "látex",
    "jab?n": "jabón",
    "caf?": "café",
    "azafr?n": "azafrán",
    "c?rcuma": "cúrcuma",
    "k?tchup": "kétchup",
    "champa?a": "champaña",
    "pur?": "puré",
    "maracuy?": "maracuyá",
    "maracuy?s": "maracuyás",
    "lim?n": "limón",
    "s?samo": "sésamo",
    "ajonjol?": "ajonjolí",
    "at?n": "atún",
    "or?gano": "orégano",
    "mel?n": "melón",
    "melocot?n": "melocotón",
    "per?": "perú",
    "tol?": "tolú",
    "sag?": "sagú",
    "caup?": "caupí",
    "gand?": "gandú",
    "pec?n": "pecán",
    "macad?n": "macadán",
    "cedr?n": "cedrón",
    "br?col": "brécol",
    "br?colis": "brócolis",
    "br?coles": "brécoles",
    "c?scaras": "cáscaras",
    "p?mpanos": "pámpanos",
    "con?feras": "coníferas",
    "ali?ceas": "aliáceas",
    "sil?ceas": "silíceas",
    "ros?ceas": "rosáceas",
    "herb?ceas": "herbáceas",
    "bot?nico": "botánico",
    "agr?cola": "agrícola",
    "gran?fero": "granífero",
    "arom?ticas": "aromáticas",
    "arom?ticos": "aromáticos",
    "arom?tizados": "aromatizados",
    "l?cteas": "lácteas",
    "alcoh?lico": "alcohólico",
    "alcoh?lica": "alcohólica",
    "alcoh?licas": "alcohólicas",
    "alcah?lico": "alcohólico",
    "analcoh?licas": "analcohólicas",
    "et?lico": "etílico",
    "et?licos": "etílicos",
    "but?lico": "butílico",
    "but?rico": "butírico",
    "ac?tico": "acético",
    "l?ctico": "láctico",
    "c?lcico": "cálcico",
    "c?lcica": "cálcica",
    "c?psulas": "cápsulas",
    "pl?sticas": "plásticas",
    "pl?stica": "plástica",
    "pl?stico": "plástico",
    "termopl?stica": "termoplástica",
    "termopl?sticas": "termoplásticas",
    "termopl?stico": "termoplástico",
    "termopl?sticos": "termoplásticos",
    "babas?": "babasú",
    "ca?amo": "cáñamo",
    "qu?imicamente": "químicamente",
    "esp?rragos": "espárragos",
    "comercializaci?n": "comercialización",
    "monocrom?ticas": "monocromáticas",
    "monocrom?tica": "monocromática",
    "isobut?lico": "isobutílico",
    "metacr?lico": "metacrílico",
    "dehidroc?lico": "dehidrocólico",
    "diclorv?s": "diclorvós",
    "mirteca?na": "mirtecaína",
    "lidoca?na": "lidocaína",
    "priloca?na": "prilocaína",
    "carbociste?na": "carbocisteína",
    "fenito?na": "fenitoína",
    "zoledr?nico": "zoledrónico",
    "nicot?nico": "nicotínico",
    "mepivaca?na": "mepivacaína",
    "bupivaca?na": "bupivacaína",
    "deslan?sido": "deslanósido",
    "etop?sido": "etopósido",
    "dihidrocode?na": "dihidrocodeína",
    "teba?na": "tebaína",
    "benzat?nica": "benzatínica",
    "proca?nica": "procaínica",
    "act?en": "actúen",
    "antig?edad": "antigüedad",
    "entendi?ndose": "entendiéndose",
    "estanter?as": "estanterías",
    "isot?rmicos": "isotérmicos",
    "contrapulsaci?n": "contrapulsación",
    "num?ricas": "numéricas",
    "monof?sicos": "monofásicos",
    "endosc?pica": "endoscópica",
    "potenci?metros": "potenciómetros",
    "par?metros": "parámetros",
    "bandone?n": "bandoneón",
    "carrocer?as": "carrocerías",
    "esp?ridos": "espáridos",
    "?quidos": "équidos",
    "b?vidos": "bóvidos",
    "pl?tanos": "plátanos",
    "sand?as": "sandías",
    "rut?sido": "rutósido",
    "casta?as": "castañas",
    "cacat?as": "cacatúas",
    "em?es": "emúes",
    "ri?ones": "riñones",
    "tr?boles": "tréboles",
    "c?rneos": "córneos",
    "ped?nculos": "pedúnculos",
    "ar?bigos": "arábigos",
    "inclu?dos": "incluidos",
    "caol?nicas": "caolínicas",
    "cod?meros": "codímeros",
    "aislaci?n": "aislación",
    "fosf?nico": "fosfónico",
    "tetra?xido": "tetraóxido",
    "proan?lisis": "proanálisis",
    "is?meros": "isómeros",
    "laur?lico": "laurílico",
    "propi?nico": "propiónico",
    "capr?lico": "caprílico",
    "ortoft?lico": "ortoftálico",
    "fosfamid?n": "fosfamidón",
    "monocrotof?s": "monocrotofós",
    "clodr?nico": "clodrónico",
    "trifenilesta?o": "trifenilestaño",
    "fembutat?n": "fembutatón",
    "dimetilesta?o": "dimetilestaño",
    "dibutilesta?o": "dibutilestaño",
    "dioctilesta?o": "dioctilestaño",
    "clordiazep?xido": "clordiazepóxido",
    "seroalb?mina": "seroalbúmina",
    "mic?ceos": "micáceos",
    "pa?os": "paños",
    "calcoman?as": "calcomanías",
    "da?os": "daños",
    "dif?sforo": "difósforo",
    "hemodi?lisis": "hemodiálisis",
    "trimel?tico": "trimelítico",
    "interfer?n": "interferón",
    "iboga?na": "ibogaína",
    "oxicode?na": "oxicodeína",
    "norcode?na": "norcodeína",
    "fum?rico": "fumárico",
    "dietilpropi?n": "dietilpropión",
    "dipot?sico": "dipotásico",
    "tenip?sido": "tenipósido",
    "ap?sitos": "apósitos",
    "quir?rgicos": "quirúrgicos",
    "quir?rgicas": "quirúrgicas",
    "exclu?da": "excluida",
    "electrost?ticos": "electrostáticos",
    "endosulf?n": "endosulfán",
    "tiomet?n": "tiometón",
    "diur?n": "diurón",
    "clorfenvinf?s": "clorfenvinfós",
    "cihexat?n": "cihexatón",
    "acrilam?dico": "acrilamídico",
    "tra?llas": "traíllas",
    "paran?": "Paraná",
    "mercader?as": "mercaderías",
    "elast?meros": "elastómeros",
    "cat?dicos": "catódicos",
    "part?culas": "partículas",
    "part?cula": "partícula",
    "bl?ster": "blíster",
    "c?bicos": "cúbicos",
    "c?bico": "cúbico",
    "frigar?as": "frigorías",
    "t?neles": "túneles",
    "pesabeb?s": "pesabebés",
    "f?rreas": "férreas",
    "f?rreos": "férreos",
    "bru?idoras": "bruñidoras",
    "bru?ir": "bruñir",
    "magn?ticas": "magnéticas",
    "magn?tica": "magnética",
    "magn?ticos": "magnéticos",
    "magn?tico": "magnético",
    "policrom?tico": "policromático",
    "policrom?ticas": "policromáticas",
    "r?gidos": "rígidos",
    "r?gido": "rígido",
    "s?ncronos": "síncronos",
    "colostom?a": "colostomía",
    "ex?menes": "exámenes",
    "p?ginas": "páginas",
    "dom?sticos": "domésticos",
    "trif?sicos": "trifásicos",
    "trif?sicas": "trifásicas",
    "piezoel?ctricos": "piezoeléctricos",
    "im?ge": "imáge",
    "fotoel?ctricos": "fotoeléctricos",
    "deflexi?n": "deflexión",
    "r?tulas": "rótulas",
    "rev?lveres": "revólveres",
    "sof?s": "sofás",
    "c?modas": "cómodas",
    "escial?ticas": "escialíticas",
    "p?blicos": "públicos",
    "cont?nua": "continua",
    "cosm?ticos": "cosméticos",
    "retr?ctiles": "retráctiles",
    "catal?ticos": "catalíticos",
    "monta?as": "montañas",
    "?rganos": "órganos",
    "p?cticas": "pécticas",
    "lej?as": "lejías",
    "buj?as": "bujías",
    "esqu?s": "esquís",
    "l?nteres": "línteres",
    "cet?cea": "cetácea",
}

WORD_RE = re.compile(r"[A-Za-zÁÉÍÓÚÑÜáéíóúñü?]+")


def normalizar(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower().replace("?", " ")
    text = re.sub(r"[^a-z0-9ñ ]+", " ", text)
    return " ".join(text.split())


def preservar_mayus(original: str, reparado: str) -> str:
    if original.isupper():
        return reparado.upper()
    if original[:1].isupper():
        return reparado[:1].upper() + reparado[1:]
    return reparado


def candidato_spell(tok: str) -> str | None:
    n = tok.count("?")
    if n == 0 or n > 3:
        return None

    mejor: tuple[float, str] | None = None
    for repls in itertools.product(ACENTOS, repeat=n):
        chars = list(tok)
        it = iter(repls)
        cand = "".join(next(it) if ch == "?" else ch for ch in chars)
        if cand in SP.word_frequency:
            score = SP.word_usage_frequency(cand)
            if mejor is None or score > mejor[0]:
                mejor = (score, cand)
    return mejor[1] if mejor else None


def candidato_heuristico(tok: str) -> str | None:
    reparado = tok
    reemplazos = [
        ("ci?n", "ción"),
        ("si?n", "sión"),
        ("?xido", "óxido"),
        ("?xidos", "óxidos"),
        ("?metro", "ómetro"),
        ("?metros", "ómetros"),
        ("?graf", "ógraf"),
        ("?log", "ólog"),
        ("?gen", "ógen"),
        ("?nic", "ónic"),
        ("?mic", "ómic"),
        ("?lic", "ílic"),
    ]
    for viejo, nuevo in reemplazos:
        reparado = reparado.replace(viejo, nuevo)
    return reparado if reparado != tok and "?" not in reparado else None


def restore_token(match: re.Match[str]) -> str:
    tok = match.group(0)
    if "?" not in tok:
        return tok
    low = tok.lower()
    manual = MANUAL.get(low)
    if manual:
        return preservar_mayus(tok, manual)
    auto = candidato_spell(low)
    if auto:
        return preservar_mayus(tok, auto)
    heuristico = candidato_heuristico(low)
    if heuristico:
        return preservar_mayus(tok, heuristico)
    return tok


def reparar_texto(valor: object) -> object:
    if not isinstance(valor, str) or "?" not in valor:
        return valor

    text = valor
    text = re.sub(r"\bN\.\?", "N.°", text)
    text = re.sub(r"(?<=\d)\s\?\)", '")', text)
    text = re.sub(r"(?<=\d)\?", "°", text)
    text = re.sub(r"\b([cm]?m)\?", r"\1²", text, flags=re.IGNORECASE)
    text = re.sub(r"\bcm\?", "cm²", text, flags=re.IGNORECASE)
    text = re.sub(r"\bn\?", "n°", text, flags=re.IGNORECASE)
    text = re.sub(r"\?C\b", "°C", text)

    text = WORD_RE.sub(restore_token, text)

    # Lo que queda entre signos de pregunta suelen ser términos extranjeros
    # que ARCA trae entre comillas angulares.
    text = re.sub(r"\?([^?\n]{1,80}?)\?", r"«\1»", text)
    text = re.sub(r"\?tipo ([^°?]+)°", r"«tipo \1»", text)
    text = re.sub(r"\s\?\s", " o ", text)
    return text


def contar_preguntas(df: pd.DataFrame) -> int:
    total = 0
    for col in df.columns:
        if df[col].dtype == object:
            total += df[col].astype(str).str.count(r"\?").sum()
    return int(total)


def reparar_archivo(nombre: str, columnas: list[str], dry_run: bool) -> tuple[int, int]:
    path = BASE / nombre
    df = pd.read_parquet(path)
    antes = contar_preguntas(df)

    for col in columnas:
        if col in df.columns:
            df[col] = df[col].map(reparar_texto)

    if "descripcion" in df.columns and "descripcion_busqueda" in df.columns:
        base = df["ruta"] if "ruta" in df.columns else df["descripcion"]
        df["descripcion_busqueda"] = base.fillna("").map(normalizar)

    despues = contar_preguntas(df)
    if not dry_run:
        df.to_parquet(path, compression="snappy", index=False)

    return antes, despues


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    objetivos = [
        ("ncm.parquet", ["descripcion", "ruta"]),
        ("sufijos.parquet", ["descripcion"]),
        ("notas.parquet", ["titulo", "texto"]),
    ]

    total_antes = 0
    total_despues = 0
    for nombre, cols in objetivos:
        antes, despues = reparar_archivo(nombre, cols, args.dry_run)
        total_antes += antes
        total_despues += despues
        print(f"{nombre}: ? antes={antes} despues={despues}")

    modo = "dry-run" if args.dry_run else "aplicado"
    print(f"OK ({modo}) - total ? antes={total_antes} despues={total_despues}")
    return 0


if __name__ == "__main__":
    sys.exit(main())