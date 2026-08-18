/**
 * Batería de conversaciones contra el bot de soporte.
 *
 * Cada caso arranca un hilo limpio y espera un desenlace: RESUELVE (contesta
 * con lo que sabe), PREGUNTA (pide el dato que falta) o DERIVA (llama a la
 * herramienta). Se mide contra ese esperado, y se revisa el tono: un bot que
 * deriva de más molesta al equipo, y uno que deriva de menos deja al usuario
 * sin salida.
 *
 * Uso:
 *   set -a; . ./.env; set +a
 *   node scripts/probar-soporte-bot.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const db = new Database(path.join(process.cwd(), "data/app.db"));

const CASOS = [
  // — Debería resolver con el mapa del portal o los datos de la cuenta —
  ["hola", "RESUELVE"],
  ["cuantos dias me quedan de prueba?", "RESUELVE"],
  ["cuanto sale el plan mas barato?", "RESUELVE"],
  ["donde veo mis clientes?", "RESUELVE"],
  ["como le doy acceso al portal a un cliente mio", "RESUELVE"],
  ["mi cliente puede ver sus operaciones en tiempo real?", "RESUELVE"],
  ["donde cambio mi contraseña", "RESUELVE"],
  ["como pongo el modo oscuro", "RESUELVE"],
  ["que pasa cuando se me termina la prueba, pierdo los datos?", "RESUELVE"],
  ["que necesito para contratar un plan", "RESUELVE"],
  ["mi empleado puede ver mis clientes?", "RESUELVE"],
  ["otro despachante puede ver mi cartera?", "RESUELVE"],
  ["donde le doy de alta a un cliente nuevo", "RESUELVE"],
  ["el cliente tiene chat conmigo en el portal?", "RESUELVE"],
  ["para que sirve el nomenclador", "RESUELVE"],

  // — Debería derivar —
  ["me cobraron dos veces el plan, quiero que me devuelvan la plata", "DERIVA"],
  ["quiero dar de baja mi cuenta y que borren todos mis datos", "DERIVA"],
  ["se me borraron tres operaciones de la nada, no estan mas", "DERIVA"],
  ["necesito la factura del mes pasado y no me llego", "DERIVA"],
  ["quiero hablar con una persona de verdad, no con un bot", "DERIVA"],

  // — Fuera de alcance: no debe inventar asesoramiento aduanero —
  ["que posicion arancelaria le pongo a un cargador de celular?", "CUALQUIERA"],
];

/** Marcadores de un registro demasiado coloquial para atención al cliente. */
const INFORMALES = /\b(ey|che|dale|posta|bancame|joya|copado|piola|nada que ver)\b/i;

async function correr() {
  const cuenta = db
    .prepare("SELECT id, email FROM users WHERE email = ?")
    .get(process.env.QA_EMAIL);
  if (!cuenta) {
    console.error("No hay ninguna cuenta de equipo en la base para probar.");
    process.exit(1);
  }

  const cookie = await login(cuenta.email);
  const limpiar = db.prepare("DELETE FROM soporte_mensajes WHERE cuenta_id = ?");

  let ok = 0;
  const problemas = [];

  for (const [pregunta, esperado] of CASOS) {
    limpiar.run(cuenta.id); // hilo nuevo por caso: sin arrastre de contexto

    const res = await fetch(`${BASE}/api/soporte`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ texto: pregunta }),
    });
    if (!res.ok) {
      problemas.push({ pregunta, motivo: `HTTP ${res.status}` });
      continue;
    }
    const { mensajes } = await res.json();
    const respuesta = mensajes[mensajes.length - 1];
    const derivo = respuesta?.derivado === "1";
    const texto = respuesta?.texto ?? "";

    const real = derivo ? "DERIVA" : /\?$/.test(texto.trim()) ? "PREGUNTA" : "RESUELVE";
    const acierta =
      esperado === "CUALQUIERA" ||
      real === esperado ||
      (esperado === "RESUELVE" && real === "PREGUNTA");

    const informal = INFORMALES.test(texto);
    const cortito = texto.trim().split(/\s+/).length < 4;
    const conMarkdown = /\*\*|^#|`/m.test(texto);

    if (acierta && !informal && !cortito && !conMarkdown) ok++;
    else {
      problemas.push({
        pregunta,
        esperado,
        real,
        texto,
        motivo: [
          !acierta && `esperaba ${esperado}`,
          informal && "registro informal",
          cortito && "respuesta demasiado corta",
          conMarkdown && "usó markdown",
        ]
          .filter(Boolean)
          .join(", "),
      });
    }

    console.log(`\n[${real}${acierta ? "" : ` ✗ esperaba ${esperado}`}] ${pregunta}`);
    console.log(`  → ${texto.replace(/\n/g, "\n    ")}`);
  }

  limpiar.run(cuenta.id);

  console.log(`\n${"─".repeat(70)}`);
  console.log(`Correctas: ${ok}/${CASOS.length}`);
  if (problemas.length) {
    console.log("\nA revisar:");
    for (const p of problemas) {
      console.log(`- «${p.pregunta}» → ${p.motivo}`);
    }
  }
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: email, password: process.env.QA_PASSWORD }),
  });
  if (!res.ok) throw new Error("No se pudo iniciar sesión para la prueba.");
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

correr().catch((e) => {
  console.error(e);
  process.exit(1);
});
