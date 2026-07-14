/**
 * Principios del clasificador NCM (RGI del Sistema Armonizado / Mercosur).
 * Única fuente de verdad para los prompts de ia.ts.
 *
 * Cada regla apunta a una RGI concreta y se enuncia UNA sola vez; los prompts
 * concatenan estas constantes, así que evitar repetir el mismo criterio.
 */

export const PRINCIPIO_ARTICULO_CLASIFICADO =
  "Clasificás la línea importada facturada, no el equipo donde se monta.\n";

export const PRINCIPIO_HECHOS =
  "HECHOS = descripción facturada + respuestas del importador.\n" +
  "1. Usá SOLO las condiciones que figuren textualmente en HECHOS. No asumas materiales, funciones, partes ni usos que no estén escritos.\n" +
  "2. El NOMBRE del artículo (primeras palabras de HECHOS) define QUÉ es y su función principal. Los detalles que siguen describen CÓMO está construido y no lo convierten en otro tipo de artículo. Si un dato del importador contradice el nombre, prevalece el dato del importador.\n" +
  "3. PARTE vs ARTÍCULO COMPLETO: si el primer segmento nombra un aparato, máquina o artículo terminado, tratalo como unidad completa aunque un segmento posterior indique uso, destino o «repuesto/accesorio». Si nombra solo un componente o pieza suelta, tratalo como parte.\n" +
  "4. DESCRIPCIÓN JERÁRQUICA: los primeros segmentos nombran la familia del artículo; los posteriores lo califican. Un calificativo final (uso, destino, estado) no reinterpreta la mercadería como otra distinta salvo que HECHOS la nombre explícitamente.\n" +
  "5. Si HECHOS no aclara una distinción que el nomenclador exige entre hermanas, preguntá SOLO ese dato; no adivines.\n";

export const PRINCIPIO_PARTIDA_ESPECIFICA =
  "RGI 1: clasificá en la partida cuyo texto legal (y las Notas de Sección/Capítulo) describa el artículo de HECHOS. Los títulos de Sección/Capítulo solo orientan.\n" +
  "RGI 6: la subpartida se determina por su propio texto legal y las Notas de subpartida; solo se comparan subpartidas del mismo nivel. Una condición que figura en el encabezado de 4 dígitos pero no en el texto de la subpartida candidata ni en HECHOS no descarta esa subpartida.\n" +
  "PARTES vs APARATO: si el artículo es una parte identificable como destinada exclusiva o principalmente a un aparato con función propia, se clasifica como parte de ESE aparato, aunque el aparato se use dentro de una máquina mayor. No lo lleves a las partes de la máquina mayor. Las partes de uso general (Nota 2 de la Sección XV) van a sus propias partidas.\n" +
  "ARTÍCULO vs MATERIA: si HECHOS nombra un artículo con función propia (aparato, mecanismo), clasificá por el tipo de artículo aunque mencione el material de fabricación. Solo tratá el caso como materia cuando HECHOS nombre únicamente una materia o insumo sin función propia.\n";

export const PRINCIPIO_CIERRE =
  // Regla más crítica primero: contradicción entre el texto legal y HECHOS.
  "CONTRADICCIÓN (ERROR GRAVE): si el texto legal restringe el artículo a una variedad, tipo, material o cualidad Y HECHOS declara explícitamente otra distinta o contraria, esa línea DEBE descartarse (confirma:false). La línea correcta es la residual de la misma familia, si existe.\n" +
  "RGI 3 a) — ESPECÍFICA vs RESIDUAL: entre una línea específica y la residual («Los/Las demás») de la misma rama, elegí la específica si describe el artículo de HECHOS sin contradicción. Descartá primero las específicas cuyo texto nombra otro componente. Un acotamiento de uso no descarta la línea mientras HECHOS no declare un uso incompatible. No caigas en la residual por falta de datos numéricos accesorios ni por un dato de uso final ausente.\n" +
  "CALIFICADOR FINAL: si el último calificador o segmento de HECHOS nombra una variedad o subtipo concreto, elegí la línea cuya hoja o tipificación describe esa variedad, no la de otra variedad nombrada antes.\n" +
  "DISCRIMINANTE NO DECLARADO: si dos o más líneas comparten los segmentos de HECHOS pero difieren en una tipificación que HECHOS no menciona, no elijas al azar: confirma:false y faltaDato pidiendo ese dato con opciones factuales.\n" +
  "MATERIAL NO DECLARADO: si compiten partidas de materias distintas y HECHOS NO declara la materia, confirma:false y faltaDato preguntando el material. NUNCA confirma:true asumiendo una materia.\n" +
  "confirma:true si el texto legal de la línea elegida describe el artículo de HECHOS y HECHOS no lo contradice. Si exige una característica que HECHOS no menciona (pero tampoco contradice), no descartes automáticamente: aplicá RGI 3 a) entre hermanas.\n" +
  "faltaDato solo si entre hermanas del listado falta un dato factual que HECHOS no declare.\n";

