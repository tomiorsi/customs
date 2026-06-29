# Valoración aduanera (importación) — reglas para validar y liquidar

> Para qué sirve: define el **valor en aduana**, la base sobre la que se calculan
> los tributos de importación. No es "lo que el cliente quiera": surge de reglas.
>
> Norma marco (vigente):
> - **Acuerdo relativo a la Aplicación del Art. VII del GATT de 1994** ("Acuerdo
>   de Valor de la OMC"), incorporado por **Ley 24.425**.
> - **Código Aduanero argentino (Ley 22.415)**, arts. de valoración, y normas de
>   ARCA/DGA (ex AFIP) reglamentarias.
>
> Fuentes oficiales (descargables):
> - OMC — Acuerdo de Valoración: https://www.wto.org/spanish/tratop_s/cusval_s/cusval_s.htm
> - Código Aduanero (InfoLEG, Ley 22.415): https://www.infoleg.gob.ar
> - ARCA (ex AFIP/DGA): https://www.arca.gob.ar
>
> ⚠️ Alícuotas/porcentajes "ficto" y montos cambian por resolución. Lo marcado con
> «verificar %» debe confirmarse contra la norma vigente antes de tratarlo como dato duro.

## 1. Base del valor en aduana

- El método principal es el **valor de transacción**: el precio realmente pagado o
  por pagar por la mercadería, ajustado según los arts. 1 y 8 del Acuerdo OMC.
- En Argentina la base imponible se arma en condición **CIF** (mercadería + flete +
  seguro hasta el lugar de importación).
- Si no se puede usar el valor de transacción, se aplican los métodos secundarios
  **en orden** (mercadería idéntica, similar, deductivo, reconstruido, último
  recurso). No saltees el orden.

## 2. Ajustes al valor (Art. 8) — se SUMAN si no están ya en el precio

- Comisiones y corretajes, **excepto las comisiones de compra**.
- Envases y embalajes.
- Bienes y servicios aportados por el comprador (assists): materiales, herramientas,
  moldes, ingeniería/diseño hechos fuera del país de importación.
- **Cánones y regalías** (royalties / license fees) relacionados con la mercadería
  que el comprador deba pagar como condición de venta.
- Producto de la reventa que revierta al vendedor.
- Flete, seguro y gastos conexos hasta el lugar de importación (para llegar al CIF).

> No inventes ajustes: solo sumá los que estén respaldados por los documentos
> (contrato, factura, acuerdo de licencia). Si sospechás un canon/assist pero no
> hay respaldo, dejalo como "a verificar por el despachante", no como dato cierto.

## 3. Flete y seguro

- **Flete:** se toma el real (cotización/factura del transporte). Si el Incoterm ya
  lo incluye (grupos C/D), está dentro del precio.
- **Seguro:**
  - Si hay **póliza/certificado**, se usa el valor real.
  - Si el Incoterm **incluye** seguro (CIF, CIP), viene en el precio.
  - Si **no** hay seguro contratado ni incluido (FOB, CFR, FCA, EXW…), la aduana
    admite un **seguro ficto / teórico** (estimación). El sistema usa **1% sobre
    (FOB + flete)** como respaldo. «verificar %» contra la norma vigente.
- **La póliza de seguro NO es un documento obligatorio para oficializar.** Su
  ausencia NO bloquea: se aplica el seguro ficto. No la pidas como requisito salvo
  que el Incoterm la implique o el cliente la tenga.

## 4. Errores a evitar al validar (para la IA)

- NO exijas póliza de seguro como obligatoria cuando el Incoterm no la incluye:
  corresponde el seguro ficto.
- NO sumes ajustes (cánones, assists, comisiones) que no estén documentados.
- NO declares "valor inconsistente" solo porque la factura sea FOB/CFR y falte el
  seguro: eso es normal y se resuelve con el ficto.
- El valor del certificado de origen debe coincidir con el de la factura que cita;
  diferencias de redondeo menores no son inconsistencia.
- Si dudás de un ajuste o método, marcá "a verificar por el despachante" (no lo
  trates como obligación ni bloquees la oficialización).
