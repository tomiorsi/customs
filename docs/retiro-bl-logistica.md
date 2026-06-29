# Retiro del documento de transporte y primer pago de logística

Guía operativa para importaciones en Argentina (2026). El motor del despachante,
la IA y el paso a paso de la etapa 3 (embarque) se adaptan según **vía**,
**forma de pago** (cómo paga el comprador al vendedor) y **tipo de liberación**
del documento de transporte.

## Principio general

- **Tributos (VEP):** los paga el cliente **aparte**, en liquidación/oficialización.
  No entran en el pago de logística de destino.
- **Logística en destino:** el cliente **debe abonarla** (no es opcional ni
  “sugerida”). Cubre lo que el despachante/forwarder paga por su cuenta: handling,
  orden de entrega, terminal, depósito fiscal, etc.
- **Carta de garantía (marítimo FCL):** requisito **documental** para retirar el
  contenedor (anual o puntual ante escribano). No es un depósito en efectivo.

---

## Marítimo (BL)

### Documentos clave

| Documento | Rol |
|-----------|-----|
| **BL** (conocimiento de embarque) | Documento de transporte. Puede ser negociable (original) o telex release / sea waybill. |
| **Aviso de arribo** | Aviso de llegada del buque + **factura de gastos** (import invoice) de naviera/agente. |
| **Orden de entrega / Delivery order** | Autoriza retirar la carga. Se obtiene **después** de pagar los gastos locales. |
| **Carta de garantía** | Habilita retiro del contenedor vacío (naviera). |

### ¿El aviso de llegada es el primer cobro en destino?

**Sí, en el caso habitual** (pago anticipado o cuenta abierta, sin banco en el medio):

1. Llega el BL (draft → definitivo).
2. Al arribar (o antes), llega el **aviso de arribo** con la factura de gastos.
3. Con ese aviso se **cobra la logística** al cliente y se paga la liberación
   (handling, BL fee, delivery order, ISPS, terminal…).
4. Se obtiene la **orden de entrega**.
5. Con carta de garantía firmada, se retira el contenedor.

**Excepciones que van ANTES del aviso:**

| Situación | Qué bloquea el retiro |
|-----------|----------------------|
| **Cobranza D/P o carta de crédito** | El **banco** debe liberar el BL original o dar carta de liberación. Sin eso, no hay orden de entrega aunque haya aviso. |
| **BL original negociable** | Debe estar el **original físico** en destino (o telex release del shipper). |
| **Telex release / sea waybill** (anticipado, cuenta abierta) | El BL ya está liberado al embarcar; el aviso es el primer cobro operativo. |

### Secuencia típica por forma de pago (marítimo)

**Pago anticipado / cuenta abierta + telex:**
1. BL (telex ya liberado al embarcar)
2. Aviso de arribo → **cobro logística**
3. Orden de entrega
4. Carta de garantía → retiro contenedor

**Cobranza D/P o carta de crédito + BL original:**
1. BL (negociable, en poder del banco)
2. **Levantamiento en el banco** (pago o presentación conforme)
3. BL original recibido
4. Aviso de arribo → **cobro logística**
5. Orden de entrega
6. Carta de garantía → retiro

---

## Aéreo (AWB)

- La **AWB** es **no negociable**: no hay canje de original.
- La carga se libera al consignatario con el **aviso de llegada**.
- Con el aviso se pagan: gastos del **agente de carga** (handling, TCA,
  documentación) y **depósito fiscal aeroportuario**.
- Ese es el **primer cobro operativo en destino** (misma lógica que marítimo,
  sin carta de garantía de contenedor).

**Con cobranza o L/C:** la AWB puede estar **consignada al banco**. Primero
carta de liberación del banco; después aviso y pago de logística.

---

## Terrestre (CRT + MIC/DTA)

- Documento: **CRT** (carta de porte internacional), no negociable.
- Tránsito aduanero: **MIC/DTA** en SINTIA (ruta, plazo, CRT asociada).
- Al **arribo en frontera/destino**: verificación de **precinto**, **pesaje**,
  pago de gastos del agente/transportista y depósito fiscal.
- El “aviso” puede ser la factura del transportista o del depósito fronterizo
  (no siempre un PDF titulado “aviso de llegada”).

**COD (contra reembolso):** más habitual en terrestre. El transportista retiene
la carga hasta cobrar el valor de la mercadería, además de los gastos de logística.

**Con cobranza/L/C:** verificar consignatario en CRT y liberación bancaria antes
del retiro en frontera.

---

## Los tres pagos (no mezclar)

| Pago | Quién lo ejecuta | Rol del despachante |
|------|------------------|---------------------|
| **Mercadería al proveedor** | Cliente → proveedor exterior | No es rol del despachante (pago entre ellos) |
| **Logística en destino** | Cliente paga al estudio; estudio paga terminal/naviera | Cotizar, cobrar y pagar por cuenta y orden |
| **Tributos (VEP)** | Cliente directo a AFIP | Liquidar y generar VEP |

### Paso de checklist según forma de pago (logística / banco)

La forma de pago se releva de la proforma o factura. Define subtareas de **banco** y **BL**,
no el pago de mercadería al proveedor:

| Forma de pago | Etapa del paso | Subtarea |
|---------------|----------------|----------|
| Cobranza D/P, L/C | Embarque | Documentos en el banco (cliente) |
| Cobranza D/A | Embarque | Aceptación en banco |
| COD | Embarque | Pago al transportista (cliente) |

---

## Qué lee la IA y cómo cambia el paso a paso

La IA extrae de factura, pedido, BL/AWB/CRT:

- `forma_pago` — condición comercial (anticipado, cuenta abierta, cobranza D/P,
  cobranza D/A, carta de crédito, COD…)
- `liberacion_doc` — original / telex / waybill; origen o destino
- `via` — marítima / aérea / terrestre

Con esos datos el sistema:

1. **Reordena** las subtareas de la etapa 3 (banco antes del aviso si corresponde).
2. **Adapta la guía** (texto de ayuda del operador).
3. **Agrega pasos** según forma de pago: levantamiento en banco, BL original,
  consignación AWB al banco, pago COD, etc.

Los campos se **persisten** en la operación al validar documentación (Paso 2 o 3)
y el checklist se recalcula automáticamente.

---

## Referencia rápida

| Vía | Primer cobro logística en destino | Documento de transporte | Bloqueo frecuente extra |
|-----|-----------------------------------|-------------------------|-------------------------|
| Marítimo | Aviso de arribo / factura naviera | BL | Banco + original + carta garantía |
| Aéreo | Aviso de llegada | AWB | Banco (L/C/cobranza) |
| Terrestre | Arribo / factura transportista | CRT | Banco, COD, precinto/pesaje |
