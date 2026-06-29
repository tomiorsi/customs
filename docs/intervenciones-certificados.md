# Intervenciones de terceros organismos — validar los certificados

> Qué organismos intervienen NO se adivina: surge de **VUCE por NCM** (ya está en
> `data/VUCE/` y se expone vía `src/lib/requisitos.ts`). Este documento es para
> **validar el certificado/documento** que el cliente presenta, sin inventar
> requisitos por organismo.
>
> Marco: regímenes de intervención por NCM publicados en la **VUCE** (Ventanilla
> Única de Comercio Exterior) y normas de cada organismo. Fuente operativa:
> https://www.argentina.gob.ar/vuce

## Regla general de validación (conservadora)

Para un certificado de intervención, controlá SOLO lo verificable y objetivo:

1. **Corresponde al producto/NCM** de la operación (descripción coherente).
2. Está **emitido por / dirigido al organismo** que figura en la lista oficial de
   VUCE para esa NCM (no inventes organismos que no estén en esa lista).
3. Si muestra **fecha de validez/vencimiento**, que esté **vigente**.
4. Cuando aplica, **nombra al importador** (razón social / CUIT) y la operación.

**No asumas requisitos de contenido específicos de cada organismo de memoria.** Si no
estás seguro de si un certificado cumple lo que pide un organismo, marcá **"a
verificar por el despachante"** (no lo des por faltante ni por cumplido).

## Qué controla cada organismo (alto nivel — los detalles, al trámite VUCE)

- **SENASA** — productos de origen animal o vegetal: controles fito/zoosanitarios.
  Suele requerir **certificado fitosanitario / zoosanitario** de origen y, según el
  producto, **registro o autorización previa** de importación.
- **ANMAT / INAL** — alimentos, cosméticos, productos médicos, medicamentos: suele
  requerir **registro del producto y del establecimiento** (RNPA/RNE para alimentos)
  y **autorización** de importación.
- **INV** — vinos, mostos y alcoholes: registro/análisis del Instituto Nacional de
  Vitivinicultura.
- **ANMaC** — armas, municiones y pólvoras: autorización específica.
- **Secretaría de Ambiente / CITES** — especies de fauna y flora protegidas:
  permisos CITES.
- **Encomiendas técnicas / seguridad eléctrica, gas, etc.** — certificaciones de
  seguridad (según el régimen que liste VUCE).

> Esta lista es orientativa de "qué controla" cada organismo. El requisito EXACTO,
> el formulario y el organismo aplicable a una NCM concreta salen de la VUCE
> (datos del sistema), no de esta guía.
