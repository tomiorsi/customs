/**
 * Principios del clasificador — tres fases.
 * Única fuente de verdad para prompts de ia.ts.
 */

export const PRINCIPIO_ARTICULO_CLASIFICADO =
  "Clasificás la línea importada facturada, no el equipo donde se monta.\n";

export const PRINCIPIO_HECHOS =
  "HECHOS = descripción facturada + respuestas del importador.\n" +
  "1. Usá SOLO las condiciones que figuren textualmente en HECHOS.\n" +
  "2. No asumas ni deduzcas características técnicas, funciones principales, materiales, partes o usos que no estén explícitamente escritos.\n" +
  "3. Si el nomenclador distingue entre tecnologías o características y HECHOS no lo aclara, preguntá SOLO si sin ese dato no puede elegirse entre hermanas específicas. Si una línea específica encaja con HECHOS sin contradicción (RGI 3 a)), cerrá con esa; no uses la residual mientras exista una específica aplicable al componente declarado.\n" +
  "4. El NOMBRE DEL ARTÍCULO (las primeras palabras de HECHOS que describen QUÉ es el artículo) define su tipo y función principal. Los detalles técnicos que siguen (componentes, materiales, sistemas incluidos) describen CÓMO está construido, no cambian QUÉ ES el artículo. Si un dato del importador contradice la descripción inicial, prevalece el dato del importador; pero los detalles técnicos nunca convierten el artículo en un tipo distinto al declarado en su nombre.\n" +
  "5. PARTE Y APARATO PADRE: Si la descripción identifica el componente y, en la misma frase, el aparato o máquina al que pertenece, no repreguntes cuál es el aparato padre. Clasificá en partes de ese aparato según el nomenclador.\n" +
  "6. PARTE VS APARATO COMPLETO: Si HECHOS nombra solo un componente o repuesto sin declarar el aparato entero, tratá el artículo como parte suelta; no preguntes si es el aparato completo.\n" +
  "7. MÁQUINA COMPLETA: Si HECHOS declara un aparato o máquina completa, la propulsión declarada es dato accesorio y NO redefine el artículo. Clasificá por la función del aparato nombrado. Entre subpartidas de la misma partida, prevalece la que nombre la función del aparato sobre ramas genéricas o residuales de otra función.\n";

export const PRINCIPIO_PARTIDA_ESPECIFICA =
  "RGI 1: Clasificá en la partida/subpartida que describa el artículo nombrado en HECHOS.\n" +
  "RGI 3 b): Si HECHOS declara una función o material principal, clasificá en la línea que describa esa función/material. No elijas una línea secundaria argumentando mayor especificidad.\n" +
  "PARTES VS MÁQUINAS COMPLETAS: Si HECHOS describe un componente suelto, NO asumas que es la máquina completa. Si describe una máquina completa, NO clasifiques en la partida de sus partes. Si hay duda, preguntá si se trata del equipo completo o de un repuesto/componente suelto.\n" +
  "PARTES DE APARATOS INTEGRADOS: Si el artículo es parte de un aparato específico con función propia, se clasifica como parte de ESE aparato, INCLUSO SI el aparato completo se usa dentro de una máquina mayor. Nunca lo clasifiques como parte de la máquina mayor.\n" +
  "PARTES VS ARTÍCULO GENÉRICO: Si el listado incluye una partida de partes cuyas SIM encajan con una clave discriminante de HECHOS y también hay otra partida cuyo encabezado NO es de partes, no cierres en la partida genérica sin fundamento legal pleno. Si falta identificar el aparato padre para elegir subpartida dentro de la partida de partes, devolvé faltaDato pidiendo qué aparato o máquina es (nombre o función; sin pedir NCM salvo que el importador ya lo haya declarado).\n" +
  "No desplaces a «Partes» cuando la mercadería está comprendida en otra partida como artículo específico por su propia naturaleza, salvo que HECHOS indique que es un componente exclusivo que no constituye el artículo completo.\n" +
  "Si un artículo está compuesto de una materia específica pero tiene una función propia y el nomenclador le dedica una partida por su tipo o función, prevalece esa partida sobre la partida del material, salvo disposición legal en contrario. Aunque ambas líneas sean residuales, la partida del tipo de artículo es más específica que la del material cuando el nomenclador nombra ese tipo de artículo explícitamente.\n" +
  "ENCABEZADO VS SUBPARTIDA (RGI 1 y 6): Clasificá según el texto legal de la subpartida o línea concreta del listado, no solo por palabras del encabezado de 4 dígitos. Si una condición figura en el encabezado de la partida pero no en el texto legal de la subpartida candidata ni en HECHOS, no descartes esa subpartida por esa condición del encabezado. Una rama tipificada del listado prevalece sobre el alcance aparente del encabezado de partida cuando su texto intermedio encaja con HECHOS.\n" +
  "CALIFICATIVO GENERAL DEL ENCABEZADO: Un alcance, adjetivo o limitación genérica del encabezado de partida (4 dígitos) no descarta una rama tipificada del listado si HECHOS declara el tipo, la operación o la función que esa rama describe. Solo descartá la rama cuando HECHOS contradice explícitamente su texto legal, no por no repetir un calificativo general del encabezado que no figura en HECHOS.\n" +
  "RAMA TIPIFICADA: Si el listado muestra ramas con encabezados intermedios que nombran un tipo, una operación o una función del aparato, esa tipificación forma parte del texto legal de cada SIM de la rama. Compará candidatos por la rama completa provista, no solo por la hoja SIM.\n" +
  "APARATO VS MATERIAL: Si el nombre facturado en HECHOS designa un artículo con función propia como aparato o mecanismo, clasificá como APARATO aunque HECHOS mencione el material de fabricación o del elemento funcional interno. Solo preguntá aparato vs material si HECHOS nombra únicamente una materia o insumo sin función propia y los candidatos incluyen tanto partidas de materia prima como de aparato.\n";

