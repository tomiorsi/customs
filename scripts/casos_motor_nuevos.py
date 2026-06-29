"""
40 muestras para benchmark del motor (10 productos × 4 variantes en español).
NCM esperada verificada en data/Nomenclatura/ncm.parquet (mar 2026).
Métrica: ¿la partida correcta está entre las 5 del menú del motor?
"""

CASOS_NUEVOS = [
    {
        "id": "junta_motor",
        "esperado": "8484.10.00.000Z",
        "partida": "8484",
        "variantes": {
            "completa": (
                "Junta metaloplastica de estanqueidad para tapa de cilindros de motor "
                "diesel industrial, repuesto suelto importacion"
            ),
            "minima": "junta metaloplastica tapa cilindros motor diesel repuesto",
            "breve": "Juntas motor • metaloplástica • repuesto tapa cilindros",
            "ultra": "junta metaloplastica motor",
        },
    },
    {
        "id": "contactor_electrico",
        "esperado": "8536.50.10.000F",
        "partida": "8536",
        "variantes": {
            "completa": (
                "Contactor electrico de accionamiento para tablero de mando industrial, "
                "corriente nominal 25 A, repuesto importacion"
            ),
            "minima": "contactor electrico tablero mando industrial 25A repuesto",
            "breve": "Interruptor seccionador • 25 A • tablero industrial",
            "ultra": "interruptor seccionador electrico industrial",
        },
    },
    {
        "id": "chapa_cincada",
        "esperado": "7210.49.10.110C",
        "partida": "7210",
        "variantes": {
            "completa": (
                "Producto laminado plano de acero sin alear cincado por inmersion, "
                "chapa en bobina espesor 0,8 mm, importacion industria metalurgica"
            ),
            "minima": "producto laminado plano acero cincado bobina espesor 0,8 mm",
            "breve": "Laminado plano • acero cincado • bobina 0,8 mm",
            "ultra": "chapa acero cincada laminada bobina",
        },
    },
    {
        "id": "generador_diesel",
        "esperado": "8502.11.10.100F",
        "partida": "8502",
        "variantes": {
            "completa": (
                "Grupo electrogeno con motor de explosion de encendido por compresion, "
                "potencia 80 kVA, maquina completa importacion industrial"
            ),
            "minima": "grupo electrogeno motor diesel 80 kVA maquina completa",
            "breve": "Grupo electrógeno • diesel • 80 kVA • completo",
            "ultra": "grupo electrogeno diesel industrial",
        },
    },
    {
        "id": "pintura_epoxi",
        "esperado": "3208.10.10.000L",
        "partida": "3208",
        "variantes": {
            "completa": (
                "Pintura epoxi bicomponente base solvente para proteccion de estructuras "
                "metalicas en ambiente industrial, bidon importacion"
            ),
            "minima": "pintura epoxi bicomponente estructuras metalicas industrial",
            "breve": "Pintura epoxi • bicomponente • uso industrial",
            "ultra": "pintura epoxi industrial",
        },
    },
    {
        "id": "bateria_plomo",
        "esperado": "8507.10.10.110P",
        "partida": "8507",
        "variantes": {
            "completa": (
                "Acumulador electrico de plomo acido con electrolito sulfurico para "
                "arranque de motor diesel de camion, repuesto importacion"
            ),
            "minima": "bateria plomo acido arranque motor diesel camion repuesto",
            "breve": "Batería plomo • arranque diesel • repuesto camión",
            "ultra": "bateria plomo acido arranque",
        },
    },
    {
        "id": "sierra_arco",
        "esperado": "8202.10.00.110T",
        "partida": "8202",
        "variantes": {
            "completa": (
                "Sierra de arco manual con hoja de 155 mm de longitud, herramienta "
                "de corte para taller metalurgico importacion"
            ),
            "minima": "sierra arco manual hoja 155 mm taller metalurgico",
            "breve": "Sierra arco • hoja 155 mm • herramienta manual",
            "ultra": "sierra arco manual",
        },
    },
    {
        "id": "tornillo_rosca",
        "esperado": "7318.15.00.111J",
        "partida": "7318",
        "variantes": {
            "completa": (
                "Tornillo de acero con rosca metrica M12, cabeza hexagonal, "
                "para fijacion estructural industrial importacion"
            ),
            "minima": "tornillo acero rosca M12 cabeza hexagonal fijacion industrial",
            "breve": "Tornillo M12 • acero • cabeza hexagonal",
            "ultra": "tornillo acero rosca metrica",
        },
    },
    {
        "id": "filtro_aire",
        "esperado": "8421.31.00.000K",
        "partida": "8421",
        "variantes": {
            "completa": (
                "Filtro de admision de aire para motor de combustion interna "
                "de encendido por chispa, cartucho repuesto importacion"
            ),
            "minima": "filtro admision aire motor combustion chispa cartucho repuesto",
            "breve": "Filtro aire • motor nafta • cartucho repuesto",
            "ultra": "filtro aire motor repuesto",
        },
    },
    {
        "id": "radiador_auto",
        "esperado": "8708.91.00.110L",
        "partida": "8708",
        "variantes": {
            "completa": (
                "Radiador de aluminio para sistema de enfriamiento de motor de "
                "vehiculo automotor camion, repuesto importacion"
            ),
            "minima": "radiador aluminio enfriamiento motor vehiculo camion repuesto",
            "breve": "Radiador aluminio • camión • repuesto motor",
            "ultra": "radiador motor camion repuesto",
        },
    },
]
