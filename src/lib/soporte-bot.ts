import "server-only";
import { MAPA_PORTAL, contextoDeCuenta, textoPlanes } from "./soporte-contexto";
import type { MensajeSoporte } from "./soporte";

/**
 * Bot de soporte.
 *
 * Corre en Haiku: las consultas son cortas, el contexto entra holgado en su
 * ventana y responde rápido, que es lo que importa en un chat en vivo.
 *
 * La decisión de derivar se toma con una herramienta, no leyendo el texto de la
 * respuesta: pedirle que escriba «DERIVAR» y buscar esa palabra falla el día que
 * el modelo la menciona al explicar algo. Con la herramienta, derivar es una
 * señal estructurada que además trae el resumen ya escrito para el mail.
 */

const MODELO = process.env.ANTHROPIC_MODEL_SOPORTE || "claude-haiku-4-5";

/** Turnos de historial que se le pasan. Alcanza para el hilo de una consulta. */
const MAX_HISTORIAL = 12;

export type RespuestaBot =
  | { tipo: "responde"; texto: string }
  | { tipo: "deriva"; texto: string; resumen: string; motivo: string };

const HERRAMIENTA_DERIVAR = {
  name: "derivar_a_humano",
  description:
    "Derivá la consulta a una persona del equipo. Usala cuando no puedas resolver " +
    "con la información que tenés: un problema técnico que necesita revisar la " +
    "cuenta por dentro, un error que no se explica con la documentación, un " +
    "reclamo de facturación o cobro, un pedido de reembolso o baja, cualquier " +
    "cosa que requiera cambiar datos que el usuario no puede cambiar solo, o si " +
    "el usuario pide hablar con una persona. No la uses para preguntas que ya " +
    "podés responder con el mapa del portal o los datos de la cuenta.",
  input_schema: {
    type: "object",
    properties: {
      resumen: {
        type: "string",
        description:
          "Resumen del problema para el equipo, en 2 a 4 oraciones. Incluí qué " +
          "pidió el usuario, qué se intentó y qué quedó sin resolver. Escribilo " +
          "para alguien que no leyó la conversación.",
      },
      motivo: {
        type: "string",
        description:
          "Por qué hace falta una persona, en una frase corta. Ej: 'requiere " +
          "revisar el estado de la cuenta en la base'.",
      },
    },
    required: ["resumen", "motivo"],
  },
} as const;

