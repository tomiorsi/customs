# El archivo del pre-SIM — formato descifrado

Descifrado sobre **seis archivos reales** generados por Sintia, uno por familia:
EC01 (exportación a consumo), IC04 (importación a consumo), IT04 (temporaria sin
transformación), **IT14** (temporaria para transformación), **IDA4** (depósito de
almacenamiento) y **ZFI5** (ingreso a zona franca).

Los tres últimos llegaron el 19/08/2026 y **cinco de seis se reconstruyeron
idénticas al primer intento**, sin tocar una línea: las reglas deducidas de los
tres primeros valían para familias que no habíamos visto nunca. Lo que sí
corrigieron está anotado abajo.

Los archivos de muestra **no se guardan en el repo**: traen CUIT del importador,
valores y proveedores reales.

## La forma

Es un **INI**: secciones entre corchetes y pares `CLAVE=VALOR`, una por línea.

```ini
[DDT]
ISTA=IC04
CDDTBUR=001
MDDTFOB=60192
CDDTINCOTE=CFR
...

[ART]
IESPNCE=1513.19.00.000P
CARTPAYORI=316
QARTUNTEST=22800.00
NARTEXT=0001
...
```

## Lo importante: las secciones y las claves SON las tablas del Kit

No hay que inventar nada ni adivinar nombres. Cada sección del archivo es una
tabla de `KitSql`, y cada clave es una columna de esa tabla.

| Sección | Qué es | Tabla del Kit |
|---|---|---|
| `[DDT]` | Cabecera de la declaración | — (parametrizada por `GEN`) |
| `[ART]` | Un ítem. Se repite | `ART` |
| `[SBT]` | Un subítem, con los sufijos | `SBT` |
| `[CPL]` | Dato complementario. Se repite | `CPL` |
| `[DVD]` | Documento a presentar | `DVD` + códigos de `DOC` |
| `[CIB]` | Datos de IIBB | `CIB` |
| `[SRG]` | Régimen especial | `SRG` |
| `[BUL]` | Bultos | `BUL` |

`NART` liga cada sección a su ítem: `0000` = nivel cabecera, `0001` = ítem 1.

## `GEN` dice qué claves van en cada subrégimen

Verificado contra los tres archivos: **53 de 55 claves coinciden con lo que
predice `GEN`.**

| Subrégimen | Clave | `GEN` | En el archivo |
|---|---|---|---|
| IC04 | `CDDTPAIDST` | **P** prohibido | ausente ✓ |
| IC04 | `CDDTMOT` | **P** prohibido | ausente ✓ |
| EC01 | `CDDTPAIDST` | **O** obligatorio | `=221` ✓ |
| IT04 | `CDDTMOT` | **O** obligatorio | `=I31.1C` ✓ |
| IT04 | `QDDTREGSUS` | **O** obligatorio | `=90` (plazo) ✓ |

Única discrepancia: `CDDTPRFTIT`, marcada `O` y ausente en dos archivos. Al
principio supuse que la completaba el Kit después; **medido, es otra cosa**: esa
columna no existe en la tabla `DDT`, donde el campo se llama `CDDTPFXTIT`. Es un
desajuste entre dos tablas del mismo Kit, y por eso el validador no la pide (ver
«Errores vs avisos»).

**Conclusión: con `GEN` se puede generar un archivo válido para cualquiera de los
257 subregímenes de `STA`, sin tener un ejemplo de cada uno.**

## Los valores salen de las tablas que ya tenemos

| Clave | Qué es | Se valida contra |
|---|---|---|
| `ISTA` | Subrégimen | `STA` (257) |
| `CDDTBUR` | Aduana | `BUR` (291) |
| `CDDTINCOTE` | Incoterm | `INC` |
| `CDDTDEVFOB` / `FLE` / `ASS` | Divisa | `CTM` |
| `CDDTPAIDST`, `CARTPAYORI`, `CARTPAYPRC` | Países | `PAY` |
| `CARTUNTDCL` | Unidad de medida | `UMM` |
| `IESPNCE` | NCM con sufijo SIM | `ncm` (33.172) |
| `CDVDDOC` | Documento | `DOC` (802 vigentes) |
| `CDDTMOT` | Motivo de suspensiva | `MOT` |
| `CSBTSVL` | Sufijos de valor | `SUFIDOS` (43.147) |