/** Opciones y preguntas al importador: hechos, no pistas de clasificación. */
export const REGLA_OPCIONES_SIN_CLASIFICACION =
  "Preguntas y opciones al importador: solo datos factuales de lo que ES el artículo.\n" +
  "Sin números de partida, capítulo, sección ni NCM. Sin ejemplos de equipos, marcas ni listas ilustrativas.\n" +
  "Si el nomenclador exige una característica, la alternativa es la ausencia de esa característica; no inventes opuestos.\n";

export const REGLA_LINEAS_RESIDUALES =
  "RESIDUAL LOCAL vs GLOBAL: una hoja «Los/Las demás» cierra solo la rama cuyos encabezados intermedios figuran antes de ella en el listado. Leé la rama legal completa: el discriminante puede estar en un nivel intermedio, no en la hoja. Una residual bajo un encabezado que tipifica el artículo de HECHOS prevalece sobre una residual de ramas genéricas o de toda la partida.\n" +
  "RGI 3 c): si dos o más funciones/materiales tienen igual importancia y 3 a)/3 b) no deciden, clasificá en la última partida por orden de numeración.\n";

/** Paso 1 del cruce en dos etapas: elegir partida entre candidatas del motor. */
export const INSTRUCCION_ELECCION_PARTIDA =
  "ELECCIÓN DE PARTIDA (Paso 1):\n" +
  "1. Compará los segmentos iniciales de HECHOS con el encabezado y las ramas tipificadas de cada partida. Prevalece la partida que coincide con la familia del artículo.\n" +
  "2. Un segmento final de uso, destino o estado califica el producto ya nombrado; no autoriza cambiar de familia salvo que HECHOS nombre explícitamente otra mercadería.\n" +
  "3. UMBRAL NO DECLARADO: si las partidas candidatas se separan por un umbral numérico o dimensional del encabezado (peso, anchura, capacidad…) que NO figura en HECHOS, no lo asumas: confirma:false y faltaDato con opciones factuales.\n" +
  "4. ARTÍCULO vs MATERIA: si HECHOS nombra un artículo con función propia, preferí la partida del tipo de artículo sobre la de su material; si nombra solo la materia sin trabajar, elegí la materia.\n";

export const INSTRUCCION_CIERRE_FORZADO =
  "Con los datos de HECHOS, elegí el NCM más específico cuyo texto legal encaje. " +
  "Solo usá una línea residual si ninguna específica encaja. confirma:true obligatorio.\n";

export const CRITERIO_PARQUET =
  "Copiá el NCM SIM literal completo del listado, incluido el sufijo alfanumérico final si lo tiene; no acortes a subpartida.\n" +
  "Fundá con la RGI aplicable (RGI 1 encaje legal; RGI 3 a) específica sobre genérica/residual; RGI 6 comparación de subpartidas del mismo nivel) y las Notas del MARCO LEGAL.\n";

/** Cómo leer el listado de candidatos del motor. */
export const INSTRUCCION_LECTURA_LISTADO =
  "LISTADO DE CANDIDATOS: cada bloque `[subpartida]` puede traer «Tipificación legal» (encabezados intermedios de la rama) y «Rama común» (prefijo compartido). Ambos son texto legal discriminante junto con cada línea SIM. " +
  "No elijas un NCM solo porque la hoja diga «Los/Las demás»: compará primero qué tipificación o rama encaja con el tipo u operación declarada en HECHOS.\n";
