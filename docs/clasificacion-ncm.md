# Clasificación arancelaria (NCM) — Reglas Generales de Interpretación

> Marco legal de la clasificación. La posición NO se elige "por lo más común":
> se determina aplicando las RGI EN ORDEN.
>
> Fuente: texto actualizado de la **Nomenclatura Común del MERCOSUR (NCM)**,
> **Decreto 557/2023** y modificatorias (InfoLEG). El Sistema Armonizado (OMA/WCO)
> define los primeros 6 dígitos; el MERCOSUR el 7°/8° y Argentina el sufijo SIM.
>
> Fuentes oficiales:
> - InfoLEG — NCM (texto actualizado): https://www.infoleg.gob.ar
> - OMA/WCO — Sistema Armonizado: https://www.wcoomd.org
>
> El texto íntegro descargado está en `data/Nomenclatura/reglas_generales_interpretacion.txt`.

## Reglas Generales de Interpretación (RGI)

1. Los **títulos** de Secciones, Capítulos y Subcapítulos son solo indicativos. La
   clasificación está determinada legalmente por los **textos de las partidas** y por
   las **Notas de Sección y de Capítulo**.
2. a) El artículo **incompleto o sin terminar** se clasifica como el completo si ya
   presenta sus **características esenciales**; ídem el **desmontado o sin montar**.
   b) La referencia a una **materia** alcanza a sus mezclas/combinaciones, y a las
   manufacturas hechas total o parcialmente de ella; si lleva a varias partidas, se
   resuelve por la Regla 3.
3. a) La partida **más específica** prevalece sobre la genérica.
   b) Si no, por la materia/componente que da el **carácter esencial**.
   c) Si tampoco, la **última partida por orden de numeración** entre las posibles.
4. Si nada de lo anterior resuelve: partida de las mercancías con **mayor analogía**.
5. a) Estuches/continentes presentados con su artículo siguen a ese artículo (salvo
   que den el carácter esencial al conjunto).
   b) Los envases normales se clasifican con la mercadería (salvo reutilizables).
6. Las **subpartidas** solo se comparan entre las del **mismo nivel**, según sus textos
   y Notas de subpartida (y las Notas de Sección/Capítulo).

## Reglas Generales Complementarias (Mercosur)

- **RGC 1:** las RGI se aplican *mutatis mutandis* para determinar la subpartida
  regional y el ítem, comparando solo desdoblamientos del mismo nivel.
- **RGC 2:** los envases reutilizables bajo admisión/exportación temporaria siguen su
  propio régimen; si no, el de la mercadería.

## Cómo lo usa el sistema

- Principios de flujo (Fase A/B, hechos, preguntas): `src/lib/clasificador/principios-clasificacion.ts`
- Marco legal RGI/RGC + notas en Fase B: `src/lib/clasificador/marco-legal.ts` (inyectado en `cruzarPropuestas`)
- Prompts de IA: `src/lib/clasificador/ia.ts`
- Menú nomenclador: `src/lib/clasificador/motor.ts` contra `data/Nomenclatura/ncm.parquet` (sin score; corpus completo por partida)
- El **arancel (DI)** no lo inventa la IA: se ancla al parquet.
- Si falta un hecho factual, la IA pregunta; cierre definitivo solo con `confirma:true` en Fase B.
- NCM de equipo padre: solo si el operador la declaró (pregunta o contexto de sesión); no se infiere del texto del producto.
- Rivales en Fase B: hermanos del árbol NCM o partidas en juego explícitas (no por tokens sueltos).