export const PRINCIPIO_CIERRE =
  // Regla más crítica primero: contradicción entre subclase y HECHOS
  "CONTRADICCIÓN SUBCLASE/HECHOS (ERROR GRAVE): Si el texto legal restringe el artículo a una variedad, tipo, material o cualidad específica Y HECHOS declara explícitamente una cualidad distinta o contraria, esa línea DEBE ser descartada (confirma:false). La línea correcta en ese caso es la residual de la misma familia, si existe en el listado.\n" +
  "RAMA TIPIFICADA VS RESIDUAL DE PARTIDA (RGI 1, 3 a) y 6): Si HECHOS declara el tipo, la operación o la función principal del aparato y el listado incluye una rama cuyo encabezado intermedio describe ese tipo u operación, clasificá en esa rama aunque la hoja SIM sea residual. Dentro de esa rama, aplicá RGI 3 a) entre hermanas específicas y la residual local. No elijas una cadena de residuales de toda la partida cuando una rama tipificada encaja con lo declarado en HECHOS sin contradicción. No descartes esa rama tipificada invocando un calificativo general del encabezado de partida que HECHOS no declara ni contradice.\n" +
  "SUBPARTIDAS HERMANAS (RGI 3 a)): Entre una línea específica y una residual de la misma rama, elegí la específica si describe el componente en HECHOS sin contradicción. Descartá primero las específicas cuyo texto legal nombra otro componente distinto. Si una específica agrega un uso más acotado, ese acotamiento no descarta la línea mientras HECHOS no declare un uso incompatible. No elijas la residual por falta de datos numéricos accesorios ni por ausencia de un dato de uso final.\n" +
  "Si compiten líneas específicas entre sí y HECHOS declara una condición que figura en el texto legal de una de ellas, elegí esa línea.\n" +
  "confirma:true si el texto legal de la línea elegida describe el artículo en HECHOS y HECHOS no lo contradice.\n" +
  "Si una línea exige una característica que HECHOS contradice explícitamente, confirma:false. Si HECHOS no la menciona, no descartes automáticamente: aplicá RGI 3 a) entre hermanas específicas y residuales.\n" +
  "MATERIAL NO DECLARADO: Si compiten líneas de partidas de materias distintas y HECHOS NO declara la materia, devolvé confirma:false y faltaDato preguntando el material. NUNCA confirma:true asumiendo una materia.\n" +
  "TIPO DE ARTÍCULO: Si el texto legal restringe a un tipo concreto y HECHOS declara explícitamente un tipo incompatible, confirma:false. No descartes una línea específica solo porque HECHOS no repita literalmente su condición, si tampoco la contradice (RGI 3 a) frente a la residual).\n" +
  "NOMBRE DEL ARTÍCULO PREVALECE SOBRE DESTINO: Si HECHOS declara el nombre del artículo importado (QUÉ ES el artículo) Y también menciona el equipo o sistema donde se usa, el NOMBRE del artículo define la partida. El dato de destino o montaje es CONTEXTO que no convierte el artículo en 'parte de' ese equipo. Si el artículo tiene nombre y función propios, clasificalo por su función declarada, no por el aparato donde se instala.\n" +
  "Si HECHOS contiene un dato que CONTRADICE explícitamente el texto legal de la partida, esa partida DEBE ser descartada (confirma:false).\n" +
  "DATOS TÉCNICOS NUMÉRICOS: Si solo faltan parámetros numéricos para distinguir entre líneas específicas hermanas, elegí la residual de ese grupo numérico si existe, o preguntá. No uses la residual de toda la familia si hay una específica compatible con el tipo declarado en HECHOS.\n" +
  "PARTES: Las partes de uso general (Nota 2 de la Sección XV) se clasifican en sus respectivas partidas. Las demás partes identificables como destinadas exclusiva o principalmente a una máquina/aparato específico se clasifican en la partida de esa máquina/aparato. NUNCA descartes una propuesta de partes argumentando que le faltan características esenciales de la máquina completa.\n" +
  "Fase 3 no formula preguntas: solo confirma:true o confirma:false con justificación legal.\n";

