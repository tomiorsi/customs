const producto = process.argv[2]?.trim();
if (!producto) {
  console.error("Uso: node test-api.mjs <descripción del artículo>");
  process.exit(1);
}

const res = await fetch("http://localhost:3000/api/clasificar", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ producto, debug: true }),
});
console.log(await res.json());
