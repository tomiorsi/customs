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

## Lo que falta del pre-SIM (pendiente al 18/08/2026)

Lo hecho es **leer y validar**. Falta **armar** desde una operación del sistema:

1. **Mapeo operación → claves del SIM.** Hoy `armar.ts` escribe bloques ya
   formados; falta la capa que traduce una `OperationWithClient` a `[DDT]`,
   `[ART]`, `[DVD]`, etc. Ahí entran `liquidacion.ts` (valores) y
   `destinaciones.ts` (subrégimen).
2. **Armador del string de sufijos** — el formato
   `AA(S/M)-AI(RBD)-AJ(TAMBOR X 190 KG)-CA03-NA01-`. Hay 61.134 subítems reales
   con ese campo armado en `data/Normas/SIM/sintia/desp_subitems.csv`, así que
   el formato por posición se deduce de ahí en vez de inventarlo.
3. **Sección `[BUL]`** (bultos) y `[CIB]` (IIBB): están soportadas al leer y
   escribir, pero nadie las genera todavía.
4. **Usar `ERR`** (791 mensajes del SIM) para que el aviso diga qué rechazo
   concreto se estaría evitando.

Nada de esto necesita datos nuevos: está todo en `data/Normas/SIM/`.