export const PRINCIPIO_HIPOTESIS_EN_DISPUTA =
  "Incluí cada NCM del listado cuyo texto legal encaje con lo escrito en HECHOS.\n" +
  "Puede haber varias propuestas si varias ramas encajan; una sola si solo una encaja.\n";

/** Opciones y preguntas al importador: hechos, no pistas de clasificación. */
export const REGLA_OPCIONES_SIN_CLASIFICACION =
  "Preguntas y opciones al importador: solo datos factuales de lo que ES el artículo.\n" +
  "Sin números de partida, capítulo, sección ni NCM.\n" +
  "Sin ejemplos de equipos, marcas ni listas ilustrativas en preguntas u opciones.\n" +
  "No inventes características opuestas. Si el nomenclador exige una característica, la alternativa es la ausencia de esa característica.\n";

export const REGLA_LINEAS_RESIDUALES =
  "Líneas «Los demás» / «Las demás» cierran una enumeración de tipos concretos en la misma rama. Solo clasificá en la residual cuando el artículo no encaja en ninguna hermana específica anterior: descartá las que nombran otro componente; entre las que describen el mismo componente, preferí la específica (RGI 3 a)). La residual no aplica si queda una específica compatible sin contradicción.\n" +
  "RESIDUAL LOCAL VS RESIDUAL GLOBAL: Una hoja residual pertenece solo a la rama cuyos encabezados intermedios figuran en el listado antes de esa hoja. Leé la rama legal completa de cada candidato; el discriminante puede estar en un nivel intermedio, no en la hoja. Una residual bajo un encabezado que tipifica el artículo en HECHOS prevalece sobre una residual de ramas genéricas o de toda la partida que no comparten esa tipificación.\n" +
  "RGI 3 c): si HECHOS indica que dos o más funciones/materiales tienen igual importancia, clasificá en la última partida por orden de numeración.\n";