Los sufijos van en un solo string con formato propio:

```
AA(S/M)-AI(RBD)-AJ(TAMBOR X 190 KG)-CA03-NA01-
```

Es el mismo formato que aparece en la columna `SUFIJOS` de los subítems del
corpus. Medido sobre los 72.466 que lo traen, las reglas salen solas: ver «El
formato de sufijos, medido».

## Qué faltaba para emitir

Nada de datos, y ya está escrito: el validador previo, el armador del INI y el
del string de sufijos. Lo pendiente está al final del documento.

---

## El módulo

`src/lib/presim/`

| Archivo | Qué hace |
|---|---|
| `tipos.ts` | El modelo del archivo, el orden de secciones y qué tabla valida cada clave |
| `archivo.ts` | Leer y escribir el INI. Texto puro, sin dependencias del servidor |
| `tablas.ts` | Carga las tablas del Kit desde `data/Normas/SIM/kit/*.csv`, con vigencias |
| `validar.ts` | Valida contra `GEN` y contra las tablas, a una fecha dada |
| `sufijos.ts` | Arma y controla el string de `CSBTSVL` |
| `armar.ts` | Produce la declaración desde una operación |
| `subregimen.ts` | Elige el subrégimen según la destinación |
| `index.ts` | La API pública |

Las tablas se cargan una vez y quedan en caché, igual que `vuce.ts`. Las columnas
de código, descripción y vigencia se **deducen** de la convención de nombres del
SIM (`CPOR`/`LPOR`/`DPOREFF`/`DPORFIN`) en vez de mantener un mapa a mano que se
desactualiza con cada tabla nueva.

### Por qué la validación pide fecha

Las tablas guardan historia: la aduana `001` (BS.AS. CAPITAL) rigió del 28/12/1992
al 16/01/2017 y después cambió de versión. Una carpeta de 2015 se valida contra lo
que regía en 2015. Sin eso, revisar el archivo histórico del estudio daría errores
falsos en masa.

### Errores vs avisos

Medido contra las tres declaraciones reales:

- **`P` (prohibido) se respeta 45 de 48, pero no siempre** → violarlo es
  **aviso**. Con tres archivos parecía absoluto y era error; la declaración de
  zona franca lleva tres campos marcados `P` —`LDDTNOMFOD`, `CDDTPAIDST` y
  `CDDTBURDST`— y se oficializó igual. Las tres vigencias de ZFI5 en `GEN` dicen
  `P`, así que no es una versión vieja. Un error significa «esto va a rebotar», y
  tenemos prueba de que no rebotó.
- **`O` (obligatorio) ausente es aviso, no error.** El archivo es la **entrada**
  al Kit, no la declaración final: hay obligatorios que se completan después.
- **`CDDTPRFTIT` no se pide en absoluto.** Era el caso que motivaba lo anterior, y
  resultó ser otra cosa: `GEN` lo exige en 60 subregímenes (23%) y la tabla `DDT`
  no tiene esa columna —ahí el campo es `CDDTPFXTIT`—. Pedir un campo que no se
  puede cargar con ese nombre es un aviso sin acción posible, y eso enseña a
  ignorar los avisos. La regla es general: si `GEN` nombra un campo que `DDT` no
  tiene, no se opina.
- Un código que no figura en su tabla es **aviso**, no error: puede ser real y que
  el Kit todavía no lo haya bajado.

## Pruebas

```bash
# ida y vuelta + validación, contra declaraciones reales
npx tsx --require ./scripts/register-server-only-stub.cjs \
  scripts/presim-verificar.mjs <archivo.txt> [...]

# 14 roturas a propósito: tiene que detectarlas todas
npx tsx --require ./scripts/register-server-only-stub.cjs \
  scripts/presim-pruebas-negativas.mjs <archivo.txt>

# vigencias por fecha y bordes
npx tsx --require ./scripts/register-server-only-stub.cjs \
  scripts/presim-pruebas-vigencia.mjs
```

Resultado al 19/08/2026, sobre las seis declaraciones reales:

