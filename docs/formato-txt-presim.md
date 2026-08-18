# El archivo del pre-SIM — formato descifrado

Descifrado el 18/08/2026 sobre tres archivos reales generados por Sintia
(IC04 importación a consumo, IT04 temporaria, EC01 exportación a consumo).

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

Única discrepancia: `CDDTPRFTIT`, marcada `O` y ausente en dos archivos —
probablemente la completa el Kit en una etapa posterior. No bloquea nada.

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

Es el mismo formato que aparece en la columna `SUFIJOS` de los 61.134 subítems
del corpus, así que hay de dónde sacar ejemplos para cada posición.

## Qué falta para emitir

Nada de datos. Lo que queda es escribir:

1. El armador del INI a partir de una operación.
2. El validador previo: cada valor contra su tabla y contra su vigencia en la
   fecha de la declaración.
3. El armador del string de sufijos por posición.

`ERR` (791 mensajes del SIM) sirve para anticipar los rechazos.

---

## El módulo

`src/lib/presim/`

| Archivo | Qué hace |
|---|---|
| `tipos.ts` | El modelo del archivo, el orden de secciones y qué tabla valida cada clave |
| `archivo.ts` | Leer y escribir el INI. Texto puro, sin dependencias del servidor |
| `tablas.ts` | Carga las tablas del Kit desde `data/Normas/SIM/kit/*.csv`, con vigencias |
| `validar.ts` | Valida contra `GEN` y contra las tablas, a una fecha dada |
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

- **`P` (prohibido) se cumplió 3 de 3** → violarlo es **error**.
- **`O` (obligatorio) no se cumplió**: `CDDTPRFTIT` está marcado O para IC04 e IT04
  y las dos declaraciones reales lo omiten (es O en 60 de 250 subregímenes, así que
  no es un caso aislado). El archivo es la **entrada** al Kit, no la declaración
  final: hay obligatorios que el Kit completa después → **aviso**.
- Un código que no figura en su tabla es **aviso**, no error: puede ser real y que
  el Kit todavía no lo haya bajado.

## Pruebas

```bash
# ida y vuelta + validación, contra declaraciones reales
npx tsx --require ./scripts/register-server-only-stub.cjs \
  scripts/presim-verificar.mjs <archivo.txt> [...]

# 12 roturas a propósito: tiene que detectarlas todas
npx tsx --require ./scripts/register-server-only-stub.cjs \
  scripts/presim-pruebas-negativas.mjs <archivo.txt>

# vigencias por fecha y bordes
npx tsx --require ./scripts/register-server-only-stub.cjs \
  scripts/presim-pruebas-vigencia.mjs
```

Resultado al 18/08/2026, sobre IC04, IT04 y EC01 reales:

| Prueba | Resultado |
|---|---|
| Ida y vuelta (leer → escribir da idéntico) | **3/3** |
| Orden de secciones respetado | **3/3** |
| Roturas detectadas | **12/12 en cada archivo (36/36)** |
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

**La tabla local está incompleta y el código lo asume.** Cubre 11.672 posiciones
contra las 33.172 del nomenclador: para el 51,7% de los subítems reales no dice
nada. Mismo cuadro que los complementarios de `ZCP` — el catálogo completo lo
baja el Kit del SIM. Por eso `sufijosDePosicion` vacío significa «no sé», nunca
«no lleva sufijos», y `revisarSufijos` devuelve solo avisos.

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

## Lo que falta del pre-SIM

1. **El adaptador `OperationWithClient` → `OperacionSim`.** Es lo único que
   falta para que todo esto se use desde una pantalla.
2. **Muestras de zona franca y depósito.** Todo lo medido sale de EC01, IC04 y
   EC01: las convenciones numéricas y los flags constantes se infirieron de
   ahí. Con una declaración real de cada familia alcanza para confirmarlas.
