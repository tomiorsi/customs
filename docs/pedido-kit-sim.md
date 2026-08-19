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

## 2. Tablas del Kit que vinieron vacías

Al correr `scripts/kit-sim/3-exportar-kit.bat` salieron **112 tablas**, pero
seis de ellas quedaron **sin una sola fila, ni siquiera el encabezado**:

```
SECSUF    NOVSUF    SECPOS    NOVPOS    TIT    DEP
```

Y una salió casi vacía: **`SUFVAL` con 13 filas**, cuando debería tener miles.

### Esto no es un error del script

El script exporta **todas** las tablas automáticamente (`SELECT name FROM
sys.tables`), así que si salieron vacías es porque **están vacías en el Kit**.

### Por qué importa

`SECSUF` y `SUFVAL` son las que dicen **qué sufijos pide cada posición del
nomenclador**. Hoy usamos `SUFIDOS` (que vino de Sintia, no del Kit) y cubre
**11.672 posiciones de las 33.172** del nomenclador: para el **51,7%** de los
subítems reales no sabemos qué sufijos corresponden.

El sistema lo maneja bien —cuando no sabe, dice que no sabe en vez de inventar—
pero con esas tablas podría avisar antes de emitir.

### La pregunta concreta

> **¿El Kit tiene aplicados los últimos parches de tabla de AFIP?**

Las tablas del SIM **no se actualizan solas por tener el Kit prendido**. AFIP
reparte:

- **Versiones nuevas del Kit** (la 7.0 es obligatoria desde el 24/06/2025).
- **Parches puntuales por tabla**: ejecutables que escriben los valores en la
  base local. Ejemplo real: `POR-sqlkit.exe`, que carga la tabla de Puertos.

Si hace mucho que no los aplica, puede que esas tablas nunca se hayan poblado.
**Si aplica los parches y vuelve a correr `3-exportar-kit.bat`, quizás vengan
llenas.** Si aun así salen vacías, es que el Kit las consulta al SIM cada vez y
no las guarda — y entonces esa parte no la vamos a tener localmente nunca, y
hay que dejar de buscarla.

---

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

Si aplica los parches de AFIP primero, mejor — así vemos si `SECSUF` y `SUFVAL`
se pueblan.