| Prueba | Resultado |
|---|---|
| Ida y vuelta (leer → escribir da idéntico) | **6/6** |
| Orden de secciones respetado | **6/6** |
| Roturas detectadas | **14/14 en cada uno de los seis archivos** |
| Vigencias y bordes | **11/11** |

Una de las 12 roturas falló en el primer intento y **el error era de la prueba**:
usaba la aduana `999` como inexistente, y `999` es real («EXTERIOR - EXPORTAC.»).
Queda anotado en el script para no repetirlo.


---

## El armador (18/08/2026)

`armar.ts` produce la declaración a partir de una `OperacionSim`, y `sufijos.ts`
arma el string de `CSBTSVL`. Dos criterios que se siguieron:

- **Lo que la tabla sabe no se pregunta.** `CDDTIMPEXP` sale de `STA.CSTAIMPEXP`,
  no de un campo que el llamador podría contestar distinto que el SIM.
- **Lo que no se sabe no se inventa.** Un dato ausente no sale en el archivo: el
  SIM distingue «no vino» de «vino en cero», y `validar.ts` después lo marca.

### El formato de sufijos, medido

Tres reglas, las tres al 100% sobre los 72.466 subítems de `desp_subitems.csv`:

1. **Cierra con `-`.**
2. **Van ordenados alfabéticamente** por la clave de dos letras. Ningún
   contraejemplo en todo el corpus.
3. **Cada clave es de un solo tipo**: o texto entre paréntesis, o código de dos
   dígitos. De las 51 claves en uso, ninguna mezcla.

