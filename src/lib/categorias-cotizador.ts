// ARCHIVO GENERADO por scripts/build_categorias_cotizador.py — NO editar a mano.
// di / diMin / diMax = Derecho de Importación (%) del nomenclador (ncm.parquet, ar3).
// di = moda a nivel NCM-8. iva: 21 general, 10,5 reducido, 0 exento.

export type SubCategoria = {
  id: string;
  label: string;
  ncm: string;
  di: number;
  diMin: number;
  diMax: number;
  /** IVA propio si difiere del grupo. */
  iva?: number;
};

export type Grupo = {
  id: string;
  label: string;
  iva: number;
  di: number;
  diMin: number;
  diMax: number;
  nota?: string;
  subs: SubCategoria[];
};

export const GRUPOS: Grupo[] = [
  {
    "id": "informatica",
    "label": "Informática y telecomunicaciones",
    "iva": 21,
    "di": 0.0,
    "diMin": 0.0,
    "diMax": 35.0,
    "nota": "Régimen BIT: gran parte queda en 0% de derecho.",
    "subs": [
      {
        "id": "informatica-8471",
        "label": "Computadoras y notebooks",
        "ncm": "84.71",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 16.0
      },
      {
        "id": "informatica-8528",
        "label": "Monitores y proyectores",
        "ncm": "85.28",
        "di": 20.0,
        "diMin": 0.0,
        "diMax": 20.0
      },
      {
        "id": "informatica-8443",
        "label": "Impresoras y multifunción",
        "ncm": "84.43",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 12.6
      },
      {
        "id": "informatica-8523",
        "label": "Almacenamiento y soportes (SSD, discos)",
        "ncm": "85.23",
        "di": 16.0,
        "diMin": 0.0,
        "diMax": 35.0
      },
      {
        "id": "informatica-851762",
        "label": "Equipos de red (routers, switches)",
        "ncm": "8517.62",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 35.0
      },
      {
        "id": "informatica-8542",
        "label": "Circuitos integrados y chips",
        "ncm": "85.42",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 0.0
      },
      {
        "id": "informatica-8473",
        "label": "Partes y accesorios de PC",
        "ncm": "84.73",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 16.0
      }
    ]
  },
  {
    "id": "electronica",
    "label": "Electrónica de consumo",
    "iva": 21,
    "di": 0.0,
    "diMin": 0.0,
    "diMax": 35.0,
      "subs": [
      {
        "id": "electronica-851713",
        "label": "Celulares y smartphones",
        "ncm": "8517.13",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 0.0
      },
      {
        "id": "electronica-852872",
        "label": "Televisores",
        "ncm": "8528.72",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 20.0
      },
      {
        "id": "electronica-8518",
        "label": "Equipos de audio y parlantes",
        "ncm": "85.18",
        "di": 20.0,
        "diMin": 0.0,
        "diMax": 35.0
      },
      {
        "id": "electronica-8525",
        "label": "Cámaras de foto y video",
        "ncm": "85.25",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 12.6
      },
      {
        "id": "electronica-8527",
        "label": "Radios y reproductores",
        "ncm": "85.27",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 20.0
      },
      {
        "id": "electronica-9504",
        "label": "Consolas y videojuegos",
        "ncm": "95.04",
        "di": 20.0,
        "diMin": 0.0,
        "diMax": 35.0
      }
    ]
  },
  {
    "id": "electrodomesticos",
    "label": "Electrodomésticos",
    "iva": 21,
    "di": 12.6,
    "diMin": 0.0,
    "diMax": 35.0,
      "subs": [
      {
        "id": "electrodomesticos-8418",
        "label": "Heladeras y freezers",
        "ncm": "84.18",
        "di": 12.6,
        "diMin": 0.0,
        "diMax": 20.0
      },
      {
        "id": "electrodomesticos-8450",
        "label": "Lavarropas y secarropas",
        "ncm": "84.50",
        "di": 20.0,
        "diMin": 0.0,
        "diMax": 20.0
      },
      {
        "id": "electrodomesticos-8415",
        "label": "Aires acondicionados",
        "ncm": "84.15",
        "di": 18.0,
        "diMin": 12.6,
        "diMax": 20.0
      },
      {
        "id": "electrodomesticos-8516",
        "label": "Cocinas, hornos y microondas",
        "ncm": "85.16",
        "di": 20.0,
        "diMin": 16.0,
        "diMax": 35.0
      },
      {
        "id": "electrodomesticos-8508",
        "label": "Aspiradoras",
        "ncm": "85.08",
        "di": 20.0,
        "diMin": 12.6,
        "diMax": 20.0
      },
      {
        "id": "electrodomesticos-841451",
        "label": "Ventiladores",
        "ncm": "8414.51",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 20.0
      },
      {
        "id": "electrodomesticos-8509",
        "label": "Pequeños electrodomésticos de cocina",
        "ncm": "85.09",
        "di": 20.0,
        "diMin": 16.0,
        "diMax": 20.0
      },
      {
        "id": "electrodomesticos-8419",
        "label": "Termotanques y calefones",
        "ncm": "84.19",
        "di": 12.6,
        "diMin": 0.0,
        "diMax": 20.0
      }
    ]
  },
  {
    "id": "maquinaria",
    "label": "Maquinaria y bienes de capital",
    "iva": 10.5,
    "di": 12.6,
    "diMin": 0.0,
    "diMax": 35.0,
    "nota": "Bienes de capital: suelen tributar IVA 10,5% (según planilla BK).",
    "subs": [
      {
        "id": "maquinaria-8413",
        "label": "Bombas y compresores",
        "ncm": "84.13",
        "di": 12.6,
        "diMin": 12.6,
        "diMax": 18.0
      },
      {
        "id": "maquinaria-8501",
        "label": "Motores y generadores eléctricos",
        "ncm": "85.01",
        "di": 12.6,
        "diMin": 0.0,
        "diMax": 18.0
      },
      {
        "id": "maquinaria-8458",
        "label": "Máquinas herramienta",
        "ncm": "84.58",
        "di": 12.6,
        "diMin": 0.0,
        "diMax": 12.6
      },
      {
        "id": "maquinaria-8432",
        "label": "Maquinaria agrícola",
        "ncm": "84.32",
        "di": 12.6,
        "diMin": 12.6,
        "diMax": 12.6
      },
      {
        "id": "maquinaria-8429",
        "label": "Maquinaria para construcción",
        "ncm": "84.29",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 14.0
      },
      {
        "id": "maquinaria-8414",
        "label": "Equipos de frío/aire industrial",
        "ncm": "84.14",
        "di": 12.6,
        "diMin": 0.0,
        "diMax": 20.0
      },
      {
        "id": "maquinaria-8408",
        "label": "Motores de combustión",
        "ncm": "84.08",
        "di": 18.0,
        "diMin": 0.0,
        "diMax": 18.0
      },
      {
        "id": "maquinaria-8504",
        "label": "Transformadores y tableros eléctricos",
        "ncm": "85.04",
        "di": 18.0,
        "diMin": 0.0,
        "diMax": 35.0
      }
    ]
  },
  {
    "id": "herramientas",
    "label": "Herramientas",
    "iva": 21,
    "di": 18.0,
    "diMin": 0.0,
    "diMax": 35.0,
      "subs": [
      {
        "id": "herramientas-8205",
        "label": "Herramientas manuales",
        "ncm": "82.05",
        "di": 18.0,
        "diMin": 18.0,
        "diMax": 18.0
      },
      {
        "id": "herramientas-8467",
        "label": "Herramientas eléctricas",
        "ncm": "84.67",
        "di": 12.6,
        "diMin": 9.0,
        "diMax": 35.0
      },
      {
        "id": "herramientas-8207",
        "label": "Útiles intercambiables (mechas, discos)",
        "ncm": "82.07",
        "di": 18.0,
        "diMin": 0.0,
        "diMax": 18.0
      },
      {
        "id": "herramientas-8211",
        "label": "Cuchillería y cubiertos",
        "ncm": "82.11",
        "di": 18.0,
        "diMin": 18.0,
        "diMax": 18.0
      }
    ]
  },
  {
    "id": "autopartes",
    "label": "Autopartes y repuestos",
    "iva": 21,
    "di": 18.0,
    "diMin": 0.0,
    "diMax": 18.0,
      "subs": [
      {
        "id": "autopartes-8708",
        "label": "Partes de carrocería y mecánica",
        "ncm": "87.08",
        "di": 18.0,
        "diMin": 0.0,
        "diMax": 18.0
      },
      {
        "id": "autopartes-4011",
        "label": "Neumáticos",
        "ncm": "40.11",
        "di": 16.0,
        "diMin": 0.0,
        "diMax": 16.0
      },
      {
        "id": "autopartes-8507",
        "label": "Baterías",
        "ncm": "85.07",
        "di": 18.0,
        "diMin": 0.0,
        "diMax": 18.0
      },
      {
        "id": "autopartes-842123",
        "label": "Filtros",
        "ncm": "8421.23",
        "di": 16.0,
        "diMin": 16.0,
        "diMax": 16.0
      },
      {
        "id": "autopartes-8511",
        "label": "Bujías y encendido eléctrico",
        "ncm": "85.11",
        "di": 18.0,
        "diMin": 16.0,
        "diMax": 18.0
      },
      {
        "id": "autopartes-7007",
        "label": "Vidrios para vehículos",
        "ncm": "70.07",
        "di": 10.8,
        "diMin": 10.8,
        "diMax": 10.8
      }
    ]
  },
  {
    "id": "vehiculos",
    "label": "Vehículos y transporte",
    "iva": 21,
    "di": 35.0,
    "diMin": 0.0,
    "diMax": 35.0,
    "nota": "Régimen automotor: condiciones particulares.",
    "subs": [
      {
        "id": "vehiculos-8703",
        "label": "Automóviles",
        "ncm": "87.03",
        "di": 35.0,
        "diMin": 15.0,
        "diMax": 35.0
      },
      {
        "id": "vehiculos-8704",
        "label": "Camionetas y camiones",
        "ncm": "87.04",
        "di": 35.0,
        "diMin": 0.0,
        "diMax": 35.0
      },
      {
        "id": "vehiculos-8711",
        "label": "Motos y ciclomotores",
        "ncm": "87.11",
        "di": 20.0,
        "diMin": 15.0,
        "diMax": 20.0
      },
      {
        "id": "vehiculos-8712",
        "label": "Bicicletas",
        "ncm": "87.12",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 20.0
      },
      {
        "id": "vehiculos-8701",
        "label": "Tractores",
        "ncm": "87.01",
        "di": 14.0,
        "diMin": 0.0,
        "diMax": 35.0
      },
      {
        "id": "vehiculos-8716",
        "label": "Remolques",
        "ncm": "87.16",
        "di": 35.0,
        "diMin": 16.0,
        "diMax": 35.0
      },
      {
        "id": "vehiculos-8903",
        "label": "Embarcaciones",
        "ncm": "89.03",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 35.0
      }
    ]
  },
  {
    "id": "indumentaria",
    "label": "Indumentaria y accesorios",
    "iva": 21,
    "di": 20.0,
    "diMin": 0.0,
    "diMax": 20.0,
      "subs": [
      {
        "id": "indumentaria-61",
        "label": "Prendas de punto (remeras, buzos)",
        "ncm": "61",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 20.0
      },
      {
        "id": "indumentaria-62",
        "label": "Prendas no de punto (camisas, pantalones)",
        "ncm": "62",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 20.0
      },
      {
        "id": "indumentaria-63",
        "label": "Ropa de hogar y blanquería",
        "ncm": "63",
        "di": 20.0,
        "diMin": 0.0,
        "diMax": 20.0
      },
      {
        "id": "indumentaria-65",
        "label": "Gorros y sombreros",
        "ncm": "65",
        "di": 20.0,
        "diMin": 18.0,
        "diMax": 20.0
      },
      {
        "id": "indumentaria-66",
        "label": "Paraguas y bastones",
        "ncm": "66",
        "di": 20.0,
        "diMin": 18.0,
        "diMax": 20.0
      }
    ]
  },
  {
    "id": "textil_telas",
    "label": "Telas, hilados y fibras",
    "iva": 21,
    "di": 18.0,
    "diMin": 0.0,
    "diMax": 20.0,
      "subs": [
      {
        "id": "textil_telas-52",
        "label": "Telas de algodón",
        "ncm": "52",
        "di": 18.0,
        "diMin": 5.4,
        "diMax": 18.0
      },
      {
        "id": "textil_telas-54",
        "label": "Filamentos sintéticos",
        "ncm": "54",
        "di": 16.0,
        "diMin": 0.0,
        "diMax": 18.0
      },
      {
        "id": "textil_telas-55",
        "label": "Fibras sintéticas discontinuas",
        "ncm": "55",
        "di": 18.0,
        "diMin": 0.0,
        "diMax": 18.0
      },
      {
        "id": "textil_telas-60",
        "label": "Tejidos de punto",
        "ncm": "60",
        "di": 18.0,
        "diMin": 18.0,
        "diMax": 18.0
      },
      {
        "id": "textil_telas-57",
        "label": "Alfombras",
        "ncm": "57",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 20.0
      },
      {
        "id": "textil_telas-51",
        "label": "Lana y pelo fino",
        "ncm": "51",
        "di": 18.0,
        "diMin": 0.0,
        "diMax": 18.0
      }
    ]
  },
  {
    "id": "calzado",
    "label": "Calzado",
    "iva": 21,
    "di": 20.0,
    "diMin": 0.0,
    "diMax": 20.0,
      "subs": [
      {
        "id": "calzado-6403",
        "label": "Calzado de cuero",
        "ncm": "64.03",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 20.0
      },
      {
        "id": "calzado-6404",
        "label": "Calzado deportivo / textil",
        "ncm": "64.04",
        "di": 20.0,
        "diMin": 0.0,
        "diMax": 20.0
      },
      {
        "id": "calzado-6402",
        "label": "Calzado de caucho o plástico",
        "ncm": "64.02",
        "di": 20.0,
        "diMin": 0.0,
        "diMax": 20.0
      },
      {
        "id": "calzado-6406",
        "label": "Partes de calzado",
        "ncm": "64.06",
        "di": 18.0,
        "diMin": 0.0,
        "diMax": 18.0
      }
    ]
  },
  {
    "id": "juguetes",
    "label": "Juguetes y artículos deportivos",
    "iva": 21,
    "di": 20.0,
    "diMin": 0.0,
    "diMax": 35.0,
      "subs": [
      {
        "id": "juguetes-9503",
        "label": "Juguetes",
        "ncm": "95.03",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 20.0
      },
      {
        "id": "juguetes-9504",
        "label": "Consolas y videojuegos",
        "ncm": "95.04",
        "di": 20.0,
        "diMin": 0.0,
        "diMax": 35.0
      },
      {
        "id": "juguetes-9506",
        "label": "Artículos deportivos y gimnasia",
        "ncm": "95.06",
        "di": 20.0,
        "diMin": 0.0,
        "diMax": 35.0
      },
      {
        "id": "juguetes-9505",
        "label": "Artículos de fiesta",
        "ncm": "95.05",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 20.0
      }
    ]
  },
  {
    "id": "muebles",
    "label": "Muebles e iluminación",
    "iva": 21,
    "di": 18.0,
    "diMin": 12.6,
    "diMax": 35.0,
      "subs": [
      {
        "id": "muebles-9401",
        "label": "Asientos y sillas",
        "ncm": "94.01",
        "di": 18.0,
        "diMin": 18.0,
        "diMax": 35.0
      },
      {
        "id": "muebles-9403",
        "label": "Muebles (otros)",
        "ncm": "94.03",
        "di": 18.0,
        "diMin": 18.0,
        "diMax": 35.0
      },
      {
        "id": "muebles-9404",
        "label": "Colchones y sommiers",
        "ncm": "94.04",
        "di": 18.0,
        "diMin": 18.0,
        "diMax": 35.0
      },
      {
        "id": "muebles-9405",
        "label": "Artefactos de iluminación",
        "ncm": "94.05",
        "di": 18.0,
        "diMin": 18.0,
        "diMax": 30.0
      }
    ]
  },
  {
    "id": "plasticos",
    "label": "Plásticos y caucho",
    "iva": 21,
    "di": 12.6,
    "diMin": 0.0,
    "diMax": 35.0,
      "subs": [
      {
        "id": "plasticos-3926",
        "label": "Manufacturas de plástico",
        "ncm": "39.26",
        "di": 18.0,
        "diMin": 0.0,
        "diMax": 35.0
      },
      {
        "id": "plasticos-3923",
        "label": "Envases y tapas",
        "ncm": "39.23",
        "di": 18.0,
        "diMin": 0.0,
        "diMax": 18.0
      },
      {
        "id": "plasticos-3917",
        "label": "Tubos y accesorios",
        "ncm": "39.17",
        "di": 16.0,
        "diMin": 0.0,
        "diMax": 16.0
      },
      {
        "id": "plasticos-3920",
        "label": "Placas, films y láminas",
        "ncm": "39.20",
        "di": 16.0,
        "diMin": 0.0,
        "diMax": 16.0
      },
      {
        "id": "plasticos-3901",
        "label": "Resinas plásticas (materia prima)",
        "ncm": "39.01",
        "di": 6.0,
        "diMin": 0.0,
        "diMax": 12.6
      },
      {
        "id": "plasticos-4016",
        "label": "Manufacturas de caucho",
        "ncm": "40.16",
        "di": 16.0,
        "diMin": 0.0,
        "diMax": 16.0
      }
    ]
  },
  {
    "id": "metales",
    "label": "Metales y sus manufacturas",
    "iva": 21,
    "di": 10.8,
    "diMin": 0.0,
    "diMax": 35.0,
      "subs": [
      {
        "id": "metales-73",
        "label": "Manufacturas de hierro o acero",
        "ncm": "73",
        "di": 12.6,
        "diMin": 0.0,
        "diMax": 35.0
      },
      {
        "id": "metales-72",
        "label": "Productos de acero (chapas, barras)",
        "ncm": "72",
        "di": 10.8,
        "diMin": 0.0,
        "diMax": 14.0
      },
      {
        "id": "metales-76",
        "label": "Aluminio y sus manufacturas",
        "ncm": "76",
        "di": 10.8,
        "diMin": 0.0,
        "diMax": 16.0
      },
      {
        "id": "metales-74",
        "label": "Cobre y sus manufacturas",
        "ncm": "74",
        "di": 10.8,
        "diMin": 0.0,
        "diMax": 16.0
      },
      {
        "id": "metales-83",
        "label": "Herrajes, cerraduras y bazar metálico",
        "ncm": "83",
        "di": 16.0,
        "diMin": 0.0,
        "diMax": 35.0
      }
    ]
  },
  {
    "id": "construccion",
    "label": "Construcción: vidrio, cerámica y piedra",
    "iva": 21,
    "di": 3.6,
    "diMin": 0.0,
    "diMax": 35.0,
      "subs": [
      {
        "id": "construccion-69",
        "label": "Cerámica y porcelana",
        "ncm": "69",
        "di": 9.0,
        "diMin": 0.0,
        "diMax": 35.0
      },
      {
        "id": "construccion-70",
        "label": "Vidrio y sus manufacturas",
        "ncm": "70",
        "di": 9.0,
        "diMin": 0.0,
        "diMax": 18.0
      },
      {
        "id": "construccion-68",
        "label": "Manufacturas de piedra, yeso, cemento",
        "ncm": "68",
        "di": 5.4,
        "diMin": 0.0,
        "diMax": 35.0
      },
      {
        "id": "construccion-2523",
        "label": "Cemento, cal y yeso",
        "ncm": "25.23",
        "di": 3.6,
        "diMin": 3.6,
        "diMax": 3.6
      }
    ]
  },
  {
    "id": "quimicos",
    "label": "Químicos e insumos industriales",
    "iva": 21,
    "di": 0.0,
    "diMin": 0.0,
    "diMax": 20.0,
      "subs": [
      {
        "id": "quimicos-29",
        "label": "Químicos orgánicos",
        "ncm": "29",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 20.0
      },
      {
        "id": "quimicos-28",
        "label": "Químicos inorgánicos",
        "ncm": "28",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 10.8
      },
      {
        "id": "quimicos-32",
        "label": "Pinturas y barnices",
        "ncm": "32",
        "di": 12.6,
        "diMin": 0.0,
        "diMax": 12.6
      },
      {
        "id": "quimicos-38",
        "label": "Productos diversos de la química",
        "ncm": "38",
        "di": 12.6,
        "diMin": 0.0,
        "diMax": 20.0
      },
      {
        "id": "quimicos-37",
        "label": "Productos fotográficos",
        "ncm": "37",
        "di": 12.6,
        "diMin": 0.0,
        "diMax": 12.6
      }
    ]
  },
  {
    "id": "fertilizantes",
    "label": "Abonos y fertilizantes",
    "iva": 10.5,
    "di": 0.0,
    "diMin": 0.0,
    "diMax": 5.4,
    "nota": "Fertilizantes de uso agrícola: IVA reducido 10,5%.",
    "subs": [
      {
        "id": "fertilizantes-3105",
        "label": "Abonos minerales o químicos",
        "ncm": "31.05",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 5.4
      },
      {
        "id": "fertilizantes-3102",
        "label": "Abonos nitrogenados",
        "ncm": "31.02",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 5.4
      }
    ]
  },
  {
    "id": "farma",
    "label": "Productos farmacéuticos y salud",
    "iva": 21,
    "di": 12.6,
    "diMin": 0.0,
    "diMax": 35.0,
    "nota": "Medicamentos: el tratamiento de IVA depende del producto y la etapa.",
    "subs": [
      {
        "id": "farma-3004",
        "label": "Medicamentos",
        "ncm": "30.04",
        "di": 12.6,
        "diMin": 0.0,
        "diMax": 14.0
      },
      {
        "id": "farma-3005",
        "label": "Material de curación y apósitos",
        "ncm": "30.05",
        "di": 10.8,
        "diMin": 0.0,
        "diMax": 10.8
      },
      {
        "id": "farma-3822",
        "label": "Reactivos de diagnóstico",
        "ncm": "38.22",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 12.6
      }
    ]
  },
  {
    "id": "medico",
    "label": "Instrumentos y equipos médicos",
    "iva": 21,
    "di": 0.0,
    "diMin": 0.0,
    "diMax": 16.0,
      "subs": [
      {
        "id": "medico-9018",
        "label": "Instrumentos de medicina",
        "ncm": "90.18",
        "di": 16.0,
        "diMin": 0.0,
        "diMax": 16.0
      },
      {
        "id": "medico-9019",
        "label": "Aparatos de terapia y rehabilitación",
        "ncm": "90.19",
        "di": 12.6,
        "diMin": 12.6,
        "diMax": 12.6
      },
      {
        "id": "medico-9021",
        "label": "Prótesis y ortopedia",
        "ncm": "90.21",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 16.0
      },
      {
        "id": "medico-9022",
        "label": "Equipos de rayos X",
        "ncm": "90.22",
        "di": 12.6,
        "diMin": 0.0,
        "diMax": 12.6
      }
    ]
  },
  {
    "id": "instrumentos",
    "label": "Óptica, precisión, relojería e instrumentos",
    "iva": 21,
    "di": 12.6,
    "diMin": 0.0,
    "diMax": 35.0,
      "subs": [
      {
        "id": "instrumentos-9004",
        "label": "Óptica y anteojos",
        "ncm": "90.04",
        "di": 18.0,
        "diMin": 18.0,
        "diMax": 20.0
      },
      {
        "id": "instrumentos-9031",
        "label": "Instrumentos de medición y precisión",
        "ncm": "90.31",
        "di": 12.6,
        "diMin": 0.0,
        "diMax": 16.0
      },
      {
        "id": "instrumentos-9102",
        "label": "Relojes",
        "ncm": "91.02",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 20.0
      },
      {
        "id": "instrumentos-92",
        "label": "Instrumentos musicales",
        "ncm": "92",
        "di": 18.0,
        "diMin": 0.0,
        "diMax": 35.0
      },
      {
        "id": "instrumentos-9006",
        "label": "Cámaras y proyectores ópticos",
        "ncm": "90.06",
        "di": 18.0,
        "diMin": 0.0,
        "diMax": 18.0
      }
    ]
  },
  {
    "id": "cosmetica",
    "label": "Cosmética, perfumería y limpieza",
    "iva": 21,
    "di": 12.6,
    "diMin": 0.0,
    "diMax": 35.0,
      "subs": [
      {
        "id": "cosmetica-3303",
        "label": "Perfumes y fragancias",
        "ncm": "33.03",
        "di": 18.0,
        "diMin": 18.0,
        "diMax": 18.0
      },
      {
        "id": "cosmetica-3304",
        "label": "Maquillaje y cuidado de la piel",
        "ncm": "33.04",
        "di": 18.0,
        "diMin": 18.0,
        "diMax": 25.0
      },
      {
        "id": "cosmetica-3305",
        "label": "Cuidado capilar",
        "ncm": "33.05",
        "di": 18.0,
        "diMin": 18.0,
        "diMax": 18.0
      },
      {
        "id": "cosmetica-3307",
        "label": "Higiene bucal y personal",
        "ncm": "33.07",
        "di": 18.0,
        "diMin": 18.0,
        "diMax": 18.0
      },
      {
        "id": "cosmetica-3401",
        "label": "Jabones y productos de limpieza",
        "ncm": "34.01",
        "di": 18.0,
        "diMin": 18.0,
        "diMax": 35.0
      }
    ]
  },
  {
    "id": "cuero",
    "label": "Cuero y marroquinería",
    "iva": 21,
    "di": 9.0,
    "diMin": 0.0,
    "diMax": 20.0,
      "subs": [
      {
        "id": "cuero-4202",
        "label": "Bolsos, carteras y billeteras",
        "ncm": "42.02",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 20.0
      },
      {
        "id": "cuero-41",
        "label": "Cueros y pieles curtidas",
        "ncm": "41",
        "di": 9.0,
        "diMin": 0.0,
        "diMax": 9.0
      },
      {
        "id": "cuero-4203",
        "label": "Prendas de cuero",
        "ncm": "42.03",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 20.0
      },
      {
        "id": "cuero-43",
        "label": "Peletería",
        "ncm": "43",
        "di": 9.0,
        "diMin": 9.0,
        "diMax": 20.0
      }
    ]
  },
  {
    "id": "madera",
    "label": "Madera, corcho y cestería",
    "iva": 21,
    "di": 9.0,
    "diMin": 0.0,
    "diMax": 35.0,
      "subs": [
      {
        "id": "madera-4421",
        "label": "Manufacturas de madera",
        "ncm": "44.21",
        "di": 12.6,
        "diMin": 12.6,
        "diMax": 35.0
      },
      {
        "id": "madera-4411",
        "label": "Tableros y aglomerados",
        "ncm": "44.11",
        "di": 9.0,
        "diMin": 9.0,
        "diMax": 12.6
      },
      {
        "id": "madera-4407",
        "label": "Madera en bruto o aserrada",
        "ncm": "44.07",
        "di": 5.4,
        "diMin": 5.4,
        "diMax": 5.4
      },
      {
        "id": "madera-45",
        "label": "Corcho y sus manufacturas",
        "ncm": "45",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 9.0
      }
    ]
  },
  {
    "id": "papel",
    "label": "Papel, cartón y librería",
    "iva": 21,
    "di": 10.8,
    "diMin": 0.0,
    "diMax": 16.0,
      "subs": [
      {
        "id": "papel-4802",
        "label": "Papel y cartón",
        "ncm": "48.02",
        "di": 10.8,
        "diMin": 0.0,
        "diMax": 16.0
      },
      {
        "id": "papel-4819",
        "label": "Cajas y envases de cartón",
        "ncm": "48.19",
        "di": 16.0,
        "diMin": 16.0,
        "diMax": 16.0
      },
      {
        "id": "papel-4820",
        "label": "Artículos de librería de papel",
        "ncm": "48.20",
        "di": 16.0,
        "diMin": 16.0,
        "diMax": 16.0
      },
      {
        "id": "papel-4818",
        "label": "Pañales y artículos de higiene",
        "ncm": "48.18",
        "di": 16.0,
        "diMin": 16.0,
        "diMax": 16.0
      }
    ]
  },
  {
    "id": "libros",
    "label": "Libros e impresos",
    "iva": 0,
    "di": 0.0,
    "diMin": 0.0,
    "diMax": 16.0,
    "nota": "Venta de libros exenta de IVA; otros impresos pueden tributar 21%.",
    "subs": [
      {
        "id": "libros-4901",
        "label": "Libros",
        "ncm": "49.01",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 0.0
      },
      {
        "id": "libros-4902",
        "label": "Diarios y revistas",
        "ncm": "49.02",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 0.0
      },
      {
        "id": "libros-4911",
        "label": "Mapas y otros impresos",
        "ncm": "49.11",
        "di": 16.0,
        "diMin": 0.0,
        "diMax": 16.0,
        "iva": 21
      }
    ]
  },
  {
    "id": "alimentos",
    "label": "Alimentos y bebidas (procesados)",
    "iva": 21,
    "di": 16.0,
    "diMin": 0.0,
    "diMax": 35.0,
      "subs": [
      {
        "id": "alimentos-16",
        "label": "Conservas de carne y pescado",
        "ncm": "16",
        "di": 16.0,
        "diMin": 16.0,
        "diMax": 16.0
      },
      {
        "id": "alimentos-17",
        "label": "Azúcar y confitería",
        "ncm": "17",
        "di": 16.0,
        "diMin": 16.0,
        "diMax": 20.0
      },
      {
        "id": "alimentos-18",
        "label": "Cacao y chocolate",
        "ncm": "18",
        "di": 20.0,
        "diMin": 9.0,
        "diMax": 20.0
      },
      {
        "id": "alimentos-19",
        "label": "Galletitas y panificados",
        "ncm": "19",
        "di": 16.0,
        "diMin": 12.6,
        "diMax": 18.0
      },
      {
        "id": "alimentos-20",
        "label": "Conservas de frutas y verduras",
        "ncm": "20",
        "di": 12.6,
        "diMin": 12.6,
        "diMax": 35.0
      },
      {
        "id": "alimentos-21",
        "label": "Preparaciones alimenticias diversas",
        "ncm": "21",
        "di": 16.0,
        "diMin": 0.0,
        "diMax": 18.0
      }
    ]
  },
  {
    "id": "bebidas",
    "label": "Bebidas y tabaco",
    "iva": 21,
    "di": 20.0,
    "diMin": 9.0,
    "diMax": 35.0,
      "subs": [
      {
        "id": "bebidas-2204",
        "label": "Vinos",
        "ncm": "22.04",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 35.0
      },
      {
        "id": "bebidas-2208",
        "label": "Bebidas espirituosas (licores)",
        "ncm": "22.08",
        "di": 20.0,
        "diMin": 10.8,
        "diMax": 20.0
      },
      {
        "id": "bebidas-2203",
        "label": "Cervezas",
        "ncm": "22.03",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 20.0
      },
      {
        "id": "bebidas-2202",
        "label": "Aguas y gaseosas",
        "ncm": "22.02",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 20.0
      },
      {
        "id": "bebidas-24",
        "label": "Tabaco y derivados",
        "ncm": "24",
        "di": 12.6,
        "diMin": 9.0,
        "diMax": 35.0
      }
    ]
  },
  {
    "id": "agro",
    "label": "Agro: animales, granos y frescos",
    "iva": 10.5,
    "di": 9.0,
    "diMin": 0.0,
    "diMax": 31.5,
    "nota": "Alimentos básicos sin elaborar: IVA reducido 10,5%.",
    "subs": [
      {
        "id": "agro-02",
        "label": "Carnes y despojos",
        "ncm": "02",
        "di": 9.0,
        "diMin": 5.4,
        "diMax": 10.8
      },
      {
        "id": "agro-03",
        "label": "Pescados y mariscos",
        "ncm": "03",
        "di": 9.0,
        "diMin": 0.0,
        "diMax": 9.0
      },
      {
        "id": "agro-04",
        "label": "Lácteos, huevos y miel",
        "ncm": "04",
        "di": 16.0,
        "diMin": 0.0,
        "diMax": 28.0
      },
      {
        "id": "agro-08",
        "label": "Frutas y frutos",
        "ncm": "08",
        "di": 9.0,
        "diMin": 0.0,
        "diMax": 9.0
      },
      {
        "id": "agro-07",
        "label": "Hortalizas y legumbres",
        "ncm": "07",
        "di": 9.0,
        "diMin": 0.0,
        "diMax": 25.0
      },
      {
        "id": "agro-10",
        "label": "Cereales y granos",
        "ncm": "10",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 10.8
      },
      {
        "id": "agro-12",
        "label": "Semillas y oleaginosas",
        "ncm": "12",
        "di": 7.2,
        "diMin": 0.0,
        "diMax": 9.0
      },
      {
        "id": "agro-09",
        "label": "Café, té y especias",
        "ncm": "09",
        "di": 9.0,
        "diMin": 9.0,
        "diMax": 30.0
      },
      {
        "id": "agro-15",
        "label": "Aceites y grasas",
        "ncm": "15",
        "di": 9.0,
        "diMin": 2.0,
        "diMax": 31.5
      }
    ]
  },
  {
    "id": "mineria",
    "label": "Minería y combustibles",
    "iva": 21,
    "di": 0.0,
    "diMin": 0.0,
    "diMax": 5.4,
      "subs": [
      {
        "id": "mineria-27",
        "label": "Combustibles y aceites minerales",
        "ncm": "27",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 5.4
      },
      {
        "id": "mineria-26",
        "label": "Minerales y escorias",
        "ncm": "26",
        "di": 0.0,
        "diMin": 0.0,
        "diMax": 3.6
      }
    ]
  },
  {
    "id": "joyeria",
    "label": "Joyería y piedras preciosas",
    "iva": 21,
    "di": 0.0,
    "diMin": 0.0,
    "diMax": 35.0,
      "subs": [
      {
        "id": "joyeria-7113",
        "label": "Joyas de metal precioso",
        "ncm": "71.13",
        "di": 18.0,
        "diMin": 18.0,
        "diMax": 18.0
      },
      {
        "id": "joyeria-7117",
        "label": "Bijouterie / fantasía",
        "ncm": "71.17",
        "di": 35.0,
        "diMin": 18.0,
        "diMax": 35.0
      },
      {
        "id": "joyeria-7103",
        "label": "Piedras preciosas",
        "ncm": "71.03",
        "di": 9.0,
        "diMin": 7.2,
        "diMax": 9.0
      }
    ]
  },
  {
    "id": "armas",
    "label": "Armas y municiones",
    "iva": 21,
    "di": 20.0,
    "diMin": 20.0,
    "diMax": 20.0,
      "subs": [
      {
        "id": "armas-9303",
        "label": "Armas",
        "ncm": "93.03",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 20.0
      },
      {
        "id": "armas-9306",
        "label": "Municiones y partes",
        "ncm": "93.06",
        "di": 20.0,
        "diMin": 20.0,
        "diMax": 20.0
      }
    ]
  },
  {
    "id": "arte",
    "label": "Obras de arte y antigüedades",
    "iva": 21,
    "di": 3.6,
    "diMin": 3.6,
    "diMax": 3.6,
      "subs": [
      {
        "id": "arte-9701",
        "label": "Cuadros y pinturas",
        "ncm": "97.01",
        "di": 3.6,
        "diMin": 3.6,
        "diMax": 3.6
      },
      {
        "id": "arte-9706",
        "label": "Antigüedades",
        "ncm": "97.06",
        "di": 3.6,
        "diMin": 3.6,
        "diMax": 3.6
      }
    ]
  },
  {
    "id": "diversas",
    "label": "Manufacturas diversas (bazar, etc.)",
    "iva": 21,
    "di": 18.0,
    "diMin": 12.6,
    "diMax": 35.0,
      "subs": [
      {
        "id": "diversas-9608",
        "label": "Artículos de escritura (lapiceras)",
        "ncm": "96.08",
        "di": 18.0,
        "diMin": 18.0,
        "diMax": 35.0
      },
      {
        "id": "diversas-9603",
        "label": "Cepillos y artículos de higiene",
        "ncm": "96.03",
        "di": 18.0,
        "diMin": 18.0,
        "diMax": 35.0
      },
      {
        "id": "diversas-9613",
        "label": "Encendedores",
        "ncm": "96.13",
        "di": 18.0,
        "diMin": 18.0,
        "diMax": 35.0
      },
      {
        "id": "diversas-96",
        "label": "Artículos varios",
        "ncm": "96",
        "di": 18.0,
        "diMin": 12.6,
        "diMax": 35.0
      }
    ]
  },
  {
    "id": "otros",
    "label": "Otros / no estoy seguro",
    "iva": 21,
    "di": 18.0,
    "diMin": 18.0,
    "diMax": 18.0,
    "nota": "Si no encontrás el rubro, usá esta opción; lo afinamos por NCM.",
    "subs": []
  }
];
