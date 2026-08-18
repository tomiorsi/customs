# Plan de producto — dónde jugamos y qué sigue

Anotado el 17/08/2026, después de mirar el mercado.

## El mercado, en tres capas

| Capa | Quiénes | Qué tienen | Qué les falta |
|---|---|---|---|
| Enterprise | SIDOM | RPA sobre el SIM, 14 países, GovTech, clientes multinacionales | El despachante chico y mediano |
| Gestión de estudio | AVG (Córdoba), DUX/Mymtec, Darsys, Linex | Interfase al SIM, facturación, cuenta corriente, contabilidad, CRM, RPA | Clasificación, lectura de documentos, portal del cliente |
| Cotizadores | Arancely, Shippar, servidos.ar | La punta linda, gratis, para importadores | No llegan al despacho |
| Servicio | Aduanex | Importan con licencia propia | No venden software |

Ninguno cubre dos capas. **La franja media de despachantes no tiene a quién comprarle.**

Ninguno de los de gestión publica precio: se venden por teléfono, con licencia más
abono mensual de mantenimiento. Por eso no llegan a los estudios chicos — no es que
no quieran, es que su modelo comercial no da el margen para vender de a uno.

## Lo que decidimos

**Jugamos en la franja media de despachantes.** No en el terreno de importadores:
ahí el cotizador es gratis en todos lados porque nadie lo vende — lo usan de anzuelo
para otro negocio. Competir contra algo gratis financiado por otra cosa se pierde
antes de empezar.

La calculadora es la **demo**, no el producto. Debería ser pública y sin login.

### Lo que NO hacemos

- **Contabilidad.** Exportamos a lo que use el contador. Competir con un sistema
  contable es fundar otra empresa.
- **Reemplazar el Malvina.** No se puede: la oficialización es un acto jurídico
  dentro del sistema del Estado. El techo real es el pre-SIM.
- **RPA sobre el SIM.** Ya lo tienen SIDOM y DUX. No es terreno para pelear.
- **Producto propio para importadores.** Solo como puerta de entrada.

## Estado real, medido (no percibido)

Dos números que no hay que confundir:

- **Motor de partidas: 256/260 (98,5%).** Texto corto → partida. Un solo salto,
  entrada limpia. Es el número de `scripts/fixtures/muestras-motor-*.json`.
- **Interpretación de carpetas: 14/21 «PDFs 100% fundamentados».** Ojo con leer eso
  como 67% de acierto: **no lo es.**

`audit-interpretacion-fundada.mjs` **no llama a la IA**. Toma la salida congelada de
la IA y la vuelve a pasar por la capa determinística de anclaje
(`fundamentarDatosDesdeTranscripcion`); marca OK solo si esa capa **no tuvo que tocar
nada**. O sea que mide *cuánto coincide la IA con el anclaje*, no *si la salida final
está bien*.

Auditadas las 7 fallas una por una (17/08/2026), son tres casos y **en los tres el
código corrige bien a la IA**:

| Falla | Qué pasa | ¿Salida final correcta? |
|---|---|---|
| 4 docs · `pago.nro_factura` ausente → recuperado | La IA no encontró el nº de factura; el anclaje lo saca del texto | Sí, lo mejora |
| 2 docs · `pais_origen` «Brasil» → `pais_procedencia` | La IA puso origen en un CRT; el anclaje lo mueve a procedencia | Sí, y es lo legalmente correcto |
| 1 doc · `peso_neto` «16.673,200 kg» → `valor_factura` | Valor monetario leído como peso; el anclaje lo reasigna | Sí |

**La salida final de los 21 documentos es correcta.** Lo que el número mide es cuántas
veces la IA sola habría errado sin la red determinística abajo.

Conclusión: la interpretación **no está a mitad de camino**. Lo que falta no es
precisión, es que la IA acierte sola más seguido — que es optimización, no un agujero.

**Ojo con tapar esto con reglas.** Vale lo mismo que en `CLAUDE.md`: preguntar
siempre *¿qué hay para sacar antes de poner?* antes de agregar una heurística.

## Orden de trabajo (decidido el 18/08/2026)

1. **Pre-SIM** — determinístico, no consume tokens, y los datos ya están.
2. **Medir el clasificador** contra los 61.333 casos reales.
3. **Cuenta corriente + facturación** — al final. Decisión de Tomás: no volver a
   proponerla como próxima tarea hasta que 1 y 2 estén.

## Cuenta corriente y facturación — POSTERGADO

> Queda anotado acá para no perderlo. **No es la próxima tarea.**

Es lo que decide la venta frente a AVG y DUX, y no depende de la IA.

### El modelo: tres platas que no se mezclan

| Concepto | Qué es | Tratamiento |
|---|---|---|
| Honorarios | Ingreso del estudio | Factura A con IVA discriminado |
| Gastos por cuenta y orden | Tributos, terminal, naviera, depósito | **No son ingreso.** Se rinden, no se facturan. Comprobantes a nombre del cliente |
| Anticipos / fondos | Plata que el cliente manda antes | Ni ingreso ni gasto: saldo a favor |