El tipo no está hardcodeado: sale de `cod_SUFIDOS.csv`, donde una clave de dos
caracteres (`AA` = MARCA) es texto libre y una de cuatro (`NA03` = "CON
POLIPROPILENO") es uno de los valores admitidos.

**La tabla local está incompleta, y va a seguir estándolo.** Cubre 11.672
posiciones contra las 33.172 del nomenclador: para el 51,7% de los subítems
reales no dice nada.

No es que falte exportarla mejor. Se comprobó con dos exports del Kit separados
en el tiempo (19/08/2026): su tabla `SUFVAL` contiene los sufijos de **una sola
posición**, la que estaban cargando en ese momento, y cambió de una a otra entre
los dos exports. **El Kit no guarda el catálogo: se lo pide al SIM por posición
y no lo conserva.** Las tablas `SECSUF`, `NOVSUF`, `SECPOS` y `NOVPOS` están
vacías por lo mismo.

Así que `cod_SUFIDOS.csv` —que viene de Sintia, no del Kit— es la mejor fuente
que hay, porque Sintia sí acumula lo que fue usando. La cobertura crece sola con
el trabajo del estudio: un export de Sintia más nuevo trae más posiciones.

Por eso `sufijosDePosicion` vacío significa «no sé», nunca «no lleva sufijos», y
`revisarSufijos` devuelve solo avisos. Es una condición permanente del diseño,
no un dato que falta cargar.

### Dos reglas que la prueba encontró y yo tenía mal

- **`ISBT` es `0000` cuando el ítem no se abre.** Yo numeraba siempre desde 1.
  Se numera `0001`, `0002`… solo con `CARTSBITEM=S`; si el ítem no está abierto,
  el único `[SBT]` es su descripción —lleva los sufijos y nada más— y va con
  `0000`. Se cumple en los 5 ítems de las tres declaraciones.
- **Los importes de cabecera no llevan formato fijo.** Los `MDDT*` reales salen
  con 0, 1 y 2 decimales (`60192`, `4686.8`, `648.79`) y la precisión natural
  del número explica los tres. Los de ítem sí llevan siempre dos, y la parte
  entera rellenada a dos dígitos (`01.00`, `03.76`, `09.02`).

### Pruebas

```bash
# ida y vuelta de los 72.466 strings de sufijos reales
npx tsx --require ./scripts/register-server-only-stub.cjs \
  scripts/presim-pruebas-sufijos.mjs

# reconstruir las declaraciones reales desde cero y comparar
npx tsx --require ./scripts/register-server-only-stub.cjs \
  scripts/presim-pruebas-armar.mjs
```

| Prueba | Resultado |
|---|---|
| Sufijos: ida y vuelta sobre el corpus | **72.466 / 72.466 (100%)** |
| Declaraciones reconstruidas idénticas | **3 / 3** (292 claves, 44 bloques) |

Los scripts leen los valores de los archivos en tiempo de ejecución: no tienen
adentro ningún CUIT ni importe, por eso pueden vivir en el repo.

## Destinación → subrégimen (`subregimen.ts`)

Elegir mal el subrégimen es presentar mal la declaración, así que el código se
**compone** con dos reglas de la RG 4200 y después se verifica contra `STA`.
Fuente: [Anexo II](https://servicios.infoleg.gob.ar/infolegInternet/anexos/305000-309999/306452/resgral4200-2.pdf)
(subregímenes) y [Anexo III](https://servicios.infoleg.gob.ar/infolegInternet/anexos/305000-309999/306452/resgral4200-3.pdf)
(motivos y plazos).

### Regla 1 — el último dígito es la situación de arribo

| Dígito | Situación | Anexo II |
|---|---|---|
| 1 | sin documento de transporte | «que arribe sin documento de transporte por la vía postal y aquella que lo hace por sus propios medios» |
| 4 | con documento de transporte | «cuya solicitud de destinación es efectuada con posterioridad al arribo del medio de transporte» |
| 5 | directo a plaza (DAP) | «con anterioridad al arribo del medio de transporte para su despacho directo a plaza» |
| 6 | sobre depósito de almacenamiento | «previamente sometida a la destinación suspensiva de depósito de almacenamiento» |

Verificado contra las 24 descripciones del Kit que mencionan la situación:
**24 de 24**. Las tres que no siguen el dígito —IC07, IT07, IT17— son del
régimen automotriz, que es un eje aparte y no una excepción.

**`DAP` acá es «Despacho Directo A Plaza» (art. 278 CA), no el Incoterm DAP**
(*Delivered At Place*). El sistema tiene un campo `incoterm` que puede valer
«DAP»: confundirlos elegiría el subrégimen por el término de entrega pactado con
el proveedor. Una de las fuentes consultadas los confunde.

### Regla 2 — la transformación la fija el motivo, no el nombre del régimen

- **Art. 31, punto 1** del Dto. 1.001/82 (motivos `I31.1x`: muestras, ferias,
  envases, pallets, material científico) → vuelve en el mismo estado → `IT0x`.
- **Art. 31, apartado 3** (`I31.3`, «transformación, elaboración, combinación,
  mezcla o reparación») → `IT1x`, que el Anexo II describe como «en el marco del
  Art. 31, Ap. 3, del Dto. 1.001/82».

La familia se lee del código del motivo, así que un motivo nuevo del apartado 3
entra solo. Un `I31.3` sobre la destinación de mismo estado se rechaza con el
porqué, en vez de emitir un código plausible.

**En exportación temporaria la numeración va al revés**: `ET01` es **con**
transformación y `ET02` **sin**. No se puede trasladar la intuición de
importación.

### Regla 3 — zona franca tiene ejes propios

No usa el dígito de arribo. La RG 1452 la cruza por dos ejes:

**Ingreso** — de dónde viene × para qué entra:

| | del territorio aduanero | del exterior |
|---|---|---|
| bienes de capital, radicación definitiva | ZFI1 | ZFI3 |
| almacenamiento / comercialización / reparación | ZFI4 | ZFI5 |
| insumos para proceso productivo | ZFI7 | ZFI8 |

**Egreso** — qué sale × hacia dónde:

| | al territorio aduanero | al exterior |
|---|---|---|
| en el mismo estado | ZFE1 | ZFE2 |
| producto de un proceso productivo | ZFE3 | ZFE4 |
| residuo con valor comercial | ZFE5 | ZFE6 |

**El régimen arancelario del egreso lo fija el destino, no la salida.** ZFE1 y
ZFE3 son `IMPCON` —salir de la zona franca hacia el territorio aduanero es una
importación— y ZFE2 y ZFE4 son `EXPCON`. La zona franca no es territorio
aduanero general.

### Qué se resuelve

| Destinación | Subregímenes |
|---|---|
| Importación a consumo | IC01 · IC04 · IC05 · IC06 |
| Temporaria perfeccionamiento industrial | IT11 · IT14 · IT15 · IT16 |
| Temporaria bienes de capital | IT01 · IT04 · IT05 · IT06 |
| Tránsito de importación | TR01 · TR04 · TR05 · TR06 |
| Depósito de almacenamiento | IDA4 |
| Ingreso a zona franca | ZFI1 · ZFI3 · ZFI4 · ZFI5 · ZFI7 · ZFI8 |
| Egreso de zona franca | ZFE1 · ZFE2 · ZFE3 · ZFE4 · ZFE5 · ZFE6 |
| Exportación a consumo | EC01 |
| Exportación temporaria | ET01 · ET02 |
| Tránsito de exportación | **no lleva subrégimen** — se registra por MIC/DTA en SINTIA |

Depósito de almacenamiento resuelve a **IDA4**: es el que corresponde con
documento de transporte por la regla del dígito, y el único que el estudio usa
—203 despachos contra ninguno de IDA2 en los 13.671 de `link_caratula.csv`—.
IDA2 es el que figura en la RG 1452; IDA4 nació en 2006, después de esa
resolución, y por eso no está en el anexo.

El tránsito de exportación no es un dato que falte: la mercadería ya fue
destinada a exportación y lo que se registra para moverla hasta la aduana de
salida es el MIC/DTA, que es otro documento. Los `TRB*` de `STA` son trasbordo,
que es otra cosa.

```bash
npx tsx --require ./scripts/register-server-only-stub.cjs \
  scripts/presim-pruebas-subregimen.mjs
```

42 controles, incluidas las tres declaraciones reales reproducidas desde su
destinación: EC01, IC04 e IT04 con motivo `I31.1C`.

## Usar `ERR` (los 791 rechazos del SIM)

**No se pueden ligar automáticamente a nuestros hallazgos**: solo 5 de los 791
mensajes nombran un campo del archivo. Mapearlos por palabras clave sería
adivinar, que es justo lo que `CLAUDE.md` prohíbe.

Lo que sí sirve, y es lo que se hizo:

1. **Leerlos para descubrir qué controla el SIM y nosotros no.** Así apareció
   el 1029, «Falta sufijo de valor del subítem»: el SIM rechaza el subítem sin
   sufijos y el validador ni lo miraba. Ahora lo avisa —no lo bloquea, porque
   hay 210 subítems reales sin sufijos sobre 72.759 (0,29%)—.
2. **Citar el número a mano donde sabemos cuál es**, para que el despachante
   lea el rechazo con las palabras del SIM y no con las nuestras.

## `cod_dest.csv`: descartado por redundante

Parecía una segunda fuente de qué exige cada subrégimen. Medido, **es el espejo
de `GEN` en la interfaz de Sintia**: sus columnas `Txt…` son controles de
formulario y la `x` marca el campo **deshabilitado**, no pedido. Leído así
coincide con `GEN` en 99% (motivo, plazo) y 86% (segunda aduana, país).

No se integra: duplicar la misma parametría con otro nombre agrega una fuente
que se puede desincronizar, sin aportar un control nuevo.

## El adaptador: de una operación al archivo

`desde-operacion.ts` cierra la cadena:

```
operación del sistema → OperacionSim → declaración → validación → archivo
```

**Nunca completa un dato que no tiene.** Lo que no se puede resolver va a
`faltantes` con el motivo, y sin los datos mínimos no devuelve archivo. Un valor
inventado viaja al SIM como si fuera cierto y vuelve como rechazo sin
explicación; un hueco se ve antes de emitir.

### La situación de arribo se deduce de la carpeta

- **Sin documento de transporte** cuando no hay ninguno cargado: vía postal o
  mercadería que llega por sus propios medios.
- **Directo a plaza** cuando la declaración se registra antes del arribo del
  medio de transporte (art. 278 del Código Aduanero).
- **Con documento de transporte** en el resto.

«Sobre depósito de almacenamiento» no se deduce: depende de si la mercadería ya
fue sometida a esa destinación suspensiva, y el sistema no lo sabe. Se pasa a
mano.

### Traducción de catálogos (`catalogos.ts`)

El sistema guarda texto —«Kilogramos», «Brasil»— y el archivo lleva códigos.
**No se traduce por parecido de texto**: da 13% en unidades, pero el problema no
es la tasa sino que un match difuso falla en silencio donde más caro sale. En
`PAY`, `308` es COREA DEMOCRATICA y `309` COREA REPUBLICANA.

| Catálogo | Cómo se resuelve |
|---|---|
| Unidades | Binding explícito de las 15, revisable de un vistazo |
| Países | Coincidencia exacta (31 de 36) + 2 bindings: Alemania y Corea del Sur |
| Incoterms | Sin traducción: el sistema ya guarda el código del SIM. 11/11 en `INC` |
| Aduana, moneda, embalaje | Coincidencia exacta contra `BUR`, `DEV` y `NEB` |

España figura como `ESPA#A` —el export del Kit perdió la ñ—; se resuelve leyendo
`#` como `Ñ` al normalizar, que alcanza a las únicas tres filas del Kit con ese
carácter.

«Otro país (Unión Europea)» y «Otro país (extrazona)» **no son países**: sirven
para cotizar, pero la declaración lleva uno concreto. Ahí falta el dato.

### El formulario ya no deja escribir códigos inválidos

`aduana` y `moneda` eran campos de texto libre: se podía escribir una aduana que
el SIM no acepta y enterarse recién al emitir. Ahora salen de `opciones.ts`, que
lee **las vigentes a la fecha** de `BUR` (77) y `DEV` (33).

No era teórico: escribiendo la prueba de la cadena usé `002` para el dólar y la
validación lo rechazó — **ese código venció el 11/01/2024** y el vigente es
`DOL`. La lista ya no lo ofrece.

Lo que ya estaba cargado se conserva aunque no figure entre las vigentes: puede
ser una carpeta vieja, y borrarle el dato al abrir el formulario sería peor.

### La pantalla

`PresimPanel` vive en la etapa de **oficialización** de la mesa de trabajo, al
lado de la ficha para Malvina: la ficha sirve para cargar a mano y esto arma el
archivo que el Kit importa. Es el mismo momento del trabajo.

Muestra primero **lo que falta cargar**, después lo que el SIM va a objetar, y
recién entonces el botón de descarga. Un despachante que abre esto quiere saber
si puede emitir; el archivo es el resultado, no la pregunta.

Se descarga en **latin-1 con saltos de Windows**, que es como vienen los
archivos de Sintia y lo que espera el Kit. La ruta es solo para el equipo: el
archivo lleva el CUIT del importador y los valores de la operación.

El CUIT del despachante sale de la variable de entorno `ESTUDIO_CUIT`, la misma
que ya usaba la ficha para Malvina.

### Una limitación del modelo de operación

La operación tiene **una** posición, una cantidad y una unidad, así que sale un
solo ítem. Una carpeta con varias posiciones hoy no se puede representar. Es del
modelo de operación, no del pre-SIM.

## Pruebas del pre-SIM

```bash
for s in verificar pruebas-negativas pruebas-vigencia pruebas-sufijos \
         pruebas-armar pruebas-subregimen pruebas-catalogos pruebas-cadena; do
  npx tsx --require ./scripts/register-server-only-stub.cjs scripts/presim-$s.mjs
done
```

| Prueba | Qué demuestra | Resultado |
|---|---|---|
| Sufijos | 72.466 strings reales reconstruidos | **100%** |
| Armador | Las 6 declaraciones reales, idénticas | **6/6** |
| Subregímenes | Contra la RG 4200 y las 6 reales | **45/45** |
| Catálogos | Ningún código inventado | **19/19** |
| Cadena | De una operación al archivo validado | **19/19** |
| Negativas | Roturas a propósito detectadas | **14/14** |
| Vigencias | Bordes por fecha | **11/11** |

## Lo que falta

1. **La pantalla.** El motor está entero y probado; falta el botón.
2. **Listas en el formulario** para aduana y moneda, que hoy son texto libre.
3. ~~Muestras de zona franca y depósito.~~ **Llegaron el 19/08/2026** y
   confirmaron las reglas: cinco de seis reconstruyen idénticas sin tocar nada.
   Las familias que faltan ahora son las chicas —reembarco, tránsito, régimen
   automotriz—, y ninguna es urgente.