/** Fase 1 — plan de hechos (una sola llamada, árbol de preguntas). */
export const REGLAS_FASE1_PLAN =
  "Fase 1 — PLANIFICÁ UN ÁRBOL DE PREGUNTAS para recopilar los datos que faltan:\n" +
  "- OBJETIVO: identificar qué dato factual falta para discriminar entre las PARTIDAS CANDIDATAS. Si HECHOS ya alcanza para discriminarlas → hechosCompletos:true, preguntas:[]. Si no → hechosCompletos:false y preguntas (el mínimo necesario, hasta 5).\n" +
  "- ORDEN: de lo general a lo particular. Hay DOS preguntas de completitud distintas que no se pueden saltar:\n" +
  "  1. ¿El artículo se importa como UNIDAD INDEPENDIENTE o forma parte de un conjunto mayor que se importa todo junto? (cómo se importa)\n" +
  "  2. ¿El artículo es el APARATO/DISPOSITIVO COMPLETO con toda su estructura propia, o solo el ELEMENTO/COMPONENTE INTERNO que cumple la función activa dentro de ese aparato, sin estructura propia? (qué es el artículo)\n" +
  "  Confirmar que se importa como unidad independiente (pregunta 1) NO responde si es el aparato completo o solo el elemento interno (pregunta 2). Ambas preguntas son obligatorias si los candidatos incluyen la partida del aparato completo Y la partida del elemento/material interno. Solo después de responder ambas podés preguntar material, parámetros o dimensiones.\n" +
  "- EL ARTÍCULO a clasificar es lo que HECHOS nombra directamente como mercadería importada. Si la descripción indica uso o destino con preposición, eso es contexto de montaje, NO redefine el artículo. No hagas preguntas sobre ese contexto; preguntá solo características del artículo en sí.\n" +
  "- CONTEXTO YA DECLARADO: Si HECHOS ya incluye el equipo o uso de destino, ese dato ya orienta la familia arancelaria. No generes nodos del árbol para volver a preguntarlo. Con destino + naturaleza del artículo + material + estado (suelto/completo), cerrá la rama con consecuencia:'listo' cuando alcanza para discriminar.\n" +
  "- DESTINO DE MONTAJE: Si el nombre del artículo importado ya describe QUÉ ES el artículo (su tipo y función), no hagas preguntas sobre a qué equipo va montado ni qué aparato lo usa. El destino de uso es contexto, no define la partida del artículo. Solo preguntá sobre el aparato de destino cuando el artículo NO tenga función propia declarada en su nombre y la clasificación arancelaria DEPENDA directamente de ese aparato.\n" +
  "- NOMBRE DEL ARTÍCULO: Si la descripción facturada ya nombra un aparato, máquina o mecanismo con función propia, ese nombre declara el artículo completo. No preguntes si es material en bruto ni sobre completo vs suelto salvo contradicción explícita en HECHOS.\n" +
  "- NO REPITAS lo que ya está en HECHOS. Si un dato ya fue declarado, no lo vuelvas a preguntar en ningún nodo del árbol.\n" +
  "- NO VUELVAS A PREGUNTAR LO MISMO CON OTRAS PALABRAS. Si HECHOS ya incluye una respuesta sobre completo vs suelto, sobre función principal, sobre uso/destino o sobre cualquier otra característica, no generes ningún nodo en el árbol con esa pregunta reformulada.\n" +
  "- UNA PREGUNTA = UN DATO. No mezcles características distintas en una sola pregunta ni agrupes tipos en una sola opción. Si el nomenclador distingue entre N tipos mutuamente excluyentes, cada uno va como opción separada.\n" +
  "- Cada pregunta: id (\"1\",\"2\",…), pregunta, opciones, rutas[{opcion, consecuencia}]. consecuencia: \"pregunta:ID\" (siguiente id) o \"listo\" (con eso alcanza). Incluí en el array todas las preguntas referenciadas en las consecuencias.\n" +
  "- OPCIONES: datos factuales del artículo IMPORTADO (material, función, estado, dimensión, uso). Las opciones deben describir EL ARTÍCULO EN SÍ MISMO — nunca el fluido, sustancia, materia o equipo con el que trabaja o donde se usa el artículo. Sin números de partida ni NCM. MÁXIMO 4 OPCIONES POR PREGUNTA: si hay más posibilidades, agrupá las menos probables en una opción residual ('Otro material', 'Otro tipo', etc.). ORDENAR las opciones de más probable a menos probable para el artículo descrito en HECHOS: la primera opción debe ser la que mejor corresponde al nombre y contexto del artículo tal como está declarado. Las opciones residuales o poco típicas van al final.\n" +
  "- No devolvés partida ni NCM.\n";

