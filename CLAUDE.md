# Cómo trabajar en este repo

## Antes de tocar el motor de nomenclatura o el de interpretación de documentos

Aplica a `src/lib/clasificador/**` (motor NCM) y a la interpretación de facturas
y documentos (`src/lib/clasificar-documento.ts`, `src/lib/nomenclador-desde-documento.ts`,
extracción y cruce de documentos). **Ningún cambio en estos motores entra sin pasar
por los cuatro puntos de abajo.**

### 1. Reglas generales, nunca calibradas a las muestras

Una corrección vale si sirve para cualquier producto del nomenclador, no para los
casos con los que se está probando. Si un cambio necesita nombrar un producto, una
partida o un capítulo concreto para funcionar, está mal planteado: es un parche a la
muestra y hay que replantearlo.

Las muestras son para **medir**, no para ajustar contra ellas.

### 2. Sacar el ruido antes de agregar nada

Ante un fallo, primero buscar y eliminar la causa en el origen. Recién si el problema
sobrevive a eso, agregar una regla. Agregar heurísticas encima de un retrieval ruidoso
tapa el síntoma y deja el sistema más frágil y más difícil de razonar.

Preguntar siempre: *¿qué hay para sacar antes de poner?*

### 3. Medir antes y después, contra los fixtures

```bash
npx tsx --require ./scripts/register-server-only-stub.cjs scripts/benchmark-motor-partidas.mjs --todos
```

260 casos reales en `scripts/fixtures/muestras-motor-*.json`. Se corre **antes** del
cambio (línea base) y **después**. Referencia conocida: **256/260 (98.5%)**.

**Si baja aunque sea un caso, se revierte.** No se cambia acierto medido por mejora
percibida, y no se rescata una regla rota apilándole excepciones.

### 4. Verificar con el pipeline completo

`tsc --noEmit` y `eslint` limpios, y una corrida de muestras variando el largo del
texto (1, 2 y 4+ palabras), porque los fallos aparecen distinto según cuánto texto
entra.

## Aprendido midiendo (no repetir estos errores)

- **El desempate del ranking decidía por número de partida.** Con una sola palabra el
  puntaje por clave es binario, así que casi todas las partidas empatan y el orden lo
  terminaba resolviendo `localeCompare` del código. Por eso «cable» traía 4415
  (cajones de madera) antes que 5501: 4415 < 5501, nada más. Con varias palabras los
  puntajes se diferencian y el empate no ocurre — de ahí que «con una palabra no
  llegaba nada y con más sí».

- **«… para X» no es ruido en el nomenclador.** Define el artículo constantemente
  («MÁQUINAS PARA LAVAR ROPA», «ARTÍCULOS PARA FUEGOS ARTIFICIALES», «APARATOS Y
  DISPOSITIVOS PARA LANZAMIENTO DE AERONAVES»). Filtrar lo que sigue a «para» costó
  12 casos de 260 (98.5% → 93.8%) y hubo que revertirlo. Tampoco alcanza la distinción
  infinitivo/sustantivo. Si el destino estorba, se corrige **pesando**, no filtrando:
  nunca sacar recall.

- **El tamaño del corpus varía 18x entre partidas** (273k caracteres la mayor contra
  15k la mediana). No infla el puntaje —es binario por clave— pero sí la probabilidad
  de empatar, así que alimenta el problema del desempate, no es un problema aparte.

- **Toda salida sin cierre debe llevar la hipótesis en curso.** Si el clasificador
  pregunta y no adjunta `provisional`, la UI muestra «Todavía no hay una posición
  fija» y el usuario lo lee como que el sistema no respondió nada.

## Medir concurrencia con cuidado

Correr varias clasificaciones en paralelo dispara la latencia por encima del timeout
de 45s y produce `SIN_RESULTADO` que **no son fallos reales**. Para medir calidad,
correr de a una; la concurrencia se mide aparte y a propósito.