Facturar los gastos por cuenta y orden como ingreso propio le infla la base
imponible y el IVA al despachante. **No es un bug de interfaz, es un problema
fiscal.** Los pagos además deben ser trazables (transferencia o cheque, no efectivo).

Sumar la **subcuenta María/Malvina**: fondos depositados en ARCA que se debitan al
pagar tributos. Es otra cuenta a conciliar.

### Pasos

1. **Modelo de movimientos** tipados (honorario / gasto por cuenta y orden /
   anticipo) por operación.
2. **Rendición**: documento por operación — gastos rendidos con sus comprobantes +
   honorarios + IVA − anticipos = saldo. Prima hermana de `cotizacion-pdf.ts` y
   `estimacion-pdf.ts`; los tributos ya los calcula `liquidacion.ts`.
3. **Factura A de honorarios** contra los webservices de ARCA: WSAA (autenticación
   con certificado) + WSFEv1 (CAE). Hay ambiente de homologación. Nace obligado a
   CAE en tiempo real por la RG 5782, vigente desde el 01/08/2026.

Los pasos 1 y 2 solos ya reemplazan el Excel. El 3 se puede hacer después.

## Después: destinaciones

`src/lib/destinaciones.ts` ya tiene 10 destinaciones (6 impo, 4 expo) con familia,
norma, plazo, prórroga, autorización y cancelación — **construidas desde el Código
Aduanero, sin una sola muestra**. Ese camino funciona y hay que seguirlo.

Separar las dos mitades del problema:

| | Fuente | ¿Necesita muestras? |
|---|---|---|
| Qué destinaciones existen, plazo, tributos, autorización, cancelación | Normativa | **No** — es una tabla |
| Dada una situación real, cuál corresponde | Criterio | **Sí** — pero pocas |

El universo de respuestas son ~10-30 opciones, no 10.000 posiciones: con una docena
de casos por familia alcanza para medir.

### Cómo conseguir las muestras

Del archivo del despachante, **pidiendo las raras, no el volumen**. Cien despachos a
consumo no enseñan nada que uno solo no enseñe. Lo que falta:

- La temporaria que entró para reparar y volvió
- La que se convirtió a consumo en vez de reexportar
- Zona franca y tránsito
- **Sobre todo: la que salió mal** — la que venció, la garantía ejecutada, la
  documentada por el régimen equivocado

Anonimizar CUIT, nombres y valores: importa la *situación* y la *destinación
elegida*, no la identidad.

Y como sale gratis: **que el producto junte sus propias muestras.** Guardar la
situación y la elección cada vez que se elige una destinación. En seis meses hay
corpus sin haber salido a buscarlo.

Vale la regla de siempre: las muestras son para **medir**, no para ajustar contra
ellas.

## Tablas del SIM: dónde están y qué está vigente

Investigado el 17/08/2026 hasta el final, porque un archivo de 2003 daba desconfianza.

**La RG 1452/2003 está vigente.** No es un documento viejo: es la fecha de sanción de
una norma que sigue en pie.

- Infoleg: *«Esta norma modifica o complementa a 8 normas. Esta norma NO es
  complementada ni modificada por ninguna norma.»* Reemplazó a la Res. 2707/1993 y
  desde entonces nadie la modificó.
- SAIJ, republicación de enero de 2026: *«Vigente, de alcance general.»*

**Lo que se actualiza es el contenido de las tablas, y no se publica.** Se distribuye
adentro del Kit Malvina, a su base de datos interna. AFIP repartió por ejemplo
`POR-sqlkit.exe`, cuya única función es instalar los valores de la tabla POR (Puertos)
en la base local del Kit.

Verificado descargando los instaladores (y borrados después):

| Descarga | Tamaño | Qué trae |
|---|---|---|
| `kit-maria-7.0.0_V19.zip` | 2,7 MB | Solo el actualizador: el .exe y una OCX |
| `kit-maria-6.8.9-64bitsV9.zip` | 326 MB | La app + un SQL Server embebido. **Cero datos de tablas** |

Los 2.457 archivos del instalador completo son la aplicación y el motor de base de
Microsoft. Las tablas se pueblan **después de instalar, contra el SIM**.

### Conclusión operativa

| Capa | Fuente | Estado |
|---|---|---|
| Estructura: qué tablas hay, qué columnas, qué significa cada destinación | RG 1452/2003 | Vigente. Ya descargada en `data/Normas/SIM/` |
| Valores vivos: puertos, aduanas, códigos nuevos | Base interna del Kit instalado | Sale de la máquina del despachante |

No existe una versión publicada más nueva de las tablas. **No seguir buscándola.**

Lo descargado no se tira: la columna «Aplicación» de cada destinación es la regla de
decisión (*«destinadas con anterioridad al arribo del medio de transporte para su
despacho directo a plaza»*) y eso no cambia con un parche de puertos.
