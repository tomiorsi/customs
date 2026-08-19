# Qué pedirle al despachante que tiene el Kit

Anotado el 18/08/2026, después de medir contra lo que ya tenemos.

Todo esto sale de **su** máquina: el Kit Malvina instalado y Sintia. No hay
forma de conseguirlo por otro lado — las tablas del SIM no se publican, viven
en la base interna del Kit (ver `docs/formato-txt-presim.md`).

**Nada de lo que sigue tiene que ver con la codificación del archivo.** El
pre-SIM ya escribe en latin-1 con saltos de Windows, que es lo que el Kit
espera. Eso está resuelto.

---

## 1. Tres declaraciones reales — es lo más valioso

Lo mismo que ya nos pasó (los `.txt` que genera Sintia antes de importar al
Kit), pero de estas tres familias:

| Subrégimen | Qué es | Por qué la necesitamos |
|---|---|---|
| **ZFI5** | Ingreso a zona franca de mercadería del exterior | Es la más usada del estudio en zona franca: 627 despachos |
| **IDA4** | Depósito de almacenamiento | 203 despachos, y no tenemos ninguno |
| **IT14** | Temporaria **para transformación**, con documento de transporte | Es la única familia grande sin muestra |

**Con una de cada una alcanza.** No hace falta volumen: cien despachos iguales
no enseñan nada que uno solo no enseñe.

### Por qué

Todo lo que medimos hasta ahora sale de **tres archivos**: un EC01 (exportación
a consumo), un IC04 (importación a consumo) y un IT04 (temporaria sin
transformación). De ahí dedujimos:

- Las convenciones numéricas (dos decimales, parte entera rellenada a dos
  dígitos, cinco decimales en el coeficiente).
- Los campos que van siempre con el mismo valor (`CDDTPRD=N`, `CARTTYP=N`,
  `CARTPAGREG=N`, `CARTCALDST=N`).
- El orden de las secciones.
- Que `ISBT` es `0000` cuando el ítem no se abre en subítems.

Las cuatro reglas se cumplen en los tres archivos, pero **tres archivos son
tres subregímenes de 257**. Zona franca y depósito no tienen ni una muestra, y
son justo las familias con parametría propia.

### Aclaración sobre los datos

Traen CUIT del importador, valores y proveedores. **No entran al repositorio**:
van a `data/`, que git ignora. Si prefiere, puede reemplazar el CUIT y los
importes por números inventados — lo que importa es **qué campos aparecen y con
qué forma**, no los valores.

---

## 2. Tablas del Kit vacías — RESUELTO, no hace falta pedir nada

> Cerrado el 19/08/2026 con un segundo export. **No volver sobre esto.**

Seis tablas —`SECSUF`, `NOVSUF`, `SECPOS`, `NOVPOS`, `TIT`, `DEP`— salieron
vacías, y sospechábamos que era por falta de los parches de ARCA. **No es eso.**

El segundo export llegó sin los parches aplicados y con las codificadoras
idénticas, pero trajo la respuesta igual: lo único que cambió fueron las tablas
de despachos —una declaración más, EC01— y **`SUFVAL`, que pasó de tener los
sufijos de `7214.99.10.100U` a los de `7214.20.00.000X`**.

O sea que `SUFVAL` no es un catálogo incompleto: es una **tabla de trabajo** que
guarda los sufijos de la posición que se está cargando en ese momento.
Verificado — su única posición está entre los ítems del Kit. `IMP` es lo mismo
para el formulario de impresión (`NRO_HOJA`, `TIPO`, `NRO_CAMPO`, `VALOR`).

**Conclusión: el Kit no guarda el catálogo de sufijos. Lo pide al SIM por
posición, cuando lo necesita, y no lo conserva.** Las seis vacías responden al
mismo patrón. Aplicar los parches no las va a llenar.

Lo que sí tenemos —`cod_SUFIDOS.csv`, de Sintia, 11.672 posiciones— resultó ser
la **mejor** fuente disponible, porque Sintia sí acumula lo que fue usando en
años de trabajo real. La cobertura crece sola a medida que el estudio despacha:
un export de Sintia más nuevo va a traer más posiciones que uno viejo.

Y de paso: cada export del Kit captura el `SUFVAL` de la posición que estaban
tocando. Al importar se **unen**, no se pisan (ver el commit del 19/08), así que
si exportan cada tanto se acumula de a poco.

### Lo único que quedó pendiente del Kit

Nada. El export está completo y no hay más que pedirle.

## 3. Dos cosas para confirmar de palabra

Son preguntas de criterio, no de datos. Las contesta en dos minutos y nos
ahorran adivinar:

1. **Depósito de almacenamiento: ¿usan `IDA2` o `IDA4`?**
   En los 13.671 despachos del archivo aparece **IDA4 203 veces e IDA2
   ninguna**, y el sistema hoy elige IDA4. Queremos confirmar que es así siempre
   y no una casualidad del período. (`IDA2` es el que figura en la RG 1452;
   `IDA4` nació en 2006, después de esa resolución.)

2. **Tránsito de exportación: ¿se registra por MIC/DTA en SINTIA y no lleva
   subrégimen del SIM?**
   Es lo que concluimos y por eso el sistema no propone ningún código ahí. Si
   estamos equivocados, es un agujero.

---

## Cómo se lo pasa

Ya está todo armado en `scripts/kit-sim/`, con instrucciones en su `LEEME.md`.
Los pasos son:

1. Correr **`3-exportar-kit.bat`** (solo lee, no modifica nada).
2. Deja un `tablas-kit.zip` en esa misma carpeta.
3. Mandar ese zip, más los tres `.txt` del punto 1.

Ya no hace falta pedir el export de tablas otra vez: se hizo dos veces y quedó
demostrado que el Kit no guarda lo que faltaba (ver el punto 2). **Lo único que
necesitamos son los tres `.txt` del punto 1.**