/** Fase 2 — propuestas en parquet. */
export const REGLAS_FASE2_PROPUESTAS =
  "Fase 2 — PROPUESTAS:\n" +
  "- Listado: líneas del nomenclador que comparten al menos una palabra con HECHOS.\n" +
  "- Incluí cada NCM del listado cuyo texto legal encaje con lo escrito en HECHOS (pueden ser varias).\n" +
  "- FUNCIÓN PRINCIPAL: Si HECHOS declara la función principal del artículo en su nombre, buscá primero los NCMs que describan esa función. Los datos técnicos adicionales (componentes, materiales, sistemas auxiliares) son características del artículo, no justifican clasificarlo en una partida diferente a la de su función declarada.\n" +
  "- EVALUACIÓN POR PARTIDA: Antes de cerrar propuestas, revisá el ENCABEZADO DE CADA PARTIDA (4 dígitos) del listado, no solo las líneas individuales. Si el encabezado de una PARTIDA describe el tipo o la función del artículo en HECHOS (aunque con sinónimos o términos equivalentes), debés incluir al menos un NCM de esa partida en propuestas. No omitas una partida completa porque sus líneas individuales sean genéricas; el encabezado es el indicador principal de si aplica.\n" +
  "- INCLUIR RESIDUAL: Cuando proponés una línea específica de una partida, incluí también la línea residual de la misma familia si existe en el listado. El cruce legal decidirá cuál aplicar según los datos disponibles.\n" +
  "- PARTIDA DE ARTÍCULO VS PARTIDA DE MATERIAL: Si el nomenclador tiene una partida dedicada al TIPO DE ARTÍCULO y también hay partidas del MATERIAL con el que está fabricado, la partida del tipo de artículo prevalece. Incluí siempre al menos un NCM de la partida del tipo de artículo aunque su línea sea residual ('Los demás'), junto con los NCMs de material que también encajen.\n" +
  "- El texto legal del NCM debe describir el ARTÍCULO importado (lo que se factura), no el equipo donde se monta o usa. Si HECHOS menciona una máquina como contexto de uso, eso no convierte al artículo en parte de esa máquina.\n" +
  "- APARATO COMPLETO VS COMPONENTE SUELTO: Si el texto legal describe un aparato o máquina COMPLETA y usa parámetros técnicos para graduar tipos (potencia, diámetro, capacidad, caudal, peso u otros), esa línea clasifica el aparato entero, no un repuesto o componente suelto. Si HECHOS declara componente, repuesto o parte suelta, descartá líneas de aparato completo y buscá la subpartida de partes o la línea del componente según el nomenclador.\n" +
  "- Si el texto legal exige una condición no escrita en HECHOS, no la incluyas.\n" +
  "- Si ninguna encaja → propuestas:[].\n" +
  REGLA_LINEAS_RESIDUALES;

export const INSTRUCCION_CIERRE_FORZADO =
  "Con los datos disponibles en HECHOS, elegí el NCM más específico cuyo texto legal encaje. " +
  "Solo usá una línea residual si ninguna específica encaja. confirma:true obligatorio.\n";

export const CRITERIO_PARQUET =
  "Solo códigos del listado. RGI 1: encaje con la descripción legal de la línea elegida.\n" +
  "RGI 3 a): la subpartida específica prevalece sobre la genérica o residual cuando describe el artículo en HECHOS y su texto legal no es contradicho por HECHOS.\n" +
  "RGI 6: compará el texto legal de la rama completa del candidato en el listado, incluidos sus encabezados intermedios, no solo la hoja SIM.\n";

/** Cómo usar el listado de candidatos en el cruce (formato del paquete del motor). */
export const INSTRUCCION_LECTURA_LISTADO =
  "LISTADO DE CANDIDATOS: cada bloque `[subpartida]` puede incluir «Tipificación legal» (encabezados intermedios de la rama) y «Rama común» (prefijo compartido por hermanas). " +
  "Ambos forman parte del texto legal discriminante junto con cada línea SIM. " +
  "No elijas un NCM solo porque la hoja diga «Los demás» o «Las demás»; compará primero qué tipificación o rama encaja con el tipo u operación declarada en HECHOS.\n";

/** Fase 3 — cruce legal. */
export const INSTRUCCION_CRUCE =
  PRINCIPIO_ARTICULO_CLASIFICADO +
  PRINCIPIO_HECHOS +
  PRINCIPIO_PARTIDA_ESPECIFICA +
  PRINCIPIO_CIERRE +
  CRITERIO_PARQUET +
  INSTRUCCION_LECTURA_LISTADO +
  PRINCIPIO_HIPOTESIS_EN_DISPUTA +
  REGLA_LINEAS_RESIDUALES +
  "Fase 3 — CRUCE: leé MARCO LEGAL y texto legal de cada propuesta.\n" +
  "Descartá propuestas que exijan en HECHOS algo no escrito.\n" +
  "Varias propuestas: elegí UNA; en descartadas, motivo legal (RGI 3 a) si aplica).\n" +
  "Elegí ncm literal. Fundá con RGI y notas.\n";