function systemPrompt(contexto: ReturnType<typeof contextoDeCuenta>): string {
  const datos = contexto
    ? [
        `- Nombre: ${contexto.nombre}`,
        `- Email: ${contexto.email ?? "sin email"}`,
        `- Tipo de cuenta: ${
          contexto.esEquipo
            ? contexto.esDuenoEstudio
              ? "despachante, dueño de su estudio"
              : "subcuenta (empleado) de un estudio"
            : "cliente importador"
        }`,
        `- Suscripción: ${contexto.suscripcion}`,
        contexto.esEquipo ? `- Clientes en su cartera: ${contexto.clientes}` : null,
        contexto.esEquipo ? `- Subcuentas del estudio: ${contexto.subcuentas}` : null,
        contexto.esDuenoEstudio
          ? `- Datos de facturación: ${contexto.facturacionCompleta ? "completos" : "INCOMPLETOS (le van a faltar para contratar)"}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "- No se pudieron cargar los datos de la cuenta.";

  return `Sos el soporte de un portal de comercio exterior para despachantes de aduana argentinos. Atendés por chat.

TONO: sos un profesional de atención al cliente. Tratás de vos, en español rioplatense, con registro cuidado y cordial.

- Frases completas y bien escritas. Nada de "Ey", "che", "dale", "ojo", "posta" ni jerga.
- Saludo breve y con respeto solo en el primer mensaje del hilo: "Hola, buen día. ¿En qué puedo ayudarte?". Después vas al grano, sin volver a saludar.
- Cortés sin ser servil: no encadenes "¡Claro que sí!", "¡Excelente pregunta!" ni signos de admiración de más.
- Cuando algo falla o el usuario está molesto, reconocelo una vez, con sobriedad ("Lamento el inconveniente"), y pasá a resolver. No te disculpes en cada oración.
- Nunca respondas con una sola palabra ni con una pregunta seca. Aunque tengas que pedir un dato, encuadralo: decí para qué lo necesitás.
- 1 a 4 oraciones. Si explicás un procedimiento, pasos numerados y cortos.
- Cerrás ofreciendo seguir solo cuando aporta: "Si te queda alguna duda, decime."

Escribís en texto plano. El chat no renderiza markdown: nada de asteriscos para negrita, ni almohadillas, ni backticks — se ven literales y quedan feos. Para nombrar una sección usá comillas simples o simplemente su nombre.

DATOS REALES DE QUIEN TE ESCRIBE (usalos, no los repitas de memoria si no vienen al caso):
${datos}

MAPA DEL PRODUCTO:
${MAPA_PORTAL}

PLANES:
${textoPlanes()}

CÓMO TRABAJAR:
1. Si la respuesta está en el mapa del portal o en los datos de la cuenta, respondé directo y decile exactamente dónde tocar. Aprovechá los datos reales: si pregunta por su prueba, decile cuántos días le quedan de verdad.
2. Si te falta un dato para responder, hacé UNA sola pregunta concreta. No interrogues.
3. Si no se puede resolver sin que una persona mire la cuenta por dentro, usá la herramienta derivar_a_humano.

REGLA DE HIERRO SOBRE DERIVAR — una sola repregunta:
Si en este hilo ya pediste un dato y la persona te respondió, DERIVÁ con lo que tengas. No pidas más precisiones, números completos ni detalles adicionales para escalar: el equipo abre la cuenta y ve todo, no necesita que el usuario le arme el expediente. Pedir dato tras dato es la peor experiencia posible y hace que la persona abandone.

DERIVÁ EN EL PRIMER MENSAJE, SIN PREGUNTAR NADA, cuando el usuario:
- Pide hablar con una persona, con un humano, o dice que no quiere un bot. No le preguntes para qué: derivá y avisale que lo derivaste.
- Reporta que algo desapareció, se borró, no carga o da error.
- Reclama un cobro, un cobro duplicado, un reembolso o una factura que no llegó.
- Pide dar de baja la cuenta o borrar sus datos.
- Está claramente molesto o es el segundo mensaje seguido sobre el mismo problema.

En todos esos casos el equipo abre la cuenta y ve el detalle solo. Pedirle datos a la persona antes de escalar la hace repetir información que el equipo ya tiene delante, y es exactamente lo que hace que alguien odie un soporte automático.

Repreguntá UNA sola vez, y únicamente cuando sin ese dato no se entiende siquiera de qué se trata el pedido.

NUNCA inventes: precios distintos a los de arriba, secciones que no figuran en el mapa, plazos, ni políticas de reembolso. Si no lo sabés, derivá.
No prometas plazos de respuesta concretos.
No des asesoramiento aduanero ni clasificación arancelaria: para eso está el Nomenclador, y las dudas de fondo las ve un despachante.`;
}

type BloqueRespuesta =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: Record<string, unknown> };

/**
 * Responde un mensaje de soporte. Devuelve null si la IA no está disponible o
 * falla: el llamador cae al acuse automático y la consulta igual queda guardada.
 */
export async function responderSoporte(
  cuentaId: string,
  historial: MensajeSoporte[],
): Promise<RespuestaBot | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const mensajes = historial.slice(-MAX_HISTORIAL).map((m) => ({
    role: m.origen === "usuario" ? ("user" as const) : ("assistant" as const),
    content: m.texto,
  }));
  if (!mensajes.length || mensajes[0].role !== "user") return null;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 700,
        system: systemPrompt(contextoDeCuenta(cuentaId)),
        tools: [HERRAMIENTA_DERIVAR],
        messages: mensajes,
      }),
    });
    if (!resp.ok) return null;

    const data = (await resp.json()) as { content?: BloqueRespuesta[] };
    const bloques = data.content ?? [];
    const texto = bloques
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text.trim())
      .filter(Boolean)
      .join("\n\n");
    const derivar = bloques.find(
      (b): b is { type: "tool_use"; name: string; input: Record<string, unknown> } =>
        b.type === "tool_use" && b.name === "derivar_a_humano",
    );

    if (derivar) {
      const resumen = String(derivar.input.resumen ?? "").trim();
      const motivo = String(derivar.input.motivo ?? "").trim();
      return {
        tipo: "deriva",
        // El modelo suele llamar la herramienta sin escribir texto: el aviso al
        // usuario lo pone el sistema para que sea siempre el mismo y no dependa
        // de que esta vez se le haya ocurrido redactarlo.
        texto:
          texto ||
          "Esto lo tiene que ver una persona del equipo. Ya les pasé el detalle y " +
            "te vamos a escribir por mail.",
        resumen: resumen || "El usuario necesita ayuda de una persona.",
        motivo: motivo || "Sin detalle",
      };
    }

    if (!texto) return null;
    return { tipo: "responde", texto };
  } catch {
    return null;
  }
}
